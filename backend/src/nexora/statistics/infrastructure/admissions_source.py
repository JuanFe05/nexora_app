"""Fixed admissions queries on the shared read-only SQL Server source."""

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.infrastructure.queries.admissions import (
    ADMISSIONS_EXPORT_QUERY,
    ADMISSIONS_QUERY,
)
from nexora.statistics.infrastructure.report_source import SqlServerReportSource


class SqlServerAdmissionsSource(SqlServerReportSource):
    def __init__(self, reader: SqlServerReader) -> None:
        super().__init__(reader, ADMISSIONS_QUERY, ADMISSIONS_EXPORT_QUERY)
