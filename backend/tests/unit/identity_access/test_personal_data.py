import pytest

from nexora.identity_access.application.use_cases.administration import NewUser, UserChanges
from nexora.identity_access.application.use_cases.profile import ProfileChanges
from nexora.identity_access.domain.value_objects.personal_data import validate_phone


def test_new_user_is_normalized_before_persisting() -> None:
    command = NewUser(
        username="u",
        email="  Ana@Example.COM ",
        password="x",
        first_name=" ángel ",
        last_name="peña",
        middle_name="maría josé",
        second_last_name="ñandú",
    )
    assert command.email == "ana@example.com"
    assert (command.first_name, command.last_name) == ("ÁNGEL", "PEÑA")
    assert (command.middle_name, command.second_last_name) == ("MARÍA JOSÉ", "ÑANDÚ")


def test_changes_normalize_present_fields_and_keep_none() -> None:
    for changes in (
        UserChanges(email=" A@B.CO ", first_name="é"),
        ProfileChanges(email=" A@B.CO ", first_name="é"),
    ):
        assert changes.email == "a@b.co"
        assert changes.first_name == "É"
        assert changes.middle_name is None


@pytest.mark.parametrize("value", ["3001234567", "0301234567"])
def test_phone_accepts_ten_ascii_digits(value: str) -> None:
    assert validate_phone(value) == value


@pytest.mark.parametrize(
    "value",
    [
        "",
        "123",
        "30012345678",
        "+573001234567",
        "300 123 4567",
        "300-123-4567",
        "30012345ab",
        " 3001234567",
        "٣٠٠١٢٣٤٥٦٧",
        "3001234567\n",
    ],
)
def test_phone_rejects_everything_else(value: str) -> None:
    with pytest.raises(ValueError):
        validate_phone(value)
