"""Dobles en memoria para probar los casos de uso sin infraestructura."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from nexora.identity_access.application.ports.security import IssuedToken
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.exceptions.identity import AuthenticationThrottled
from nexora.identity_access.domain.value_objects.enums import UserStatus
from nexora.identity_access.domain.value_objects.login_identifier import LoginIdentifier

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def build_user(
    *,
    username: str = "jperez",
    email: str = "jperez@nexora.co",
    password: str = "Secreta123*",  # noqa: S107  (dato de prueba, no una credencial real)
    status: UserStatus = UserStatus.ACTIVE,
    user_id: UUID | None = None,
) -> User:
    return User(
        id=user_id or uuid4(),
        username=username,
        email=email,
        password_hash=FakePasswordHasher().hash(password),
        status=status,
        first_name="Juan",
        last_name="Perez",
    )


class FixedClock:
    def __init__(self, now: datetime = NOW) -> None:
        self._now = now

    def now(self) -> datetime:
        return self._now

    def advance(self, delta: timedelta) -> None:
        self._now += delta


class FakePasswordHasher:
    def __init__(self) -> None:
        self.dummy_verifications = 0

    def hash(self, password: str) -> str:
        return f"fake-hash::{password}"

    def verify(self, password_hash: str, password: str) -> bool:
        return password_hash == self.hash(password)

    def dummy_verify(self) -> None:
        self.dummy_verifications += 1


class FakeUserRepository:
    def __init__(self, users: list[User] | None = None) -> None:
        self.users = list(users or [])
        self.lookups: list[str] = []

    async def get_by_login_identifier(self, identifier: LoginIdentifier) -> User | None:
        self.lookups.append(identifier.value)
        for user in self.users:
            if identifier.value in (user.username.lower(), user.email.lower()):
                return user
        return None

    async def get_by_id(self, user_id: UUID) -> User | None:
        return next((user for user in self.users if user.id == user_id), None)


class FakeSessionRepository:
    def __init__(self) -> None:
        self.sessions: dict[UUID, Session] = {}

    async def add(self, session: Session) -> None:
        self.sessions[session.id] = session

    async def get(self, session_id: UUID) -> Session | None:
        return self.sessions.get(session_id)

    async def rotate_refresh_token(
        self,
        *,
        session_id: UUID,
        expected_jti: UUID,
        new_jti: UUID,
        expires_at: datetime,
        now: datetime,
    ) -> bool:
        session = self.sessions.get(session_id)
        if session is None or not session.is_usable(now):
            return False
        if session.refresh_token_jti != expected_jti:
            return False
        self.sessions[session_id] = Session(
            id=session.id,
            user_id=session.user_id,
            refresh_token_jti=new_jti,
            created_at=session.created_at,
            last_activity_at=now,
            expires_at=expires_at,
            revoked_at=None,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
        )
        return True

    async def revoke(self, session_id: UUID, now: datetime) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.is_revoked:
            return
        self.sessions[session_id] = Session(
            id=session.id,
            user_id=session.user_id,
            refresh_token_jti=session.refresh_token_jti,
            created_at=session.created_at,
            last_activity_at=session.last_activity_at,
            expires_at=session.expires_at,
            revoked_at=now,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
        )

    async def touch(self, session_id: UUID, now: datetime) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        self.sessions[session_id] = Session(
            id=session.id,
            user_id=session.user_id,
            refresh_token_jti=session.refresh_token_jti,
            created_at=session.created_at,
            last_activity_at=now,
            expires_at=session.expires_at,
            revoked_at=session.revoked_at,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
        )


class FakeAccessRepository:
    def __init__(
        self,
        access: dict[UUID, tuple[tuple[str, ...], frozenset[str]]] | None = None,
    ) -> None:
        self.access = access or {}

    async def effective_access(self, user_id: UUID) -> tuple[tuple[str, ...], frozenset[str]]:
        return self.access.get(user_id, ((), frozenset()))


class FakeTokenService:
    """Tokens deterministas: `<tipo>:<sid>:<jti>`."""

    def __init__(self, access_ttl_seconds: int = 600, refresh_ttl_days: int = 7) -> None:
        self.access_ttl_seconds = access_ttl_seconds
        self.refresh_ttl_days = refresh_ttl_days
        self.issued: list[IssuedToken] = []

    def issue_access_token(self, *, user_id: UUID, session_id: UUID, now: datetime) -> IssuedToken:
        token_id = uuid4()
        issued = IssuedToken(
            value=f"access:{session_id}:{token_id}",
            token_id=token_id,
            expires_at=now + timedelta(seconds=self.access_ttl_seconds),
        )
        self.issued.append(issued)
        return issued

    def issue_refresh_token(self, *, user_id: UUID, session_id: UUID, now: datetime) -> IssuedToken:
        token_id = uuid4()
        issued = IssuedToken(
            value=f"refresh:{session_id}:{token_id}",
            token_id=token_id,
            expires_at=now + timedelta(days=self.refresh_ttl_days),
        )
        self.issued.append(issued)
        return issued


class FakeThrottle:
    def __init__(self, *, blocked: bool = False) -> None:
        self.blocked = blocked
        self.failures: list[str] = []
        self.resets: list[str] = []

    def ensure_allowed(self, key: str) -> None:
        if self.blocked:
            raise AuthenticationThrottled(retry_after_seconds=900)

    def register_failure(self, key: str) -> None:
        self.failures.append(key)

    def reset(self, key: str) -> None:
        self.resets.append(key)


class FakeTransaction:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1
