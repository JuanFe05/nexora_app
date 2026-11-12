"""Perfil propio: reglas de credenciales sin infraestructura ni roles privilegiados."""

from dataclasses import replace
from datetime import timedelta
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal, UserView
from nexora.identity_access.application.use_cases.profile import (
    PasswordChange,
    ProfileChanges,
    ProfileService,
)
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.exceptions.identity import (
    AuthenticationThrottled,
    ConflictError,
    IncorrectCurrentPassword,
    ResourceNotFound,
    SessionNotActive,
)
from tests.support.fakes import (
    NOW,
    FakeAccessRepository,
    FakePasswordHasher,
    FakeSessionRepository,
    FakeThrottle,
    FakeTransaction,
    FakeUserRepository,
    FixedClock,
    build_user,
)

OLD = "Anterior123456*"
NEW = "Nueva123456789*"


@pytest.fixture
def parts():
    user = build_user(password=OLD)
    other = build_user(username="other", email="other@example.test")
    users = FakeUserRepository([user, other])
    sessions = FakeSessionRepository()
    current = Session(
        id=uuid4(),
        user_id=user.id,
        refresh_token_jti=uuid4(),
        created_at=NOW,
        last_activity_at=NOW,
        expires_at=NOW + timedelta(days=1),
    )
    sessions.sessions = {
        current.id: current,
        (second := uuid4()): replace(current, id=second),
        (foreign := uuid4()): replace(current, id=foreign, user_id=other.id),
    }
    principal = AuthenticatedPrincipal(
        UserView(user.id, user.username, user.email, user.full_name), current.id
    )
    admin = AsyncMock()
    admin.find_user.return_value = []
    admin.update_user.side_effect = users.update_profile
    throttle, tx = FakeThrottle(), FakeTransaction()
    service = ProfileService(
        users=users,
        sessions=sessions,
        access=FakeAccessRepository(),
        administration=admin,
        hasher=FakePasswordHasher(),
        throttle=throttle,
        clock=FixedClock(),
        transaction=tx,
    )
    return service, users, sessions, admin, throttle, tx, principal


async def test_get_and_update_only_caller_without_roles(parts):
    service, users, _, admin, _, tx, principal = parts
    before_other = users.users[1]
    result = await service.get(principal)
    assert result.user == users.users[0]
    assert result.roles == ()
    updated = await service.update(
        principal, ProfileChanges(email="own@example.test", first_name="Ana")
    )
    assert updated.user.email == "own@example.test"
    assert updated.user.first_name == "ANA"
    assert updated.user.username == "jperez"
    assert users.users[1] == before_other
    admin.lock_access_changes.assert_awaited_once()
    assert tx.commits == 1


async def test_email_conflict_rejects_without_write_and_own_email_is_allowed(parts):
    service, users, _, admin, _, tx, principal = parts
    before = users.users.copy()
    admin.find_user.return_value = [users.users[1]]
    with pytest.raises(ConflictError):
        await service.update(principal, ProfileChanges(email="OTHER@example.test"))
    assert users.users == before
    assert tx.commits == 0
    admin.update_user.assert_not_awaited()
    admin.find_user.return_value = [users.users[0]]
    await service.update(principal, ProfileChanges(email=users.users[0].email))
    assert tx.commits == 1


async def test_wrong_password_registers_failure_without_mutation(parts):
    service, users, sessions, _, throttle, tx, principal = parts
    before = users.users.copy(), sessions.sessions.copy()
    with pytest.raises(IncorrectCurrentPassword, match="La contrasena actual es incorrecta"):
        await service.change_password(principal, PasswordChange("incorrecta", NEW))
    assert (users.users, sessions.sessions) == before
    assert throttle.failures == [f"password:{principal.user.id}"]
    assert throttle.resets == []
    assert tx.commits == 0


async def test_blocked_password_attempt_does_not_read_or_mutate(parts):
    service, users, sessions, _, throttle, tx, principal = parts
    throttle.blocked = True
    service._users = AsyncMock()
    before = users.users.copy(), sessions.sessions.copy()
    with pytest.raises(AuthenticationThrottled):
        await service.change_password(principal, PasswordChange(OLD, NEW))
    service._users.get_for_update.assert_not_awaited()
    assert (users.users, sessions.sessions) == before
    assert tx.commits == 0
    assert throttle.failures == throttle.resets == []


async def test_password_success_preserves_current_and_foreign_sessions(parts):
    service, users, sessions, _, throttle, tx, principal = parts
    before_other = users.users[1]
    await service.change_password(principal, PasswordChange(OLD, NEW))
    user = await users.get_by_id(principal.user.id)
    assert FakePasswordHasher().verify(user.password_hash, NEW)
    assert not FakePasswordHasher().verify(user.password_hash, OLD)
    assert user.password_changed_at == NOW
    assert users.users[1] == before_other
    for session in sessions.sessions.values():
        assert session.revoked_at == (
            NOW if session.user_id == user.id and session.id != principal.session_id else None
        )
    assert tx.commits == 1
    assert throttle.resets == [f"password:{user.id}"]
    assert throttle.failures == []


