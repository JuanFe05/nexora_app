"""API de Laboratorio; todas las rutas exigen el permiso ya existente del catálogo."""

import asyncio
import tempfile
from collections.abc import AsyncIterator, Callable
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

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
from nexora.statistics.infrastructure.export_writers import WRITERS
from nexora.statistics.presentation.http.v1.general_consumption_router import _write_csv
from nexora.statistics.presentation.http.v1.report_router import _numeric_json, _parse_column

PERMISSION = "statistics.administrative.lab_consumption.view"
Table = Literal["facturas", "admisiones", "ser_laboral", "annar_lab"]
TABLE_NAMES = {
    "facturas": "facturas-detalladas",
    "admisiones": "admisiones",
    "ser_laboral": "ser-laboral",
    "annar_lab": "annar-lab",
}


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
        "",
        summary="Consultar Consumo de Laboratorio",
        response_class=Response,
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
        "/ser-laboral",
        summary="Cargar CSV Ser Laboral",
        response_class=Response,
        description="CSV crudo, máximo 25 MB; solo CERRADO y LABORATORIO; TTL 30 min.",
    )
    async def ser_laboral(request: Request, report: Report) -> Response:
        return await load(request, report, annar=False)

    @router.post(
        "/annar-lab",
        summary="Cargar XLS ANNAR LAB",
        response_class=Response,
        description="BIFF .xls crudo (application/vnd.ms-excel); máximo 25 MB; TTL 30 min.",
    )
    async def annar_lab(request: Request, report: Report) -> Response:
        return await load(request, report, annar=True)

    @router.get(
        "/export",
        summary="Exportar Consumo de Laboratorio",
        description=(
            "CSV/XLSX con un solo encabezado de 12 columnas: facturas, admisiones, "
            "ser_laboral en ese orden. tablas omitido = las tres (CSV cargado opcional). "
            "annar_lab solo individual (6 columnas). Tabla importada explícita exige "
            "token: 422 si falta, 410 si expiró. Tokens ajenos a selección ignorados. "
            "Solo importados no consulta SQL. columnas opcional y repetible: clave:tipo."
        ),
        response_class=StreamingResponse,
    )
    async def export(
        report: Report,
        selected: Filters,
        formato: Annotated[Literal["csv", "xlsx"], Query()],
        tablas: Annotated[list[Table] | None, Query()] = None,
        ser_laboral_id: Annotated[str | None, Query()] = None,
        annar_lab_id: Annotated[str | None, Query()] = None,
        columnas: Annotated[list[str] | None, Query(max_length=12)] = None,
    ) -> StreamingResponse:
        selected_tables = [
            name
            for name in TABLE_NAMES
            if ((tablas is None and name != "annar_lab") or (tablas is not None and name in tablas))
        ]
        if "annar_lab" in selected_tables and len(selected_tables) != 1:
            raise InvalidReportFilter("ANNAR LAB solo puede exportarse individualmente.")
        metadata = ANNAR_COLUMNS if selected_tables == ["annar_lab"] else COLUMNS
        known = {key: (label, kind) for key, label, kind in metadata}
        parsed = (
            [_parse_column(raw) for raw in columnas]
            if columnas
            else [
                ExportColumn(
                    key, "number" if kind == "number" else "date" if kind == "date" else "text"
                )
                for key, _, kind in metadata
            ]
        )
        if unknown := [column.id for column in parsed if column.id not in known]:
            raise InvalidReportFilter(f"Columnas desconocidas: {', '.join(unknown)}.")
        if len({column.id for column in parsed}) != len(parsed):
            raise InvalidReportFilter("No se permiten columnas duplicadas.")
        table_rows: dict[str, list[dict[str, Any]]] = {}
        for name, token, cache, missing in (
            (
                "ser_laboral",
                ser_laboral_id,
                report.ser_laboral,
                "Carga el CSV de Ser Laboral para exportarlo.",
            ),
            (
                "annar_lab",
                annar_lab_id,
                report.annar_lab,
                "Carga el XLS de ANNAR LAB para exportarlo.",
            ),
        ):
            if name not in selected_tables:
                continue
            if token is None and tablas is not None:
                raise HTTPException(422, missing)
            try:
                table_rows[name] = cache.rows(token) if token is not None else []
            except SerLaboralExpired as exc:
                raise HTTPException(410, str(exc)) from exc
        if any(name in selected_tables for name in ("facturas", "admisiones")):
            result = await report.build(selected)
            table_rows.update({name: result[name] for name in ("facturas", "admisiones")})

        async def chunks() -> AsyncIterator[list[dict[str, Any]]]:
            for name in selected_tables:
                rows = table_rows[name]
                for offset in range(0, len(rows), 2000):
                    yield [
                        {known[c.id][0]: row.get(c.id) for c in parsed}
                        for row in rows[offset : offset + 2000]
                    ]

        writer, media_type, extension = WRITERS[formato]
        columns = [ExportColumn(known[c.id][0], c.type) for c in parsed]

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

        suffix = (
            ""
            if selected_tables == ["facturas", "admisiones", "ser_laboral"]
            else "-" + "-".join(TABLE_NAMES[name] for name in selected_tables)
        )
        filename = (
            f"consumo-laboratorio{suffix}_{selected.fecha_inicial}_"
            f"{selected.fecha_final}.{extension}"
        )
        return StreamingResponse(
            stream(),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )

    return router
