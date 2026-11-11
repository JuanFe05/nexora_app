"""Authenticated detailed invoice reporting; never logs filters or patient data."""

from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response

from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    require_permission,
)
from nexora.statistics.application.detailed_invoices import DetailedInvoicesReport
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.domain.filters import DetailedInvoicesFilter
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)

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
    description="Catálogo provisional derivado de transacciones de los últimos 365 días.",
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
