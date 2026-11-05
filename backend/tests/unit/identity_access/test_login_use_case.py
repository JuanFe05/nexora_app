"""Casos del flujo de Login (S8): identificador flexible y error generico."""

from __future__ import annotations

import pytest

from nexora.identity_access.application.dto.auth import LoginCommand
from nexora.identity_access.application.use_cases.authentication.login import LoginUseCase
from nexora.identity_access.domain.exceptions.identity import (
    AuthenticationThrottled,
    InvalidCredentials,
)
from nexora.identity_access.domain.value_objects.enums import UserStatus
from tests.support.fakes import (
    FakeAccessRepository,
    FakePasswordHasher,
    FakeSessionRepository,
    FakeThrottle,
    FakeTokenService,
    FakeTransaction,
    FakeUserRepository,
    FixedClock,
    build_user,
)

PASSWORD = "Secreta123*"


def build_use_case(
    *,
    users: FakeUserRepository | None = None,
    throttle: FakeThrottle | None = None,
) -> tuple[LoginUseCase, dict[str, object]]:
    parts = {
        "users": users or FakeUserRepository([build_user(password=PASSWORD)]),
        "sessions": FakeSessionRepository(),
        "access": FakeAccessRepository(),
        "hasher": FakePasswordHasher(),
        "tokens": FakeTokenService(),
        "throttle": throttle or FakeThrottle(),
        "clock": FixedClock(),
        "transaction": FakeTransaction(),
    }
    use_case = LoginUseCase(
        users=parts["users"],
        sessions=parts["sessions"],
        hasher=parts["hasher"],
        tokens=parts["tokens"],
        throttle=parts["throttle"],
        clock=parts["clock"],
        transaction=parts["transaction"],
    )
    return use_case, parts


async def test_login_con_nombre_de_usuario_emite_tokens_y_crea_sesion() -> None:
    use_case, parts = build_use_case()

    result = await use_case.execute(
        LoginCommand(
            identifier="jperez",
            password=PASSWORD,
            ip_address="10.0.0.1",
            user_agent="pytest",
        )
    )

    sessions = parts["sessions"].sessions
    assert len(sessions) == 1
    stored = next(iter(sessions.values()))
    assert result.tokens.session_id == stored.id
    assert result.tokens.token_type == "bearer"
    assert result.tokens.expires_in == 600
    assert result.tokens.refresh_expires_at == stored.expires_at
    assert stored.ip_address == "10.0.0.1"
    assert stored.user_agent == "pytest"
    assert stored.revoked_at is None
    assert result.user.username == "jperez"
    assert result.user.full_name == "Juan Perez"
    assert parts["transaction"].commits == 1
    assert parts["throttle"].failures == []


async def test_login_con_correo_identifica_al_mismo_usuario() -> None:
    use_case, _ = build_use_case()

    result = await use_case.execute(
        LoginCommand(identifier="  JPerez@Nexora.co ", password=PASSWORD)
    )

    assert result.user.email == "jperez@nexora.co"


async def test_el_refresh_token_emitido_coincide_con_el_jti_almacenado() -> None:
    use_case, parts = build_use_case()

    result = await use_case.execute(LoginCommand(identifier="jperez", password=PASSWORD))

    stored = next(iter(parts["sessions"].sessions.values()))
    assert str(stored.refresh_token_jti) in result.tokens.refresh_token
    assert str(stored.refresh_token_jti) not in result.tokens.access_token


async def test_usuario_inexistente_devuelve_error_generico_y_verifica_hash_senuelo() -> None:
    use_case, parts = build_use_case(users=FakeUserRepository([]))

    with pytest.raises(InvalidCredentials):
        await use_case.execute(LoginCommand(identifier="fantasma", password=PASSWORD))

    assert parts["hasher"].dummy_verifications == 1
    assert parts["sessions"].sessions == {}
    assert parts["transaction"].commits == 0
    assert parts["throttle"].failures == ["none:fantasma"]


async def test_contrasena_incorrecta_devuelve_error_generico() -> None:
    use_case, parts = build_use_case()

    with pytest.raises(InvalidCredentials):
        await use_case.execute(LoginCommand(identifier="jperez", password="otra-cosa"))

    assert parts["sessions"].sessions == {}
    assert parts["transaction"].commits == 0
    assert len(parts["throttle"].failures) == 1


async def test_usuario_inactivo_devuelve_el_mismo_error_generico() -> None:
    users = FakeUserRepository([build_user(password=PASSWORD, status=UserStatus.INACTIVE)])
    use_case, parts = build_use_case(users=users)

    with pytest.raises(InvalidCredentials) as error:
        await use_case.execute(LoginCommand(identifier="jperez", password=PASSWORD))

    assert str(error.value) == "Credenciales invalidas"
    assert parts["sessions"].sessions == {}


async def test_demasiados_intentos_bloquean_antes_de_consultar_al_usuario() -> None:
    users = FakeUserRepository([build_user(password=PASSWORD)])
    use_case, parts = build_use_case(users=users, throttle=FakeThrottle(blocked=True))

    with pytest.raises(AuthenticationThrottled):
        await use_case.execute(LoginCommand(identifier="jperez", password=PASSWORD))

    assert parts["users"].lookups == []
