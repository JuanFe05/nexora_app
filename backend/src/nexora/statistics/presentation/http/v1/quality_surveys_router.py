"""Consulta y exportación de Encuestas de Calidad."""

import asyncio
from collections.abc import AsyncIterator, Callable
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import JSONResponse, StreamingResponse

from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.quality_surveys import QualitySurveysReport
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.domain.quality_surveys import COLUMNS
from nexora.statistics.infrastructure.export_writers import WRITERS
from nexora.statistics.presentation.http.v1.report_router import _label_chunks, _parse_column

PERMISSION = "statistics.administrative.quality_surveys.view"
LABELS = {key: label for key, label, _ in COLUMNS}


def create_quality_surveys_router(
    *, provider: Callable[..., QualitySurveysReport]
) -> APIRouter:
    router = APIRouter(
        prefix="/statistics/administrative/quality-surveys",
        tags=["estadistica"],
        dependencies=[Depends(require_permission(PERMISSION))],
    )
    Report = Annotated[QualitySurveysReport, Depends(provider)]

    def filters(
        fecha_inicial: Annotated[date, Query()],
        fecha_final: Annotated[date, Query()],
        sedes: Annotated[list[int] | None, Query()] = None,
        empresas: Annotated[list[int] | None, Query()] = None,
    ) -> ReportFilter:
        return ReportFilter(
            fecha_inicial,
            fecha_final,
            tuple(sedes or ()),
            tuple(empresas or ()),
            (),
        )

    Filters = Annotated[ReportFilter, Depends(filters)]

    @router.get("/filters/sites", summary="Sedes disponibles")
    async def sites(report: Report) -> list[CatalogOption]:
        return await report.sites()

    @router.get("/filters/companies", summary="Empresas disponibles")
    async def companies(report: Report) -> list[CatalogOption]:
        return await report.companies()

    @router.get("", summary="Consultar Encuestas de Calidad")
    async def consult(report: Report, selected: Filters) -> Response:
        rows = await report.rows(selected)
        return await asyncio.to_thread(
            JSONResponse, {"rows": rows, "total": len(rows)}, headers={"Cache-Control": "no-store"}
        )

    @router.get("/export", summary="Exportar columnas seleccionadas en CSV o Excel")
    async def export(
        report: Report,
        selected: Filters,
        formato: Annotated[Literal["csv", "xlsx"], Query()],
        columnas: Annotated[
            list[str], Query(description="Columnas en el orden deseado: clave:text|number|date")
        ],
    ) -> StreamingResponse:
        parsed = [_parse_column(raw) for raw in columnas]
        if any(column.type != "text" for column in parsed):
            raise InvalidReportFilter("Columna de exportación inválida.")
        ids = {column.id for column in parsed}
        if ids - LABELS.keys():
            raise InvalidReportFilter("Columna de exportación inválida.")
        if len(ids) != len(parsed):
            raise InvalidReportFilter("No se permiten columnas duplicadas.")

        # Completar ambas consultas antes de iniciar la descarga, para propagar sus errores.
        rows = await report.rows(selected)

        async def chunks() -> AsyncIterator[list[dict[str, Any]]]:
            for offset in range(0, len(rows), 2000):
                yield rows[offset : offset + 2000]

        writer, media_type, extension = WRITERS[formato]
        columns = [ExportColumn(LABELS[column.id], column.type) for column in parsed]
        filename = (
            f"encuestas-de-calidad_{selected.fecha_inicial}_{selected.fecha_final}.{extension}"
        )
        return StreamingResponse(
            writer(columns, _label_chunks(chunks(), parsed, LABELS)),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    return router
