"""SQL Server adapter for the fixed, read-only statistics queries."""

from typing import Any

from nexora.integration_management.application.ports import ReadOnlyQuery, SqlServerReader
from nexora.statistics.application.ports import CatalogOption, ReportPage
from nexora.statistics.domain.filters import DetailedInvoicesFilter
from nexora.statistics.infrastructure.queries.catalogs import COMPANIES, SITES
from nexora.statistics.infrastructure.queries.detailed_invoices import DETAILED_INVOICES_QUERY


class SqlServerDetailedInvoicesSource:
    def __init__(self, reader: SqlServerReader) -> None:
        self._reader = reader

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

    async def page(self, filter: DetailedInvoicesFilter, limit: int, offset: int) -> ReportPage:
        rows = await self._fetch_page(filter, limit, offset)
        if not rows and offset > 0:
            # Pagina fuera de rango: el total solo viaja en las filas, asi que se consulta la
            # primera fila para no informar 0 cuando si hay registros.
            probe = await self._fetch_page(filter, 1, 0)
            total = int(probe[0]["total_registros"]) if probe else 0
            return ReportPage([], total)
        total = int(rows[0]["total_registros"]) if rows else 0
        for row in rows:
            row.pop("total_registros")
        return ReportPage(rows, total)

    async def _fetch_page(
        self, filter: DetailedInvoicesFilter, limit: int, offset: int
    ) -> list[dict[str, Any]]:
        return await self._reader.fetch_all(
            DETAILED_INVOICES_QUERY,
            {
                "fecha_inicial": filter.fecha_inicial,
                "fecha_final": filter.fecha_final,
                "filtrar_sedes": int(bool(filter.sedes)),
                "filtrar_empresas": int(bool(filter.empresas)),
                "sedes": list(filter.sedes) or [-1],
                "empresas": list(filter.empresas) or [-1],
                "offset": offset,
                "limit": limit,
            },
        )
