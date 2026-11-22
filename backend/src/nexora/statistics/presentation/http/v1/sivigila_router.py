"""HTTP de la Notificación SIVIGILA; nunca registra filtros ni datos de pacientes."""

import re
import unicodedata
from collections.abc import Callable
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.sivigila import (
    SivigilaReport,
    SivigilaResult,
    ensure_consistent,
)
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.sivigila_pdf import build_analysis_pdf
from nexora.statistics.infrastructure.sivigila_workbook import build_workbook

PDF = "application/pdf"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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
        filters = ReportFilter(
            fecha_inicial,
            fecha_final,
            tuple(sedes or ()),
            tuple(empresas or ()),
            tuple(lineas or ()),
        )
        return await report.build(filters)

    @router.post(
        "/export/pdf",
        summary="Exportar la pestaña Análisis a PDF",
        description=(
            "Recibe el resultado ya procesado que muestra el módulo y genera un PDF horizontal "
            "de una sola página con las tablas de Análisis. No vuelve a consultar SQL Server."
        ),
        response_class=Response,
        responses={200: {"content": {PDF: {}}}},
    )
    async def export_pdf(result: SivigilaResult) -> Response:
        ensure_consistent(result)
        return _file(build_analysis_pdf(result), PDF, _filename(result, "pdf"))

    @router.post(
        "/export/xlsx",
        summary="Exportar el libro completo (siete hojas) a Excel",
        description=(
            "Recibe el resultado ya procesado y genera un único libro con las hojas Análisis, "
            "General, Evento IRA, Evento EDA, Dengue, Varicela y Exposición Rábica. No vuelve a "
            "consultar SQL Server."
        ),
        response_class=Response,
        responses={200: {"content": {XLSX: {}}}},
    )
    async def export_xlsx(result: SivigilaResult) -> Response:
        ensure_consistent(result)
        return _file(build_workbook(result), XLSX, _filename(result, "xlsx"))

    return router


def _file(content: bytes, media_type: str, name: str) -> Response:
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "no-store",
        },
    )


def _filename(result: SivigilaResult, extension: str) -> str:
    ascii_title = unicodedata.normalize("NFKD", result.titulo).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^A-Za-z0-9]+", "_", ascii_title).strip("_") or "NOTIFICACION"
    return f"{slug}.{extension}"
