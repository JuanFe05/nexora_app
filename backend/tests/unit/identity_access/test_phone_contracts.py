import re

import pytest
from pydantic import ValidationError

from nexora.identity_access.domain.value_objects.personal_data import PHONE_MESSAGE
from nexora.identity_access.presentation.http.v1.schemas.administration import UserUpdate
from nexora.identity_access.presentation.http.v1.schemas.profile import ProfileUpdate


@pytest.mark.parametrize("contract", [UserUpdate, ProfileUpdate])
def test_phone_preserves_leading_zero_and_omission(contract):
    assert contract().model_dump(exclude_unset=True) == {}
    assert contract(numero_telefono="0301234567").numero_telefono == "0301234567"


@pytest.mark.parametrize("contract", [UserUpdate, ProfileUpdate])
@pytest.mark.parametrize(
    "value",
    [
        "",
        "123",
        "30012345678",
        "+573001234567",
        "300 1234567",
        "300-1234567",
        "30012345ab",
        " 3001234567",
        "3001234567\n",
        "\u0663" * 10,
        3001234567,
    ],
)
def test_patch_rejects_invalid_phone(contract, value):
    with pytest.raises(ValidationError):
        contract(numero_telefono=value)


def test_invalid_phone_reports_clear_message():
    with pytest.raises(ValidationError, match=re.escape(PHONE_MESSAGE)):
        UserUpdate(numero_telefono="123")


def test_patch_still_rejects_null_phone():
    with pytest.raises(ValidationError):
        UserUpdate(numero_telefono=None)
