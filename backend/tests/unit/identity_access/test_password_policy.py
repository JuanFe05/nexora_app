"""Unicode policy and its public validation contracts share one decision."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from nexora.bootstrap.app import _register_error_handlers
from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.value_objects.password_policy import (
    MAX,
    MIN,
    password_policy_message,
    password_policy_violations,
)
from nexora.identity_access.presentation.http.v1.schemas.administration import UserCreate
from nexora.identity_access.presentation.http.v1.schemas.auth import LoginRequest
from nexora.identity_access.presentation.http.v1.schemas.profile import PasswordUpdate


@pytest.mark.parametrize(
    "password,expected",
    [
        ("Ab1!x", ("length",)),
        ("Ab1!xx", ()),
        ("Ab1!" + "x" * 20, ()),
        ("Ab1!" + "x" * 21, ("length",)),
        ("abc1!x", ("uppercase",)),
        ("ABC1!X", ("lowercase",)),
        ("Abcd!x", ("digit",)),
        ("Abc123", ("special",)),
        ("Ab1 \t\n", ("special",)),
        ("Éé١!xx", ()),
        ("ǅabc1!", ("uppercase",)),  # Lt is not Lu.
        ("Ab²!xx", ("digit",)),  # No is not Nd.
        ("𐐀𐐨١😀xx", ()),
        ("Ab1😀" + "x" * 20, ()),  # 24 code points, 25 UTF-16 units.
        ("Ab1😀" + "x" * 21, ("length",)),
        (" Ab1! ", ()),  # No stripping; both spaces contribute to length.
        ("", ("length", "uppercase", "lowercase", "digit", "special")),
    ],
)
def test_ordered_violations(password: str, expected: tuple[str, ...]) -> None:
    assert (MIN, MAX) == (6, 24)
    assert password_policy_violations(password) == expected


@pytest.mark.parametrize("special", ["@", "#", "$", "%", "&", "!", "_", "€", "😀"])
def test_punctuation_and_symbols_are_special(special: str) -> None:
    assert password_policy_violations("Ab123" + special) == ()


def test_ascii_message_names_only_failed_rules_without_secret() -> None:
    assert password_policy_message(("length", "digit")) == (
        "La contrasena debe cumplir: entre 6 y 24 caracteres; al menos un numero"
    )
    assert password_policy_message(password_policy_violations("")) == (
        "La contrasena debe cumplir: entre 6 y 24 caracteres; al menos una letra mayuscula; "
        "al menos una letra minuscula; al menos un numero; al menos un caracter especial"
    )
    assert password_policy_message(password_policy_violations("")).isascii()


def create_user(password: str) -> UserCreate:
    return UserCreate(
        nombre_usuario="ana",
        correo="ana@example.test",
        primer_nombre="Ana",
        primer_apellido="Perez",
        contrasena=password,
    )


def bootstrap(password: str) -> Settings:
    return Settings(  # type: ignore[call-arg]
        _env_file=None,
        bootstrap_admin_username="admin",
        bootstrap_admin_email="admin@example.test",
        bootstrap_admin_password=password,
    )


@pytest.mark.parametrize("password", ["Ab1!xx", "Ab1!" + "x" * 20, "Éé١!xx", " Ab1! "])
def test_all_consumers_accept_and_preserve_compliant_password(password: str) -> None:
    assert create_user(password).contrasena.get_secret_value() == password
    assert (
        PasswordUpdate(
            contrasena_actual="legacy",
            contrasena_nueva=password,
        ).contrasena_nueva.get_secret_value()
        == password
    )
    configured = bootstrap(password)
    assert configured.has_bootstrap_admin
    assert configured.bootstrap_admin_password.get_secret_value() == password


@pytest.mark.parametrize(
    "password",
    [
        "Ab1!x",
        "Ab1!" + "x" * 21,
        "abc1!x",
        "ABC1!X",
        "Abcd!x",
        "Abc123",
        "Ab1 \t\n",
    ],
)
def test_all_consumers_reject_with_same_message(password: str) -> None:
    message = password_policy_message(password_policy_violations(password))
    for validate in (
        create_user,
        bootstrap,
        lambda value: PasswordUpdate(
            contrasena_actual="legacy",
            contrasena_nueva=value,
        ),
    ):
        with pytest.raises(ValidationError) as error:
            validate(password)
        assert error.value.errors()[0]["msg"] == "Value error, " + message


@pytest.mark.parametrize("password", ["x", "plainlegacy", "x" * 128])
def test_login_and_current_password_preserve_legacy_input(password: str) -> None:
    request = LoginRequest(identificador="ana", contrasena=password)
    assert request.contrasena.get_secret_value() == password
    assert (
        PasswordUpdate(
            contrasena_actual=password,
            contrasena_nueva="Abc123!x",
        ).contrasena_actual.get_secret_value()
        == password
    )


def test_same_password_still_rejected() -> None:
    with pytest.raises(
        ValidationError,
        match="La contrasena nueva debe ser diferente de la actual",
    ):
        PasswordUpdate(contrasena_actual="Abc123!x", contrasena_nueva="Abc123!x")


def test_partial_bootstrap_credentials_still_rejected() -> None:
    with pytest.raises(ValidationError, match="exige NEXORA_BOOTSTRAP_ADMIN_USERNAME"):
        Settings(_env_file=None, bootstrap_admin_username="admin")  # type: ignore[call-arg]


@pytest.mark.parametrize(
    "schema,field,payload",
    [
        (
            UserCreate,
            "contrasena",
            {
                "nombre_usuario": "ana",
                "correo": "ana@example.test",
                "primer_nombre": "Ana",
                "primer_apellido": "Perez",
            },
        ),
        (PasswordUpdate, "contrasena_nueva", {"contrasena_actual": "legacy-secret"}),
    ],
)
@pytest.mark.parametrize("secret", ["Ab1!x", "Ab1!" + "x" * 21, "markerplain123"])
async def test_real_422_handler_redacts_policy_secrets(schema, field, payload, secret) -> None:
    app = FastAPI()
    _register_error_handlers(app)
    calls = []

    def endpoint(body):
        calls.append(body)
        return {}

    endpoint.__annotations__["body"] = schema
    app.post("/validate")(endpoint)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/validate", json={**payload, field: secret})
    assert response.status_code == 422
    assert response.json() == {
        "detail": [
            {
                "type": "value_error",
                "loc": ["body", field],
                "msg": "Value error, "
                + password_policy_message(password_policy_violations(secret)),
            }
        ]
    }
    assert secret not in response.text
    assert "legacy-secret" not in response.text
    assert calls == []
