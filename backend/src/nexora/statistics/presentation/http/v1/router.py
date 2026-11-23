"""Independent statistics reports registered through the shared router factory."""

from fastapi import Request

from nexora.identity_access.presentation.http.v1.dependencies.auth import ContainerDep
from nexora.statistics.application.detailed_invoices import DetailedInvoicesReport
from nexora.statistics.application.general_billing import COLUMNS
from nexora.statistics.application.general_consumption import GeneralConsumptionReport
from nexora.statistics.application.report import Report
from nexora.statistics.application.sivigila import SivigilaReport
from nexora.statistics.infrastructure.admissions_source import SqlServerAdmissionsSource
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)
from nexora.statistics.infrastructure.triage_source import SqlServerTriageSource
from nexora.statistics.infrastructure.vital_signs_source import SqlServerVitalSignsSource
from nexora.statistics.presentation.http.v1.bai_nutricion_cyd_router import (
    create_bai_nutricion_cyd_router,
)
from nexora.statistics.presentation.http.v1.general_consumption_router import (
    create_general_consumption_router,
)
from nexora.statistics.presentation.http.v1.moderator_fees_router import (
    moderator_fees_router as moderator_fees_router,
)
from nexora.statistics.presentation.http.v1.report_router import create_report_router
from nexora.statistics.presentation.http.v1.sivigila_router import create_sivigila_router


def get_general_consumption_report(request: Request) -> GeneralConsumptionReport:
    return request.app.state.general_consumption_report  # type: ignore[no-any-return]


general_consumption_router = create_general_consumption_router(
    provider=get_general_consumption_report
)


def get_general_billing_report(request: Request) -> Report:
    # La fuente pertenece a la aplicación y sobrevive a las solicitudes: página y exportación
    # comparten la consulta SQL, el ETL y el spool.
    return Report(request.app.state.general_billing_source)


def get_detailed_invoices_report(container: ContainerDep) -> DetailedInvoicesReport:
    return DetailedInvoicesReport(SqlServerDetailedInvoicesSource(container.sqlserver))


def get_vital_signs_report(container: ContainerDep) -> Report:
    return Report(SqlServerVitalSignsSource(container.sqlserver))


def get_sivigila_report(container: ContainerDep) -> SivigilaReport:
    # Reutiliza la query de Signos Vitales; una sola lectura alimenta todas las pestañas.
    return SivigilaReport(SqlServerVitalSignsSource(container.sqlserver))


def get_admissions_report(container: ContainerDep) -> Report:
    return Report(SqlServerAdmissionsSource(container.sqlserver))


def get_triage_report(container: ContainerDep) -> Report:
    return Report(SqlServerTriageSource(container.sqlserver))


general_billing_router = create_report_router(
    prefix="/statistics/administrative/general-billing",
    permission="statistics.administrative.general_billing.view",
    provider=get_general_billing_report,
    title="facturación general",
    filename="facturacion-general",
    labels={key: label for key, label, _ in COLUMNS},
)
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
admissions_router = create_report_router(
    prefix="/statistics/reports/admissions",
    permission="statistics.reports.admissions.view",
    provider=get_admissions_report,
    title="admisiones",
    filename="admisiones",
)
triage_router = create_report_router(
    prefix="/statistics/reports/triage",
    permission="statistics.reports.triage.view",
    provider=get_triage_report,
    title="triaje",
    filename="triaje",
)
sivigila_router = create_sivigila_router(
    prefix="/statistics/administrative/sivigila",
    permission="statistics.administrative.sivigila.view",
    provider=get_sivigila_report,
)
bai_nutricion_cyd_router = create_bai_nutricion_cyd_router(
    prefix="/statistics/administrative/bai-nutricion-cyd",
    permission="statistics.administrative.bai_nutricion_cyd.view",
)
