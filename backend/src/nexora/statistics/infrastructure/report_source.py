"""SQL Server adapter shared by fixed, read-only statistics reports."""

from collections.abc import AsyncIterator
from typing import Any

from nexora.integration_management.application.ports import ReadOnlyQuery, SqlServerReader
from nexora.statistics.application.ports import CatalogOption, ReportPage
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.queries.catalogs import COMPANIES, PRODUCT_LINES, SITES


class SqlServerReportSource:
    def __init__(
        self, reader: SqlServerReader, page_query: ReadOnlyQuery, export_query: ReadOnlyQuery
    ) -> None:
        self._reader = reader
        self._page_query = page_query
        self._export_query = export_query

    async def _catalog(self, query: ReadOnlyQuery) -> list[CatalogOption]:
        rows = await self._reader.fetch_all(query)
        options = []
        for row in rows:
            option_id = int(row["id"])
            name = str(row["nombre"]).strip() if row["nombre"] is not None else ""
            options.append(CatalogOption(option_id, name or str(option_id)))
        return options

    async def sites(self) -> list[CatalogOption]:
        return await self._catalog(SITES)

    async def companies(self) -> list[CatalogOption]:
        return await self._catalog(COMPANIES)

    async def product_lines(self) -> list[CatalogOption]:
        return await self._catalog(PRODUCT_LINES)

    async def page(self, filter: ReportFilter, limit: int, offset: int) -> ReportPage:
        rows = await self._fetch_page(filter, limit, offset)
        if not rows and offset > 0:
            # El total viaja en las filas: sondear la primera si la pagina esta fuera de rango.
            probe = await self._fetch_page(filter, 1, 0)
            total = int(probe[0]["total_registros"]) if probe else 0
            return ReportPage([], total)
        total = int(rows[0]["total_registros"]) if rows else 0
        for row in rows:
            row.pop("total_registros")
        return ReportPage(rows, total)

    @staticmethod
    def _params(filter: ReportFilter) -> dict[str, Any]:
        return {
            "fecha_inicial": filter.fecha_inicial,
            "fecha_final": filter.fecha_final,
            "filtrar_sedes": int(bool(filter.sedes)),
            "filtrar_empresas": int(bool(filter.empresas)),
            "filtrar_lineas": int(bool(filter.lineas)),
            "sedes": list(filter.sedes) or [-1],
            "empresas": list(filter.empresas) or [-1],
            "lineas": list(filter.lineas) or [-1],
        }

    async def stream(self, filter: ReportFilter) -> AsyncIterator[list[dict[str, Any]]]:
        async for chunk in self._reader.stream(self._export_query, self._params(filter)):
            yield chunk

    async def _fetch_page(
        self, filter: ReportFilter, limit: int, offset: int
    ) -> list[dict[str, Any]]:
        return await self._reader.fetch_all(
            self._page_query, {**self._params(filter), "offset": offset, "limit": limit}
        )
