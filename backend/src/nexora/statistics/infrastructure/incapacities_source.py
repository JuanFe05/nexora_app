"""Read-only SQL Server source for Gestión de Incapacidades."""

from collections.abc import AsyncGenerator
from contextlib import aclosing
from typing import Any, cast

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.application.incapacities import IncapacitiesFilter, transform_row
from nexora.statistics.application.ports import ReportPage
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.queries.incapacities import (
    INCAPACITIES_EXPORT_QUERY,
    INCAPACITIES_QUERY,
)
from nexora.statistics.infrastructure.report_source import SqlServerReportSource

Row = dict[str, Any]


class SqlServerIncapacitiesSource(SqlServerReportSource):
    def __init__(self, reader: SqlServerReader) -> None:
        super().__init__(reader, INCAPACITIES_QUERY, INCAPACITIES_EXPORT_QUERY)

    @staticmethod
    def _params(filter: ReportFilter) -> dict[str, Any]:
        return {
            "fecha_inicial": filter.fecha_inicial,
            "fecha_final": filter.fecha_final,
            "filtrar_empresas": int(bool(filter.empresas)),
            "empresas": list(filter.empresas) or [-1],
            "search": filter.search if isinstance(filter, IncapacitiesFilter) else "",
        }

    async def page(self, filter: ReportFilter, limit: int, offset: int) -> ReportPage:
        result = await super().page(filter, limit, offset)
        return ReportPage([transform_row(row) for row in result.items], result.total)

    async def stream(self, filter: ReportFilter) -> AsyncGenerator[list[Row]]:
        # The SQL Server reader streams through a closeable async generator.
        rows = cast(
            AsyncGenerator[list[Row]],
            self._reader.stream(INCAPACITIES_EXPORT_QUERY, self._params(filter)),
        )
        async with aclosing(rows):
            async for chunk in rows:
                yield [transform_row(row) for row in chunk]
