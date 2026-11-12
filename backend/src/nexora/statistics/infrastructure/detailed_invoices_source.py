"""Fixed invoice queries on the shared read-only SQL Server source."""

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.infrastructure.queries.detailed_invoices import (
    DETAILED_INVOICES_EXPORT_QUERY,
    DETAILED_INVOICES_QUERY,
)
from nexora.statistics.infrastructure.report_source import SqlServerReportSource


class SqlServerDetailedInvoicesSource(SqlServerReportSource):
    def __init__(self, reader: SqlServerReader) -> None:
        super().__init__(reader, DETAILED_INVOICES_QUERY, DETAILED_INVOICES_EXPORT_QUERY)
