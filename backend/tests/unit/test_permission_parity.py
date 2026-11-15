"""The frontend permission constants must mirror the backend catalog exactly."""

import re
from pathlib import Path

import pytest

from nexora.identity_access.domain.value_objects.access_catalog import PERMISSION_CATALOG

FRONTEND = Path(__file__).resolve().parents[3] / "frontend/src/features/auth/permissions.ts"


@pytest.mark.skipif(not FRONTEND.is_file(), reason="frontend sources are not in this checkout")
def test_frontend_permission_constants_mirror_the_backend_catalog() -> None:
    source = FRONTEND.read_text("utf-8")
    declared = set(re.findall(r'"((?:identity|statistics)\.[a-z0-9_.]+)"', source))

    assert declared == {spec.code for spec in PERMISSION_CATALOG}


def test_catalog_codes_follow_module_prefix_and_view_suffix_for_statistics() -> None:
    for spec in PERMISSION_CATALOG:
        assert spec.code.startswith(f"{spec.module}."), spec.code
        assert spec.name.strip() == spec.name and spec.name, spec.code
        if spec.module == "statistics":
            assert re.fullmatch(r"statistics\.[a-z]+\.[a-z0-9_]+\.view", spec.code), spec.code
