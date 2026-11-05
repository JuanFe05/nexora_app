"""Rotacion, revocacion y reutilizacion del refresh token (S7)."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest

from nexora.identity_access.application.use_cases.authentication.refresh import (
    RefreshCommand,
    RefreshSessionUseCase,
)
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.exceptions.identity import (
    RefreshTokenReused,
    SessionNotActive,
)
from tests.support.fakes import (
    FakeSessionRepository,
    FakeTokenService,
    FakeTransaction,
    FixedClock,
)


def build_case(clock: FixedClock | None = None) -> tuple[RefreshSessionUseCase, dict[str, object]]:
    parts: dict[str, object] = {
        "sessions": FakeSessionRepository(),
        "tokens": FakeTokenService(),
        "clock": clock or FixedClock(),
        "transaction": FakeTransaction(),
    }
    use_case = RefreshSessionUseCase(
        sessions=parts["sessions"],
        tokens=parts["tokens"],
        clock=parts["clock"],
        transaction=parts["transaction"],
    )
    return use_case, parts


async def seed_session(parts: dict[str, object], *, revoked: bool = False, ttl_days: int = 7):
    clock = parts["clock"]
    now = clock.now()
    session_id, user_id = uuid4(), uuid4()
    issued = parts["tokens"].issue_refresh_token(user_id=user_id, session_id=session_id, now=now)
    await parts["sessions"].add(
        Session(
            id=session_id,
            user_id=user_id,
            refresh_token_jti=issued.token_id,
            created_at=now,
            last_activity_at=now,
            expires_at=now + timedelta(days=ttl_days),
            revoked_at=now if revoked else None,
        )
    )
    return session_id, issued


async def test_refresh_valido_rota_el_jti_y_devuelve_tokens_nuevos() -> None:
    use_case, parts = build_case()
    session_id, issued = await seed_session(parts)

    tokens = await use_case.execute(RefreshCommand(refresh_token=issued.value))

    stored = parts["sessions"].sessions[session_id]
    assert stored.refresh_token_jti != issued.token_id
    assert str(stored.refresh_token_jti) in tokens.refresh_token
    assert tokens.session_id == session_id
    assert parts["transaction"].commits == 1


async def test_reutilizar_un_refresh_ya_rotado_revoca_la_sesion() -> None:
    use_case, parts = build_case()
    session_id, primero = await seed_session(parts)
    await use_case.execute(RefreshCommand(refresh_token=primero.value))

    with pytest.raises(RefreshTokenReused):
        await use_case.execute(RefreshCommand(refresh_token=primero.value))

    assert parts["sessions"].sessions[session_id].is_revoked is True


async def test_refresh_de_una_sesion_revocada_es_rechazado() -> None:
    use_case, parts = build_case()
    _, issued = await seed_session(parts, revoked=True)

    with pytest.raises(SessionNotActive):
        await use_case.execute(RefreshCommand(refresh_token=issued.value))


async def test_refresh_de_una_sesion_vencida_es_rechazado() -> None:
    clock = FixedClock()
    use_case, parts = build_case(clock)
    _, issued = await seed_session(parts, ttl_days=1)

    clock.advance(timedelta(days=2))

    with pytest.raises(SessionNotActive):
        await use_case.execute(RefreshCommand(refresh_token=issued.value))
