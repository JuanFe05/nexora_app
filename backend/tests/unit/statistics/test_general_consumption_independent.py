"""Independent DOCX mapping regression for admissions."""

import pytest
from tests.unit.statistics.test_general_consumption import admission

from nexora.statistics.application.general_consumption import prepare_admission


@pytest.mark.parametrize("identification", ["CC", "RC", "TI", ""])
def test_admission_document_type_is_constant(identification: str) -> None:
    row = prepare_admission(admission(tpo_idntfccn=identification))
    assert row["dscrp_transcn"] == "ADMISION"
    assert row["cdgo_tpo_dcmnto"] == identification
    assert len(row) == 40
