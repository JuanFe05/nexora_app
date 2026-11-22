"""HTTP factory for reports; never logs filters or patient records."""

import json
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse

from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    require_permission,
)
from nexora.statistics.application.export import ExportColumn
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.application.report import Report
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.infrastructure.export_writers import WRITERS


def create_report_router(
    *,
    prefix: str,
    permission: str,
    provider: Callable[..., Report],
    title: str,
    filename: str,
    labels: Mapping[str, str] | None = None,
) -> APIRouter:
    router = APIRouter(
        prefix=prefix,
        tags=["estadistica"],
        dependencies=[Depends(require_permission(permission))],
    )

    @router.get("/filters/sites", summary="Sedes disponibles para el informe")
    async def sites(report: Annotated[Report, Depends(provider)]) -> list[CatalogOption]:
        return await report.sites()

    @router.get(
        "/filters/companies",
        summary="Empresas disponibles para el informe",
        description="Catálogo de empresas (tbEmpresas).",
    )
    async def companies(report: Annotated[Report, Depends(provider)]) -> list[CatalogOption]:
        return await report.companies()

    @router.get(
        "/filters/product-lines",
        summary="Líneas de producto disponibles para el informe",
        description="Catálogo de líneas de producto (tbLineasProductos), sin filtro de estado.",
    )
    async def product_lines(report: Annotated[Report, Depends(provider)]) -> list[CatalogOption]:
        return await report.product_lines()

    @router.get(
        "",
        summary=f"Consultar {title}",
        response_model=list[dict[str, Any]],
        description=(
            "Fechas obligatorias e inclusivas. Sedes, empresas y líneas de producto admiten "
            "parámetros repetidos; omitirlos para no restringir (también al seleccionar todas "
            "las opciones). Devuelve todas las columnas del informe con paginación del servidor."
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
        report: Annotated[Report, Depends(provider)],
        fecha_inicial: Annotated[date, Query(description="Fecha inicial inclusiva")],
        fecha_final: Annotated[date, Query(description="Fecha final inclusiva")],
        sedes: Annotated[
            list[int] | None, Query(description="Ids de sedes; omitir = todas")
        ] = None,
        empresas: Annotated[
            list[int] | None, Query(description="Ids de empresas; omitir = todas")
        ] = None,
        lineas: Annotated[
            list[int] | None, Query(description="Ids de líneas de producto; omitir = todas")
        ] = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> list[dict[str, Any]] | Response:
        filters = ReportFilter(
            fecha_inicial,
            fecha_final,
            tuple(sedes or ()),
            tuple(empresas or ()),
            tuple(lineas or ()),
        )
        result = await report.page(filters, limit, offset)
        response.headers["X-Total-Count"] = str(result.total)
        if labels is not None:
            return Response(
                content=_numeric_json(result.items),
                media_type="application/json",
                headers={"X-Total-Count": str(result.total)},
            )
        return result.items

    @router.get(
        "/export",
        summary=f"Exportar {title} (CSV o Excel)",
        description=(
            "Transmite por bloques todos los registros que cumplen los filtros, sin el límite de "
            "paginación de la tabla. Un solo formato por solicitud. `columnas` repite `id:tipo`. "
            "Sedes, empresas y líneas de producto son opcionales y repetibles."
        )
        + (
            " Los encabezados usan las etiquetas del informe; columnas acepta las claves API."
            if labels is not None
            else ""
        ),
        response_class=StreamingResponse,
    )
    async def export(
        report: Annotated[Report, Depends(provider)],
        fecha_inicial: Annotated[date, Query(description="Fecha inicial inclusiva")],
        fecha_final: Annotated[date, Query(description="Fecha final inclusiva")],
        formato: Annotated[Literal["csv", "xlsx"], Query()],
        columnas: Annotated[
            list[str],
            Query(min_length=1, max_length=200, description="Columnas como `id:tipo`"),
        ],
        sedes: Annotated[
            list[int] | None, Query(description="Ids de sedes; omitir = todas")
        ] = None,
        empresas: Annotated[
            list[int] | None, Query(description="Ids de empresas; omitir = todas")
        ] = None,
        lineas: Annotated[
            list[int] | None, Query(description="Ids de líneas de producto; omitir = todas")
        ] = None,
    ) -> StreamingResponse:
        parsed = [_parse_column(raw) for raw in columnas]
        if labels is not None:
            unknown = [c.id for c in parsed if c.id not in labels]
            if unknown:
                raise InvalidReportFilter(f"Columnas desconocidas: {', '.join(unknown)}.")
        filters = ReportFilter(
            fecha_inicial,
            fecha_final,
            tuple(sedes or ()),
            tuple(empresas or ()),
            tuple(lineas or ()),
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
        if labels is not None:
            body = _label_chunks(body, parsed, labels)
            parsed = [ExportColumn(labels[c.id], c.type) for c in parsed]
        writer, media_type, extension = WRITERS[formato]
        name = f"{filename}_{fecha_inicial}_{fecha_final}.{extension}"
        return StreamingResponse(
            writer(parsed, body),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{name}"',
                "Cache-Control": "no-store",
            },
        )

    return router


async def _prepend(
    first: list[dict[str, Any]], rest: AsyncIterator[list[dict[str, Any]]]
) -> AsyncIterator[list[dict[str, Any]]]:
    try:
        yield first
        async for chunk in rest:
            yield chunk
    finally:
        await rest.aclose()  # type: ignore[attr-defined]


def _numeric_json(value: Any) -> str:
    """Conserva los Decimal como números JSON, sin cadenas de Pydantic ni redondeo de float."""
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, dict):
        return (
            "{" + ",".join(json.dumps(k) + ":" + _numeric_json(v) for k, v in value.items()) + "}"
        )
    if isinstance(value, list):
        return "[" + ",".join(_numeric_json(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


async def _label_chunks(
    chunks: AsyncIterator[list[dict[str, Any]]],
    columns: Sequence[ExportColumn],
    labels: Mapping[str, str],
) -> AsyncIterator[list[dict[str, Any]]]:
    """Adapta las claves para los escritores existentes sin alterar los informes sin etiquetas."""
    try:
        async for chunk in chunks:
            yield [{labels[c.id]: row.get(c.id) for c in columns} for row in chunk]
    finally:
        await chunks.aclose()  # type: ignore[attr-defined]


def _parse_column(raw: str) -> ExportColumn:
    column_id, _, kind = raw.partition(":")
    if not column_id.isidentifier() or kind not in ("text", "number", "date"):
        raise InvalidReportFilter("Columna de exportación inválida.")
    return ExportColumn(column_id, kind)  # type: ignore[arg-type]
