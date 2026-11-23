"""API de Consumo General; solo permite indicadores en exportaciones de Análisis."""

import asyncio
import tempfile
from collections.abc import AsyncIterator, Callable
from datetime import date
from decimal import Decimal
from typing import IO, Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.general_consumption import (
    COLUMNS,
    GeneralConsumptionReport,
    _thread,
)
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.infrastructure.export_writers import WRITERS
from nexora.statistics.infrastructure.general_consumption_exports import (
    build_analysis_pdf,
    build_analysis_xlsx,
)
from nexora.statistics.presentation.http.v1.report_router import _numeric_json, _parse_column

PERMISSION = "statistics.administrative.general_consumption.view"


class Indicator(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clave: str = Field(max_length=100)
    etiqueta: str = Field(max_length=160)
    valor: Decimal = Field(allow_inf_nan=False, max_digits=38, decimal_places=10)


class AnalysisExport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    indicadores: list[Indicator] = Field(max_length=7)
    titulo: str = Field(default="CONSUMO GENERAL", max_length=120)
    periodo: str = Field(default="", max_length=180)


def create_general_consumption_router(
    *,
    provider: Callable[..., GeneralConsumptionReport],
) -> APIRouter:
    router = APIRouter(
        prefix="/statistics/administrative/general-consumption",
        tags=["estadistica"],
        dependencies=[Depends(require_permission(PERMISSION))],
    )
    Report = Annotated[GeneralConsumptionReport, Depends(provider)]

    def filters(
        fecha_inicial: Annotated[date, Query()],
        fecha_final: Annotated[date, Query()],
        sedes: Annotated[list[int] | None, Query()] = None,
        empresas: Annotated[list[int] | None, Query()] = None,
        lineas: Annotated[list[int] | None, Query()] = None,
    ) -> ReportFilter:
        return ReportFilter(
            fecha_inicial,
            fecha_final,
            tuple(sedes or ()),
            tuple(empresas or ()),
            tuple(lineas or ()),
        )

    Filters = Annotated[ReportFilter, Depends(filters)]

    @router.get("/filters/sites", summary="Sedes disponibles")
    async def sites(report: Report) -> list[CatalogOption]:
        return await report.sites()

    @router.get("/filters/companies", summary="Empresas disponibles")
    async def companies(report: Report) -> list[CatalogOption]:
        return await report.companies()

    @router.get("/filters/product-lines", summary="Líneas de producto disponibles")
    async def product_lines(report: Report) -> list[CatalogOption]:
        return await report.product_lines()

    @router.get(
        "",
        summary="Consultar Consumo General",
        response_class=Response,
        description="Mismos filtros inclusivos para ambas fuentes, ejecutadas en paralelo.",
    )
    async def consult(report: Report, selected: Filters) -> Response:
        result = await report.build(selected)
        content = await asyncio.to_thread(_numeric_json, result)
        return Response(
            content, media_type="application/json", headers={"Cache-Control": "no-store"}
        )

    @router.get(
        "/export",
        summary="Exportar Facturas Detalladas y luego Admisiones",
        description="40 columnas por defecto; columnas opcional y repetible: clave:tipo.",
        response_class=StreamingResponse,
    )
    async def export(
        report: Report,
        selected: Filters,
        formato: Annotated[Literal["csv", "xlsx"], Query()],
        columnas: Annotated[list[str] | None, Query(max_length=40)] = None,
    ) -> StreamingResponse:
        known = {key: (label, kind) for key, label, kind in COLUMNS}
        parsed = (
            [_parse_column(raw) for raw in columnas]
            if columnas
            else [
                ExportColumn(
                    key,
                    "number"
                    if kind in {"number", "money"}
                    else "date"
                    if kind == "date"
                    else "text",
                )
                for key, _, kind in COLUMNS
            ]
        )
        unknown = [c.id for c in parsed if c.id not in known]
        if unknown:
            raise InvalidReportFilter(f"Columnas desconocidas: {', '.join(unknown)}.")
        if len({c.id for c in parsed}) != len(parsed):
            raise InvalidReportFilter("No se permiten columnas duplicadas.")
        # Validar consultas y vigencias antes de enviar cabeceras, también en exportación.
        result = await report.build(selected)

        async def chunks() -> AsyncIterator[list[dict[str, Any]]]:
            for name in ("facturas", "admisiones"):
                rows = result[name]
                for offset in range(0, len(rows), 2000):
                    yield [
                        {known[c.id][0]: row.get(c.id) for c in parsed}
                        for row in rows[offset : offset + 2000]
                    ]

        writer, media_type, extension = WRITERS[formato]
        columns = [ExportColumn(known[c.id][0], c.type) for c in parsed]

        # CSV usa el escritor común en un worker (el escritor XLSX ya descarga su trabajo).
        async def stream() -> AsyncIterator[bytes]:
            if formato == "csv":
                with tempfile.TemporaryFile() as file:
                    await _thread(_write_csv, file, writer(columns, chunks()))
                    await asyncio.to_thread(file.seek, 0)
                    while block := await asyncio.to_thread(file.read, 65536):
                        yield block
            else:
                async for block in writer(columns, chunks()):
                    yield block

        filename = f"consumo-general_{selected.fecha_inicial}_{selected.fecha_final}.{extension}"
        return StreamingResponse(
            stream(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    @router.post("/export/analysis/pdf", summary="PDF horizontal: solo indicadores")
    async def analysis_pdf(body: AnalysisExport) -> Response:
        content = await asyncio.to_thread(
            build_analysis_pdf,
            [i.model_dump() for i in body.indicadores],
            body.titulo,
            body.periodo,
        )
        return _file(content, "application/pdf", "pdf")

    @router.post("/export/analysis/xlsx", summary="Excel de Análisis: solo indicadores")
    async def analysis_xlsx(body: AnalysisExport) -> Response:
        content = await asyncio.to_thread(
            build_analysis_xlsx,
            [i.model_dump() for i in body.indicadores],
            body.titulo,
            body.periodo,
        )
        return _file(content, WRITERS["xlsx"][1], "xlsx")

    return router


def _write_csv(file: IO[bytes], iterator: AsyncIterator[bytes]) -> None:
    async def write() -> None:
        async for block in iterator:
            file.write(block)

    asyncio.run(write())


def _file(content: bytes, media_type: str, extension: str) -> Response:
    return Response(
        content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="consumo-general-analisis.{extension}"',
            "Cache-Control": "no-store",
        },
    )
