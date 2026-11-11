from nexora.identity_access.domain.value_objects.access_catalog import PERMISSION_CATALOG

CODE = "statistics.reports.detailed_invoices.view"


def test_detailed_invoices_permission_is_in_the_backend_catalog() -> None:
    specs = {spec.code: spec for spec in PERMISSION_CATALOG}

    assert CODE in specs
    assert specs[CODE].module == "statistics"


def test_catalog_codes_stay_unique() -> None:
    codes = [spec.code for spec in PERMISSION_CATALOG]

    assert len(codes) == len(set(codes))
