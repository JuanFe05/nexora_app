"""Independent statistics reports registered through the shared router factory."""

from nexora.identity_access.presentation.http.v1.dependencies.auth import ContainerDep
from nexora.statistics.application.detailed_invoices import DetailedInvoicesReport
from nexora.statistics.application.report import Report
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)
from nexora.statistics.infrastructure.vital_signs_source import SqlServerVitalSignsSource
from nexora.statistics.presentation.http.v1.report_router import create_report_router


def get_detailed_invoices_report(container: ContainerDep) -> DetailedInvoicesReport:
    return DetailedInvoicesReport(SqlServerDetailedInvoicesSource(container.sqlserver))


def get_vital_signs_report(container: ContainerDep) -> Report:
    return Report(SqlServerVitalSignsSource(container.sqlserver))


statistics_router = create_report_router(
    prefix="/statistics/reports/detailed-invoices",
    permission="statistics.reports.detailed_invoices.view",
    provider=get_detailed_invoices_report,
    title="facturas detalladas",
    filename="facturas-detalladas",
)
vital_signs_router = create_report_router(
    prefix="/statistics/reports/vital-signs",
    permission="statistics.reports.vital_signs.view",
    provider=get_vital_signs_report,
    title="signos vitales",
    filename="signos-vitales",
)
