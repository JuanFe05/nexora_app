"""API de Laboratorio; todas las rutas exigen el permiso ya existente del catálogo."""

import asyncio
import tempfile
from collections.abc import AsyncIterator, Callable
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission
from nexora.statistics.application.annar_lab import COLUMNS as ANNAR_COLUMNS
from nexora.statistics.application.annar_lab import MAX_UPLOAD_BYTES, UploadTooLarge
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.general_consumption import _thread
from nexora.statistics.application.lab_consumption import LabConsumptionReport
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.ser_laboral import SerLaboralExpired
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.domain.lab_consumption import COLUMNS
from nexora.statistics.infrastructure import lab_consumption_exports as exports
from nexora.statistics.infrastructure.export_writers import WRITERS
from nexora.statistics.presentation.http.v1.report_router import _numeric_json, _parse_column

PERMISSION = "statistics.administrative.lab_consumption.view"


class AnalysisRow(BaseModel):
    model_config = ConfigDict(extra="forbid")
    descripcion: str = Field(max_length=500)
    cantidad: Decimal = Field(allow_inf_nan=False, max_digits=38, decimal_places=10)


class ApplicationRow(AnalysisRow):
    cups: str = Field(max_length=100)


class AnnarRow(AnalysisRow):
    seccion: str = Field(max_length=100)


class AnalysisExport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    aplicativo: list[ApplicationRow] = Field(max_length=10000)
    annar: list[AnnarRow] = Field(max_length=10000)
    titulo: str = Field(default="CONSUMO DE LABORATORIO", max_length=120)
    periodo: str = Field(default="", max_length=180)


