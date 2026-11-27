"""Adaptador SQL de la pestaña Facturas Detalladas."""

from dataclasses import dataclass
from typing import Any

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.report_source import SqlServerReportSource


@dataclass(frozen=True, slots=True)
class InvoiceFilter(ReportFilter):
    buscar: str = ""


class SqlServerManagementSecretariatInvoices(SqlServerReportSource):
    def __init__(self, reader: SqlServerReader) -> None:
        # Un cambio incompatible en la consulta base no debe impedir importar otros routers.
        from nexora.statistics.infrastructure.queries.management_secretariat_invoices import (
            EXPORT_QUERY,
            PAGE_QUERY,
        )

        super().__init__(reader, PAGE_QUERY, EXPORT_QUERY)

    @staticmethod
    def _params(filter: ReportFilter) -> dict[str, Any]:
        return {
            **SqlServerReportSource._params(filter),
            "buscar": filter.buscar if isinstance(filter, InvoiceFilter) else "",
        }
