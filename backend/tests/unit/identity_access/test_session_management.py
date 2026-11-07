"""Politica de sesion y concurrencia usando interfaces publicas y reloj controlado."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from nexora.bootstrap.settings import Settings
from nexora.identity_access.application.dto.auth import LoginCommand
from nexora.identity_access.application.use_cases.authentication.refresh import RefreshCommand
from nexora.identity_access.domain.exceptions.identity import RefreshTokenReused, SessionNotActive
from tests.unit.identity_access.test_authenticate_request_use_case import build_scenario
from tests.unit.identity_access.test_login_use_case import PASSWORD, build_use_case
from tests.unit.identity_access.test_refresh_use_case import build_case, seed_session


@pytest.mark.parametrize("seconds", [0, 59, 60, 61])
async def test_request_activity_is_throttled_at_the_boundary(seconds: int) -> None:
    case, token, ctx = await build_scenario()
    before = await ctx["sessions"].get(ctx["session_id"])
    ctx["clock"].advance(timedelta(seconds=seconds))
    principal = await case.execute(token)
    after = await ctx["sessions"].get(principal.session_id)
    assert after.last_activity_at == (
        ctx["clock"].now() if seconds >= 60 else before.last_activity_at
    )
    assert after.expires_at == before.expires_at
    assert not after.is_revoked
    assert ctx["transaction"].commits == (1 if seconds >= 60 else 0)


@pytest.mark.parametrize("limit", ["idle", "absolute"])
async def test_request_expiration_is_revoked_and_committed(limit: str) -> None:
    case, token, ctx = await build_scenario()
    session = await ctx["sessions"].get(ctx["session_id"])
    if limit == "absolute":
        await ctx["sessions"].add(replace(session, expires_at=ctx["clock"].now()))
    else:
        ctx["clock"].advance(timedelta(minutes=30))
    with pytest.raises(SessionNotActive):
        await case.execute(token)
    stored = await ctx["sessions"].get(ctx["session_id"])
    assert stored.revoked_at == ctx["clock"].now()
    assert stored.refresh_token_jti == session.refresh_token_jti
    assert stored.expires_at == (ctx["clock"].now() if limit == "absolute" else session.expires_at)
    assert ctx["transaction"].commits == 1


async def test_active_requests_slide_idle_but_never_absolute_limit() -> None:
    case, token, ctx = await build_scenario()
    session = await ctx["sessions"].get(ctx["session_id"])
    await ctx["sessions"].add(replace(session, expires_at=ctx["clock"].now() + timedelta(hours=1)))
    for _ in range(2):
        ctx["clock"].advance(timedelta(minutes=20))
        assert (await case.execute(token)).session_id == session.id
    ctx["clock"].advance(timedelta(minutes=20))
    with pytest.raises(SessionNotActive):
        await case.execute(token)
    assert (await ctx["sessions"].get(session.id)).revoked_at == ctx["clock"].now()


async def test_login_sets_absolute_cap_and_caps_refresh_expiration() -> None:
    case, ctx = build_use_case()
    result = await case.execute(LoginCommand(identifier="jperez", password=PASSWORD))
    session = await ctx["sessions"].get(result.tokens.session_id)
    assert session.expires_at == ctx["clock"].now() + timedelta(hours=12)
    assert result.tokens.refresh_expires_at == session.expires_at
    claims = ctx["tokens"].decode_refresh_token(result.tokens.refresh_token)
    assert claims.expires_at == session.expires_at
    assert result.tokens.expires_in == 600
    assert ctx["transaction"].commits == 1


@pytest.mark.parametrize("concurrent", [False, True])
async def test_duplicate_cookie_and_lost_response_retry_succeed(concurrent: bool) -> None:
    case, ctx = build_case()
    sid, original = await seed_session(ctx)
    before = await ctx["sessions"].get(sid)
    command = RefreshCommand(refresh_token=original.value)
    if concurrent:
        first, retry = await asyncio.gather(case.execute(command), case.execute(command))
    else:
        first = await case.execute(command)
        ctx["clock"].advance(timedelta(seconds=10))
        retry = await case.execute(command)
    assert first.refresh_token != retry.refresh_token
    session = await ctx["sessions"].get(sid)
    assert not session.is_revoked
    assert session.expires_at == before.expires_at
    assert session.last_activity_at == ctx["clock"].now()
    first_claims = ctx["tokens"].decode_refresh_token(first.refresh_token)
    retry_claims = ctx["tokens"].decode_refresh_token(retry.refresh_token)
    assert session.previous_refresh_token_jti == first_claims.token_id
    assert session.refresh_rotated_at == ctx["clock"].now()
    assert retry_claims.token_id == session.refresh_token_jti
    assert ctx["transaction"].commits == 2


@pytest.mark.parametrize("seconds", [30, 31])
async def test_previous_jti_grace_boundary(seconds: int) -> None:
    case, ctx = build_case()
    sid, original = await seed_session(ctx)
    await case.execute(RefreshCommand(refresh_token=original.value))
    ctx["clock"].advance(timedelta(seconds=seconds))
    if seconds == 30:
        await case.execute(RefreshCommand(refresh_token=original.value))
        assert not (await ctx["sessions"].get(sid)).is_revoked
    else:
        before = await ctx["sessions"].get(sid)
        with pytest.raises(RefreshTokenReused):
            await case.execute(RefreshCommand(refresh_token=original.value))
        after = await ctx["sessions"].get(sid)
        assert after.revoked_at == ctx["clock"].now()
        assert after.refresh_token_jti == before.refresh_token_jti
        assert after.expires_at == before.expires_at
    assert ctx["transaction"].commits == 2


async def test_jti_older_than_previous_is_reuse_even_inside_grace() -> None:
    case, ctx = build_case()
    sid, original = await seed_session(ctx)
    first = await case.execute(RefreshCommand(refresh_token=original.value))
    await case.execute(RefreshCommand(refresh_token=first.refresh_token))
    before = await ctx["sessions"].get(sid)
    with pytest.raises(RefreshTokenReused):
        await case.execute(RefreshCommand(refresh_token=original.value))
    after = await ctx["sessions"].get(sid)
    assert after.revoked_at == ctx["clock"].now()
    assert after.refresh_token_jti == before.refresh_token_jti
    assert ctx["transaction"].commits == 3


@pytest.mark.parametrize("limit", ["idle", "absolute"])
async def test_refresh_expiration_is_revoked_without_issuing_tokens(limit: str) -> None:
    case, ctx = build_case()
    sid, original = await seed_session(ctx)
    before = await ctx["sessions"].get(sid)
    if limit == "absolute":
        await ctx["sessions"].add(replace(before, expires_at=ctx["clock"].now()))
    else:
        ctx["clock"].advance(timedelta(minutes=30))
    issued_count = len(ctx["tokens"].issued)
    with pytest.raises(SessionNotActive):
        await case.execute(RefreshCommand(refresh_token=original.value))
    after = await ctx["sessions"].get(sid)
    assert after.revoked_at == ctx["clock"].now()
    assert after.refresh_token_jti == before.refresh_token_jti
    assert len(ctx["tokens"].issued) == issued_count
    assert ctx["transaction"].commits == 1


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("session_idle_timeout_minutes", 0),
        ("session_absolute_timeout_hours", 0),
        ("refresh_rotation_grace_seconds", 0),
        ("session_activity_touch_seconds", 0),
        ("session_idle_timeout_minutes", 1441),
        ("session_absolute_timeout_hours", 169),
        ("refresh_rotation_grace_seconds", 301),
        ("session_activity_touch_seconds", 301),
    ],
)
def test_session_settings_reject_invalid_bounds(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: value})


def test_idle_must_not_exceed_absolute_cap() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, session_idle_timeout_minutes=61, session_absolute_timeout_hours=1)


def test_session_settings_defaults() -> None:
    settings = Settings(_env_file=None)
    assert settings.session_idle_timeout_minutes == 30
    assert settings.session_absolute_timeout_hours == 12
    assert settings.refresh_rotation_grace_seconds == 30
    assert settings.session_activity_touch_seconds == 60


async def test_logout_all_revokes_only_target_user_including_expired_sessions() -> None:
    from nexora.identity_access.application.use_cases.authentication.logout_all import (
        LogoutAllUseCase,
    )

    case, ctx = build_case()
    sid, _ = await seed_session(ctx)
    session = await ctx["sessions"].get(sid)
    other_device = replace(session, id=uuid4(), refresh_token_jti=uuid4())
    expired = replace(session, id=uuid4(), refresh_token_jti=uuid4(), expires_at=ctx["clock"].now())
    other_user = replace(session, id=uuid4(), user_id=uuid4(), refresh_token_jti=uuid4())
    for entry in (other_device, expired, other_user):
        await ctx["sessions"].add(entry)
    logout = LogoutAllUseCase(
        sessions=ctx["sessions"], clock=ctx["clock"], transaction=ctx["transaction"]
    )
    await logout.execute(session.user_id)
    for entry in (session, other_device, expired):
        assert (await ctx["sessions"].get(entry.id)).revoked_at == ctx["clock"].now()
    assert await ctx["sessions"].get(other_user.id) == other_user
    assert ctx["transaction"].commits == 1
    with pytest.raises(SessionNotActive):
        await case.execute(RefreshCommand(refresh_token=ctx["tokens"].issued[0].value))


async def test_signed_expired_refresh_still_persists_session_revocation() -> None:
    from nexora.identity_access.application.use_cases.authentication.refresh import (
        RefreshSessionUseCase,
    )
    from nexora.identity_access.domain.entities.session import Session
    from tests.support.fakes import FakeSessionRepository, FakeTransaction, FixedClock
    from tests.unit.identity_access.test_token_service import build_service

    now = datetime.now(UTC)
    clock = FixedClock(now)
    tokens = build_service()
    sid, uid = uuid4(), uuid4()
    expired = now - timedelta(seconds=1)
    issued = tokens.issue_refresh_token(
        user_id=uid, session_id=sid, now=now - timedelta(hours=12),
        absolute_expires_at=expired,
    )
    sessions, tx = FakeSessionRepository(), FakeTransaction()
    await sessions.add(Session(
        id=sid, user_id=uid, refresh_token_jti=issued.token_id,
        created_at=now - timedelta(hours=12), last_activity_at=now,
        expires_at=expired,
    ))
    case = RefreshSessionUseCase(sessions=sessions, tokens=tokens, clock=clock, transaction=tx)
    with pytest.raises(SessionNotActive):
        await case.execute(RefreshCommand(refresh_token=issued.value))
    assert (await sessions.get(sid)).revoked_at == now
    assert tx.commits == 1


async def test_refresh_activity_slides_idle_and_caps_refresh_ttl() -> None:
    case, ctx = build_case()
    sid, original = await seed_session(ctx)
    before = await ctx["sessions"].get(sid)
    absolute = ctx["clock"].now() + timedelta(hours=1)
    await ctx["sessions"].add(replace(before, expires_at=absolute))
    ctx["clock"].advance(timedelta(minutes=29))
    first = await case.execute(RefreshCommand(refresh_token=original.value))
    ctx["clock"].advance(timedelta(minutes=29))
    second = await case.execute(RefreshCommand(refresh_token=first.refresh_token))
    assert second.refresh_expires_at == absolute
    session = await ctx["sessions"].get(sid)
    assert session.last_activity_at == ctx["clock"].now()
    assert session.expires_at == absolute
    assert not session.is_revoked
    ctx["clock"].advance(timedelta(minutes=2))
    with pytest.raises(SessionNotActive):
        await case.execute(RefreshCommand(refresh_token=second.refresh_token))
    assert (await ctx["sessions"].get(sid)).revoked_at == absolute
    assert ctx["transaction"].commits == 3


def test_session_settings_load_nexora_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEXORA_SESSION_IDLE_TIMEOUT_MINUTES", "15")
    monkeypatch.setenv("NEXORA_SESSION_ABSOLUTE_TIMEOUT_HOURS", "6")
    monkeypatch.setenv("NEXORA_REFRESH_ROTATION_GRACE_SECONDS", "10")
    monkeypatch.setenv("NEXORA_SESSION_ACTIVITY_TOUCH_SECONDS", "20")
    settings = Settings(_env_file=None)
    assert settings.session_idle_timeout_minutes == 15
    assert settings.session_absolute_timeout_hours == 6
    assert settings.refresh_rotation_grace_seconds == 10
    assert settings.session_activity_touch_seconds == 20