def create_lab_consumption_router(*, provider: Callable[..., LabConsumptionReport]) -> APIRouter:
    router = APIRouter(
        prefix="/statistics/administrative/lab-consumption",
        tags=["estadistica"],
        dependencies=[Depends(require_permission(PERMISSION))],
    )
    Report = Annotated[LabConsumptionReport, Depends(provider)]

    def filters(
        fecha_inicial: Annotated[date, Query()],
        fecha_final: Annotated[date, Query()],
        sedes: Annotated[list[int] | None, Query()] = None,
        empresas: Annotated[list[int] | None, Query()] = None,
    ) -> ReportFilter:
        return ReportFilter(fecha_inicial, fecha_final, tuple(sedes or ()), tuple(empresas or ()))

    Filters = Annotated[ReportFilter, Depends(filters)]

    async def json_response(result: dict[str, Any]) -> Response:
        return Response(
            await asyncio.to_thread(_numeric_json, result),
            media_type="application/json",
            headers={"Cache-Control": "no-store"},
        )

    @router.get("/filters/sites", summary="Sedes disponibles")
    async def sites(report: Report) -> list[CatalogOption]:
        return await report.sites()

    @router.get("/filters/companies", summary="Empresas disponibles")
    async def companies(report: Report) -> list[CatalogOption]:
        return await report.companies()

    @router.get(
        "", summary="Consultar Consumo de Laboratorio", response_class=Response,
        description="Solo líneas LABORATORIO del catálogo; ambas fuentes en paralelo.",
    )
    async def consult(report: Report, selected: Filters) -> Response:
        return await json_response(await report.build(selected))

    async def load(request: Request, report: LabConsumptionReport, *, annar: bool) -> Response:
        content = bytearray()
        async for block in request.stream():
            if len(content) + len(block) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "El archivo excede el límite de 25 MB.")
            content.extend(block)
        cache = report.annar_lab if annar else report.ser_laboral
        try:
            return await json_response(await cache.load(bytes(content)))
        except UploadTooLarge as exc:
            raise HTTPException(413, str(exc)) from exc

    @router.post(
        "/ser-laboral", summary="Cargar CSV Ser Laboral", response_class=Response,
        description="CSV crudo, máximo 25 MB; solo CERRADO y LABORATORIO; TTL 30 min.",
    )
    async def ser_laboral(request: Request, report: Report) -> Response:
        return await load(request, report, annar=False)

    @router.post(
        "/annar-lab", summary="Cargar XLS ANNAR LAB", response_class=Response,
        description="BIFF .xls crudo (application/vnd.ms-excel); máximo 25 MB; TTL 30 min.",
    )
    async def annar_lab(request: Request, report: Report) -> Response:
        return await load(request, report, annar=True)

    @router.get(
        "/export", summary="Exportar Consumo de Laboratorio agrupado",
        description=(
            "Siempre agrupado: XLSX con Datos Aplicativo y ANNAR LAB; CSV como ZIP con "
            "Datos_Aplicativo.csv y ANNAR_LAB.csv (UTF-8 BOM). tablas se acepta e ignora. "
            "Tokens opcionales; desconocidos/expirados: 410 antes de SQL. "
            "Datos Aplicativo: Facturas, Admisiones, Ser Laboral, un encabezado de 12 columnas. "
            "columnas opcional y repetible: clave:tipo; solo afecta Datos Aplicativo."
        ), response_class=StreamingResponse,
    )
    async def export(
        report: Report,
        selected: Filters,
        formato: Annotated[Literal["csv", "xlsx"], Query()],
        tablas: Annotated[list[str] | None, Query()] = None,
        ser_laboral_id: Annotated[str | None, Query()] = None,
        annar_lab_id: Annotated[str | None, Query()] = None,
        columnas: Annotated[list[str] | None, Query(max_length=12)] = None,
    ) -> StreamingResponse:
        known = {key: (label, kind) for key, label, kind in COLUMNS}
        parsed = (
            [_parse_column(raw) for raw in columnas]
            if columnas else [
                ExportColumn(key, "number" if kind == "number" else
                             "date" if kind == "date" else "text")
                for key, _, kind in COLUMNS
            ]
        )
        if unknown := [column.id for column in parsed if column.id not in known]:
            raise InvalidReportFilter(f"Columnas desconocidas: {', '.join(unknown)}.")
        if len({column.id for column in parsed}) != len(parsed):
            raise InvalidReportFilter("No se permiten columnas duplicadas.")
        # Resolve all supplied bearer tokens before queries and response headers.
        try:
            laboral = report.ser_laboral.rows(ser_laboral_id) if ser_laboral_id is not None else []
            annar = report.annar_lab.rows(annar_lab_id) if annar_lab_id is not None else []
        except SerLaboralExpired as exc:
            raise HTTPException(410, str(exc)) from exc
        result = await report.build(selected)
        tables: list[exports.Table] = [
            ("Datos Aplicativo", [ExportColumn(known[c.id][0], c.type) for c in parsed],
             [result["facturas"], result["admisiones"], laboral], [c.id for c in parsed]),
            ("ANNAR LAB", [ExportColumn(label, "number" if kind == "number" else "text")
                           for _, label, kind in ANNAR_COLUMNS],
             [annar], [key for key, _, _ in ANNAR_COLUMNS]),
        ]
        if formato == "xlsx" and not exports.validate_sheet_sizes(tables):
            raise InvalidReportFilter(
                "El resultado excede el límite de filas de una hoja de Excel."
            )

        async def stream() -> AsyncIterator[bytes]:
            with tempfile.TemporaryFile() as file:
                await _thread(exports.build_grouped, file, formato, tables)
                await asyncio.to_thread(file.seek, 0)
                while block := await asyncio.to_thread(file.read, 65536):
                    yield block

        extension = "zip" if formato == "csv" else "xlsx"
        filename = (
            f"consumo-laboratorio_{selected.fecha_inicial}_{selected.fecha_final}.{extension}"
        )
        return StreamingResponse(
            stream(), media_type="application/zip" if formato == "csv" else WRITERS["xlsx"][1],
            headers={"Content-Disposition": f'attachment; filename="{filename}"',
                     "Cache-Control": "no-store"},
        )

    @router.post(
        "/export/analysis/xlsx", summary="Excel de Análisis: Datos Aplicativo y ANNAR LAB",
        description=(
            "Una hoja Análisis; no consulta SQL. aplicativo: cups/descripcion/cantidad; "
            "annar: seccion/descripcion/cantidad. Máximo 10000 filas por tabla, códigos 100 "
            "caracteres, descripción 500, título 120, periodo 180; sin campos adicionales."
        ),
    )
    async def analysis_xlsx(body: AnalysisExport) -> Response:
        content = await asyncio.to_thread(
            exports.build_analysis_xlsx, [r.model_dump() for r in body.aplicativo],
            [r.model_dump() for r in body.annar], body.titulo, body.periodo,
        )
        return Response(
            content, media_type=WRITERS["xlsx"][1], headers={
                "Content-Disposition": 'attachment; filename="analisis-consumo-laboratorio.xlsx"',
                "Cache-Control": "no-store",
            },
        )

    return router
