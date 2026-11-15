import pytest

from nexora.identity_access.domain.value_objects.access_catalog import PERMISSION_CATALOG

CODES = [
    "statistics.reports.detailed_invoices.view",
    "statistics.reports.vital_signs.view",
    "statistics.reports.admissions.view",
    "statistics.reports.triage.view",
    "statistics.resolutions.res_202_2021.view",
    "statistics.resolutions.res_373_2026.view",
    "statistics.resolutions.res_1552_2013.view",
    "statistics.resolutions.res_256_2016.view",
    "statistics.resolutions.res_2175_2015.view",
    "statistics.circulars.circular_06_2018.view",
    "statistics.circulars.circular_21_2026.view",
    "statistics.administrative.general_consumption.view",
    "statistics.administrative.general_billing.view",
    "statistics.administrative.lab_consumption.view",
    "statistics.administrative.disability_management.view",
    "statistics.administrative.quality_surveys.view",
    "statistics.administrative.management_secretariat.view",
]


@pytest.mark.parametrize("code", CODES)
def test_report_permission_is_in_the_backend_catalog(code: str) -> None:
    specs = {spec.code: spec for spec in PERMISSION_CATALOG}

    assert code in specs
    assert specs[code].module == "statistics"


def test_catalog_codes_stay_unique() -> None:
    codes = [spec.code for spec in PERMISSION_CATALOG]

    assert len(codes) == len(set(codes))
