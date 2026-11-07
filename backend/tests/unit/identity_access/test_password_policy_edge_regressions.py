import pytest
from pydantic import ValidationError

from nexora.bootstrap.settings import Settings
from nexora.identity_access.presentation.http.v1.schemas.administration import UserCreate
from nexora.identity_access.presentation.http.v1.schemas.profile import PasswordUpdate


@pytest.mark.parametrize(
    "password,accepted",
    [
        ("Ab1\u00a0\u2003\u200b", False),
        ("Ab1\u0301xx", False),
        ("ǅab1!x", False),
        ("Ab²!xx", False),
        ("𐐀𐐨١😀xx", True),
        ("Ab1😀" + "x" * 20, True),
        ("Ab1😀" + "x" * 21, False),
        (" Ab1! ", True),
    ],
)
def test_unicode_edges_agree_across_creation_change_and_bootstrap(
    password: str, accepted: bool
) -> None:
    def create() -> object:
        return UserCreate(
            nombre_usuario="ana",
            correo="ana@example.test",
            primer_nombre="Ana",
            primer_apellido="Sol",
            contrasena=password,
        )

    def change() -> object:
        return PasswordUpdate(contrasena_actual="legacy", contrasena_nueva=password)

    def bootstrap() -> object:
        return Settings(
            _env_file=None,
            bootstrap_admin_username="admin",
            bootstrap_admin_email="admin@example.test",
            bootstrap_admin_password=password,
        )

    for consumer in (create, change, bootstrap):
        if accepted:
            consumer()
        else:
            with pytest.raises(ValidationError):
                consumer()
