"""Informes detallados y contrastados de facturas; nunca registra filtros ni datos de pacientes."""

from collections.abc import AsyncIterator
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse

from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    require_permission,
)
from nexora.statistics.application.detailed_invoices import DetailedInvoicesReport
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.domain.filters import DetailedInvoicesFilter, InvalidReportFilter
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)
from nexora.statistics.infrastructure.export_writers import WRITERS

statistics_router = APIRouter(
    prefix="/statistics/reports/detailed-invoices",
    tags=["estadistica"],
    dependencies=[Depends(require_permission("statistics.reports.detailed_invoices.view"))],
)


def get_detailed_invoices_report(container: ContainerDep) -> DetailedInvoicesReport:
    return DetailedInvoicesReport(SqlServerDetailedInvoicesSource(container.sqlserver))


ReportDep = Annotated[DetailedInvoicesReport, Depends(get_detailed_invoices_report)]


@statistics_router.get("/filters/sites", summary="Sedes disponibles para el informe")
async def sites(report: ReportDep) -> list[CatalogOption]:
    return await report.sites()


@statistics_router.get(
    "/filters/companies",
    summary="Empresas disponibles para el informe",
    description="Catálogo de empresas (tbEmpresas).",
)
async def companies(report: ReportDep) -> list[CatalogOption]:
    return await report.companies()


@statistics_router.get(
    "",
    summary="Consultar facturas detalladas",
    description=(
        "Fechas obligatorias e inclusivas. Sedes y empresas admiten parámetros repetidos; "
        "omitirlos para no restringir (también al seleccionar todas las opciones). "
        "Devuelve todas las columnas del informe con paginación del servidor."
    ),
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
    fecha_inicial: Annotated[date, Query(description="Fecha inicial inclusiva")],
    fecha_final: Annotated[date, Query(description="Fecha final inclusiva")],
    sedes: Annotated[list[int] | None, Query(description="Ids de sedes; omitir = todas")] = None,
    empresas: Annotated[
        list[int] | None, Query(description="Ids de empresas; omitir = todas")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, Any]]:
    filters = DetailedInvoicesFilter(
        fecha_inicial, fecha_final, tuple(sedes or ()), tuple(empresas or ())
    )
    result = await report.page(filters, limit, offset)
    response.headers["X-Total-Count"] = str(result.total)
    return result.items


async def _prepend(
    first: list[dict[str, Any]], rest: AsyncIterator[list[dict[str, Any]]]
) -> AsyncIterator[list[dict[str, Any]]]:
    try:
        yield first
        async for chunk in rest:
            yield chunk
    finally:
        await rest.aclose()  # type: ignore[attr-defined]


@statistics_router.get(
    "/export",
    summary="Exportar facturas detalladas (CSV o Excel)",
    description=(
        "Transmite por bloques todos los registros que cumplen los filtros, sin el límite de "
        "paginación de la tabla. Un solo formato por solicitud. `columnas` repite `id:tipo`."
    ),
    response_class=StreamingResponse,
)
async def export(
    report: ReportDep,
    fecha_inicial: Annotated[date, Query(description="Fecha inicial inclusiva")],
    fecha_final: Annotated[date, Query(description="Fecha final inclusiva")],
    formato: Annotated[Literal["csv", "xlsx"], Query()],
    columnas: Annotated[
        list[str],
        Query(min_length=1, max_length=200, description="Columnas como `id:tipo`"),
    ],
    sedes: Annotated[list[int] | None, Query(description="Ids de sedes; omitir = todas")] = None,
    empresas: Annotated[
        list[int] | None, Query(description="Ids de empresas; omitir = todas")
    ] = None,
) -> StreamingResponse:
    parsed = [_parse_column(raw) for raw in columnas]
    filters = DetailedInvoicesFilter(
        fecha_inicial, fecha_final, tuple(sedes or ()), tuple(empresas or ())
    )
    chunks = report.export_chunks(filters)
    try:
        # La primera lectura abre la conexión y valida columnas antes de enviar cabeceras.
        first = await anext(chunks, None)
        if first:
            unknown = [c.id for c in parsed if c.id not in first[0]]
            if unknown:
                raise InvalidReportFilter(f"Columnas desconocidas: {', '.join(unknown)}.")
    except BaseException:
        await chunks.aclose()  # type: ignore[attr-defined]
        raise
    body = _prepend(first, chunks) if first else _prepend([], chunks)
    writer, media_type, extension = WRITERS[formato]
    name = f"facturas-detalladas_{fecha_inicial}_{fecha_final}.{extension}"
    return StreamingResponse(
        writer(parsed, body),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )


def _parse_column(raw: str) -> ExportColumn:
    column_id, _, kind = raw.partition(":")
    if not column_id.isidentifier() or kind not in ("text", "number", "date"):
        raise InvalidReportFilter("Columna de exportación inválida.")
    return ExportColumn(column_id, kind)  # type: ignore[arg-type]
