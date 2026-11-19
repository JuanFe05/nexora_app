"""Fixed triage queries without product-line bindings on the shared source."""

from typing import Any

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.queries.triage import TRIAGE_EXPORT_QUERY, TRIAGE_QUERY
from nexora.statistics.infrastructure.report_source import SqlServerReportSource


class SqlServerTriageSource(SqlServerReportSource):
    def __init__(self, reader: SqlServerReader) -> None:
        super().__init__(reader, TRIAGE_QUERY, TRIAGE_EXPORT_QUERY)

    @staticmethod
    def _params(filter: ReportFilter) -> dict[str, Any]:
        params = SqlServerReportSource._params(filter)
        params.pop("filtrar_lineas")
        params.pop("lineas")
        return params
