"""Fixed vital-signs queries on the shared read-only SQL Server source."""

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.infrastructure.queries.vital_signs import (
    VITAL_SIGNS_EXPORT_QUERY,
    VITAL_SIGNS_QUERY,
)
from nexora.statistics.infrastructure.report_source import SqlServerReportSource


class SqlServerVitalSignsSource(SqlServerReportSource):
    def __init__(self, reader: SqlServerReader) -> None:
        super().__init__(reader, VITAL_SIGNS_QUERY, VITAL_SIGNS_EXPORT_QUERY)
