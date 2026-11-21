"""HTTP de la Notificación SIVIGILA; nunca registra filtros ni datos de pacientes."""

from collections.abc import AsyncIterator, Callable
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.sivigila import (
    COLUMNS,
    GROUP_LABELS,
    SivigilaReport,
    SivigilaResult,
)
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.export_writers import WRITERS

_CHUNK = 2000
Event = Literal["general", "ira", "eda", "dengue", "varicela", "rabia"]


def create_sivigila_router(
    *, prefix: str, permission: str, provider: Callable[..., SivigilaReport]
) -> APIRouter:
    router = APIRouter(
        prefix=prefix,
        tags=["estadistica"],
        dependencies=[Depends(require_permission(permission))],
    )
    Report = Annotated[SivigilaReport, Depends(provider)]

    @router.get("/filters/sites", summary="Sedes disponibles para el informe")
    async def sites(report: Report) -> list[CatalogOption]:
        return await report.sites()

    @router.get("/filters/companies", summary="Empresas disponibles para el informe")
    async def companies(report: Report) -> list[CatalogOption]:
        return await report.companies()

    @router.get("/filters/product-lines", summary="Líneas de producto disponibles")
    async def product_lines(report: Report) -> list[CatalogOption]:
        return await report.product_lines()

    @router.get(
        "",
        summary="Consultar Notificación SIVIGILA",
        description=(
            "Ejecuta una sola vez la query de Signos Vitales y devuelve el análisis y todas las "
            "pestañas (general y eventos). Fechas obligatorias e inclusivas; sedes, empresas y "
            "líneas admiten parámetros repetidos."
        ),
    )
    async def consult(
        report: Report,
        fecha_inicial: Annotated[date, Query(description="Fecha inicial inclusiva")],
        fecha_final: Annotated[date, Query(description="Fecha final inclusiva")],
        sedes: Annotated[list[int] | None, Query()] = None,
        empresas: Annotated[list[int] | None, Query()] = None,
        lineas: Annotated[list[int] | None, Query()] = None,
    ) -> SivigilaResult:
        return await report.build(_filter(fecha_inicial, fecha_final, sedes, empresas, lineas))

    @router.get(
        "/export",
        summary="Exportar una pestaña de Notificación SIVIGILA (CSV o Excel)",
        response_class=StreamingResponse,
    )
    async def export(
        report: Report,
        fecha_inicial: Annotated[date, Query()],
        fecha_final: Annotated[date, Query()],
        formato: Annotated[Literal["csv", "xlsx"], Query()],
        evento: Annotated[Event, Query()],
        sedes: Annotated[list[int] | None, Query()] = None,
        empresas: Annotated[list[int] | None, Query()] = None,
        lineas: Annotated[list[int] | None, Query()] = None,
    ) -> StreamingResponse:
        result = await report.build(_filter(fecha_inicial, fecha_final, sedes, empresas, lineas))
        label = GROUP_LABELS.get(evento, "Grupo")
        headers = {key: (label if key == "grupo" else title) for key, title, _ in COLUMNS}
        columns = [ExportColumn(headers[key], kind) for key, _, kind in COLUMNS]  # type: ignore[arg-type]
        rows = [
            {headers[key]: row[key] for key, _, _ in COLUMNS} for row in result.pestanas[evento]
        ]
        writer, media_type, extension = WRITERS[formato]
        name = f"notificacion-sivigila-{evento}_{fecha_inicial}_{fecha_final}.{extension}"
        return StreamingResponse(
            writer(columns, _chunks(rows)),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{name}"',
                "Cache-Control": "no-store",
            },
        )

    return router


def _filter(
    start: date,
    end: date,
    sites: list[int] | None,
    companies: list[int] | None,
    lines: list[int] | None,
) -> ReportFilter:
    return ReportFilter(start, end, tuple(sites or ()), tuple(companies or ()), tuple(lines or ()))


async def _chunks(rows: list[dict[str, Any]]) -> AsyncIterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), _CHUNK):
        yield rows[start : start + _CHUNK]
