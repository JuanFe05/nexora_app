"""Consulta y exportación independientes de Facturas Detalladas."""

from collections.abc import AsyncGenerator
from contextlib import aclosing
from datetime import date
from decimal import localcontext
from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse

from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    require_permission,
)
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.report import Report
from nexora.statistics.domain.filters import InvalidReportFilter
from nexora.statistics.domain.management_secretariat import COLUMNS, clean_sql_row
from nexora.statistics.infrastructure.export_writers import WRITERS
from nexora.statistics.infrastructure.management_secretariat_invoices import (
    InvoiceFilter,
    SqlServerManagementSecretariatInvoices,
)

PERMISSION = "statistics.administrative.management_secretariat.view"
_NO_STORE = {"Cache-Control": "no-store"}
_KEYS = frozenset(key for key, _, _ in COLUMNS)
router = APIRouter(
    prefix="/statistics/administrative/management-secretariat/detailed-invoices",
    tags=["estadistica"],
    dependencies=[Depends(require_permission(PERMISSION))],
)


def get_report(container: ContainerDep) -> Report:
    return Report(SqlServerManagementSecretariatInvoices(container.sqlserver))


def get_filters(
    fecha_inicial: Annotated[date, Query(description="Fecha inicial inclusiva")],
    fecha_final: Annotated[date, Query(description="Fecha final inclusiva")],
    sedes: Annotated[list[int] | None, Query()] = None,
    empresas: Annotated[list[int] | None, Query()] = None,
    lineas: Annotated[list[int] | None, Query()] = None,
    buscar: Annotated[
        str, Query(max_length=200, description="Texto literal en campos de salida")
    ] = "",
) -> InvoiceFilter:
    return InvoiceFilter(
        fecha_inicial,
        fecha_final,
        tuple(sedes or ()),
        tuple(empresas or ()),
        tuple(lineas or ()),
        buscar.strip(),
    )


ReportDep = Annotated[Report, Depends(get_report)]
FiltersDep = Annotated[InvoiceFilter, Depends(get_filters)]


@router.get("/filters/sites", summary="Sedes disponibles")
async def sites(report: ReportDep) -> list[CatalogOption]:
    return await report.sites()


@router.get("/filters/companies", summary="Empresas disponibles")
async def companies(report: ReportDep) -> list[CatalogOption]:
    return await report.companies()


@router.get("/filters/product-lines", summary="Líneas de producto disponibles")
async def product_lines(report: ReportDep) -> list[CatalogOption]:
    return await report.product_lines()


@router.get("", summary="Consultar Facturas Detalladas de Secretaría Gerencia")
async def page(
    response: Response,
    report: ReportDep,
    filters: FiltersDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, str | None]]:
    result = await report.page(filters, limit, offset)
    response.headers.update({**_NO_STORE, "X-Total-Count": str(result.total)})
    return [clean_sql_row(row) for row in result.items]


@router.get(
    "/export",
    summary="Exportar solo Facturas Detalladas (CSV o Excel)",
    description="Mismos filtros de consulta, sin paginación. Las columnas siguen su orden oficial.",
    response_class=StreamingResponse,
)
async def export(
    report: ReportDep,
    filters: FiltersDep,
    formato: Annotated[Literal["csv", "xlsx"], Query()],
    columnas: Annotated[
        list[str] | None, Query(max_length=len(COLUMNS), description="Claves API repetibles")
    ] = None,
) -> StreamingResponse:
    keys = set(columnas) if columnas is not None else _KEYS
    if columnas is not None:
        unknown = sorted(keys - _KEYS)
        if unknown:
            raise InvalidReportFilter(f"Columnas desconocidas: {', '.join(unknown)}.")
        if len(keys) != len(columnas):
            raise InvalidReportFilter("No se permiten columnas duplicadas.")
    selected = [(key, label, kind) for key, label, kind in COLUMNS if key in keys]
    columns = [
        ExportColumn(
            label,
            "date" if kind == "date" else "number" if kind == "number" and formato == "csv"
            else "text",
        )
        for _, label, kind in selected
    ]
    writer, media_type, extension = WRITERS[formato]
    chunks = cast(AsyncGenerator[list[dict[str, Any]]], report.export_chunks(filters))
    try:
        first = await anext(chunks, [])  # Abrir la consulta antes de enviar cabeceras.
    except BaseException:
        await chunks.aclose()
        raise

    def project(chunk: list[dict[str, Any]]) -> list[dict[str, Any]]:
        projected: list[dict[str, Any]] = []
        for row in chunk:
            clean = clean_sql_row(row)
            projected.append({label: clean[key] for key, label, _ in selected})
        return projected

    async def rows() -> AsyncGenerator[list[dict[str, Any]]]:
        if first:
            yield project(first)
        async for chunk in chunks:
            yield project(chunk)

    async def body() -> AsyncGenerator[bytes]:
        async with aclosing(chunks), aclosing(rows()) as output_rows:
            output = cast(AsyncGenerator[bytes], writer(columns, output_rows))
            async with aclosing(output):
                while True:
                    # Decimal.normalize() en el escritor CSV debe conservar los 38 dígitos.
                    with localcontext(prec=38):
                        block = await anext(output, None)
                    if block is None:
                        break
                    yield block

    filename = (
        "secretaria-gerencia-facturas-detalladas_"
        f"{filters.fecha_inicial}_{filters.fecha_final}.{extension}"
    )
    return StreamingResponse(
        body(),
        media_type=media_type,
        headers={**_NO_STORE, "Content-Disposition": f'attachment; filename="{filename}"'},
    )