async def test_revoked_current_session_cannot_change_password(parts):
    service, users, sessions, _, throttle, tx, principal = parts
    await sessions.revoke(principal.session_id, NOW)
    before = users.users.copy(), sessions.sessions.copy()
    with pytest.raises(SessionNotActive):
        await service.change_password(principal, PasswordChange(OLD, NEW))
    assert (users.users, sessions.sessions) == before
    assert tx.commits == 0
    assert throttle.resets == []


async def test_persistence_failure_rolls_back_and_does_not_reset_throttle(parts):
    service, _, _, _, throttle, tx, principal = parts
    service._sessions.revoke_all_except = AsyncMock(side_effect=RuntimeError("failure"))
    with pytest.raises(RuntimeError, match="failure"):
        await service.change_password(principal, PasswordChange(OLD, NEW))
    assert tx.commits == 0
    assert tx.rollbacks == 1
    assert throttle.resets == []


async def test_list_usable_sessions_is_own_current_first_and_secret_free(parts):
    service, _, sessions, _, _, tx, principal = parts
    current = sessions.sessions[principal.session_id]
    second = next(
        s for s in sessions.sessions.values() if s.id != current.id and s.user_id == current.user_id
    )
    sessions.sessions[current.id] = replace(current, last_activity_at=NOW - timedelta(seconds=10))
    for changes in (
        {"revoked_at": NOW},
        {"expires_at": NOW},
        {"last_activity_at": NOW - timedelta(minutes=30)},
    ):
        expired = replace(current, id=uuid4(), **changes)
        await sessions.add(expired)
    before = sessions.sessions.copy()
    result = await service.list_sessions(principal)
    assert [item.id for item in result] == [current.id, second.id]
    assert [item.current for item in result] == [True, False]
    assert result[0].created_at == current.created_at
    assert result[0].last_activity_at == NOW - timedelta(seconds=10)
    assert result[0].expires_at == current.expires_at
    assert result[0].ip_address is None
    assert result[0].user_agent is None
    assert not hasattr(result[0], "refresh_token_jti")
    assert sessions.sessions == before
    assert tx.commits == tx.rollbacks == 0


async def test_revoke_own_other_session_only(parts):
    service, _, sessions, admin, _, tx, principal = parts
    target = next(
        s
        for s in sessions.sessions.values()
        if s.id != principal.session_id and s.user_id == principal.user.id
    )
    before = sessions.sessions.copy()
    await service.revoke_session(principal, target.id)
    assert sessions.sessions[target.id] == replace(target, revoked_at=NOW, last_activity_at=NOW)
    assert all(sessions.sessions[key] == value for key, value in before.items() if key != target.id)
    admin.lock_access_changes.assert_awaited_once()
    assert tx.commits == 1


@pytest.mark.parametrize("kind", ["missing", "foreign", "revoked", "absolute", "idle", "current"])
async def test_revoke_rejected_session_never_mutates(parts, kind):
    service, _, sessions, _, throttle, tx, principal = parts
    target = sessions.sessions[principal.session_id]
    target = replace(target, id=uuid4())
    if kind == "foreign":
        target = replace(target, user_id=uuid4())
    elif kind == "revoked":
        target = replace(target, revoked_at=NOW)
    elif kind == "absolute":
        target = replace(target, expires_at=NOW)
    elif kind == "idle":
        target = replace(target, last_activity_at=NOW - timedelta(minutes=30))
    elif kind == "current":
        target = sessions.sessions[principal.session_id]
    if kind != "missing":
        await sessions.add(target)
    before = sessions.sessions.copy()
    error = ConflictError if kind == "current" else ResourceNotFound
    message = (
        "Para cerrar la sesion actual, use «Cerrar sesión»"
        if kind == "current"
        else "Recurso no encontrado"
    )
    with pytest.raises(error) as caught:
        await service.revoke_session(principal, target.id)
    assert str(caught.value) == message
    assert sessions.sessions == before
    assert tx.commits == 0
    assert tx.rollbacks == 1
    assert throttle.failures == throttle.resets == []


async def test_revoke_persistence_failure_rolls_back(parts):
    service, _, sessions, _, _, tx, principal = parts
    target = next(
        s
        for s in sessions.sessions.values()
        if s.id != principal.session_id and s.user_id == principal.user.id
    )
    sessions.revoke = AsyncMock(side_effect=RuntimeError("failure"))
    with pytest.raises(RuntimeError, match="failure"):
        await service.revoke_session(principal, target.id)
    assert tx.commits == 0
    assert tx.rollbacks == 1


def test_password_and_hash_never_appear_in_repr():
    command = PasswordChange(OLD, NEW)
    assert OLD not in repr(command)
    assert NEW not in repr(command)
    user = build_user(password=OLD)
    assert user.password_hash not in repr(user)
    assert OLD not in repr(user)
