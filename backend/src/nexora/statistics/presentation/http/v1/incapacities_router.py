"""Permissioned table and exports for Gestión de Incapacidades."""

from collections.abc import AsyncGenerator
from contextlib import aclosing
from datetime import date
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse

from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    require_permission,
)
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.incapacities import COLUMNS, IncapacitiesFilter
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.report import Report
from nexora.statistics.domain.filters import InvalidReportFilter
from nexora.statistics.infrastructure.export_writers import WRITERS
from nexora.statistics.infrastructure.incapacities_source import SqlServerIncapacitiesSource

_PERMISSION = "statistics.administrative.disability_management.view"
incapacities_router = APIRouter(
    prefix="/statistics/administrative/disability-management",
    tags=["estadistica"],
    dependencies=[Depends(require_permission(_PERMISSION))],
)
_COLUMNS = {key: ExportColumn(label, kind) for key, label, kind in COLUMNS}
Row = dict[str, Any]


def _report(container: ContainerDep) -> Report:
    return Report(SqlServerIncapacitiesSource(container.sqlserver))


def _filters(
    fecha_inicial: Annotated[date, Query(description="Inicio de incapacidad desde (inclusive)")],
    fecha_final: Annotated[date, Query(description="Inicio de incapacidad hasta (inclusive)")],
    empresas: Annotated[
        list[int] | None, Query(description="Ids repetibles; omitir = todas")
    ] = None,
    search: Annotated[
        str, Query(max_length=4000, description="Buscar texto en todas las columnas del informe")
    ] = "",
) -> IncapacitiesFilter:
    return IncapacitiesFilter(
        fecha_inicial, fecha_final, (), tuple(empresas or ()), search=search.strip()
    )


ReportDep = Annotated[Report, Depends(_report)]
FiltersDep = Annotated[IncapacitiesFilter, Depends(_filters)]


@incapacities_router.get("/filters/companies", summary="Empresas disponibles para el informe")
async def companies(report: ReportDep) -> list[CatalogOption]:
    return await report.companies()


@incapacities_router.get(
    "",
    summary="Consultar Gestión de Incapacidades",
    responses={
        200: {
            "headers": {
                "X-Total-Count": {
                    "description": "Total de registros",
                    "schema": {"type": "integer"},
                }
            }
        }
    },
)
async def page(
    response: Response,
    report: ReportDep,
    filters: FiltersDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Row]:
    result = await report.page(filters, limit, offset)
    response.headers["X-Total-Count"] = str(result.total)
    return result.items


@incapacities_router.get(
    "/export",
    summary="Exportar Gestión de Incapacidades (CSV o Excel)",
    response_class=StreamingResponse,
)
async def export(
    report: ReportDep,
    filters: FiltersDep,
    formato: Annotated[Literal["csv", "xlsx", "txt"], Query()],
    columnas: Annotated[
        list[str],
        Query(min_length=1, max_length=len(COLUMNS), description="Columnas repetibles como id:tipo"),
    ],
) -> StreamingResponse:
    selected = {}
    for raw in columnas:
        key, _, kind = raw.partition(":")
        if not key.isidentifier() or kind not in {"text", "number", "date"}:
            raise InvalidReportFilter("Columna de exportación inválida.")
        if key not in _COLUMNS:
            raise InvalidReportFilter(f"Columnas desconocidas: {key}.")
        if key in selected:
            raise InvalidReportFilter(f"Columna duplicada: {key}.")
        selected[key] = _COLUMNS[key]

    chunks = cast(AsyncGenerator[list[Row]], report.export_chunks(filters))
    try:
        # Validate the SQL connection before sending headers.
        first = await anext(chunks, None)
    except BaseException:
        await chunks.aclose()
        raise
    writer, media_type, extension = WRITERS[formato]

    def label(chunk: list[Row]) -> list[Row]:
        return [{col.id: row[key] for key, col in selected.items()} for row in chunk]

    async def labeled() -> AsyncGenerator[list[Row]]:
        if first:
            yield label(first)
        async for chunk in chunks:
            yield label(chunk)

    async def body() -> AsyncGenerator[bytes]:
        async with aclosing(chunks):
            async for block in writer(list(selected.values()), labeled()):
                yield block

    filename = f"incapacidades_{filters.fecha_inicial}_{filters.fecha_final}.{extension}"
    return StreamingResponse(
        body(),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
