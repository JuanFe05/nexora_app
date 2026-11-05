"""Resolucion del usuario autenticado y de sus permisos efectivos (S10)."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest

from nexora.identity_access.application.use_cases.authentication.authenticate_request import (
    AuthenticateRequestUseCase,
)
from nexora.identity_access.application.use_cases.authentication.logout import LogoutUseCase
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.exceptions.identity import SessionNotActive
from nexora.identity_access.domain.value_objects.enums import UserStatus
from tests.support.fakes import (
    FakeAccessRepository,
    FakeSessionRepository,
    FakeTokenService,
    FakeTransaction,
    FakeUserRepository,
    FixedClock,
    build_user,
)


async def build_scenario(*, status: UserStatus = UserStatus.ACTIVE, roles=((), frozenset())):
    clock = FixedClock()
    user = build_user(status=status)
    users = FakeUserRepository([user])
    sessions = FakeSessionRepository()
    tokens = FakeTokenService()
    now = clock.now()
    session_id = uuid4()
    refresh = tokens.issue_refresh_token(user_id=user.id, session_id=session_id, now=now)
    await sessions.add(
        Session(
            id=session_id,
            user_id=user.id,
            refresh_token_jti=refresh.token_id,
            created_at=now,
            last_activity_at=now,
            expires_at=now + timedelta(days=7),
        )
    )
    access = FakeAccessRepository({user.id: roles})
    transaction = FakeTransaction()
    use_case = AuthenticateRequestUseCase(
        users=users,
        sessions=sessions,
        access=access,
        tokens=tokens,
        clock=clock,
        transaction=transaction,
    )
    token = tokens.issue_access_token(user_id=user.id, session_id=session_id, now=now)
    return (
        use_case,
        token.value,
        {
            "clock": clock,
            "sessions": sessions,
            "session_id": session_id,
            "user": user,
            "transaction": transaction,
        },
    )


async def test_devuelve_el_usuario_con_sus_roles_y_permisos_efectivos() -> None:
    roles = (("admin", "auditor"), frozenset({"identity.users.view", "identity.roles.view"}))
    use_case, token, _ = await build_scenario(roles=roles)

    principal = await use_case.execute(token)

    assert principal.roles == ("admin", "auditor")
    assert principal.has_permission("identity.users.view") is True
    assert principal.has_permission("identity.users.create") is False


async def test_usuario_sin_roles_no_tiene_permisos() -> None:
    use_case, token, _ = await build_scenario()

    principal = await use_case.execute(token)

    assert principal.permissions == frozenset()


async def test_una_sesion_revocada_invalida_el_access_token_vigente() -> None:
    use_case, token, ctx = await build_scenario()
    logout = LogoutUseCase(
        sessions=ctx["sessions"], clock=ctx["clock"], transaction=ctx["transaction"]
    )

    await logout.execute(ctx["session_id"])

    with pytest.raises(SessionNotActive):
        await use_case.execute(token)


async def test_usuario_desactivado_pierde_el_acceso() -> None:
    use_case, token, _ = await build_scenario(status=UserStatus.INACTIVE)

    with pytest.raises(SessionNotActive):
        await use_case.execute(token)


async def test_sesion_vencida_es_rechazada() -> None:
    use_case, token, ctx = await build_scenario()

    ctx["clock"].advance(timedelta(days=8))

    with pytest.raises(SessionNotActive):
        await use_case.execute(token)
