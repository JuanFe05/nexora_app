"""Caso de uso de inicio de sesion (S8).

Reglas no negociables:
- El identificador puede ser `nombre_usuario` o `correo`.
- Usuario inexistente, usuario inactivo y contrasena incorrecta producen el mismo error.
- La sesion y el JTI del refresh token se confirman en una unica transaccion.
"""

from __future__ import annotations

from datetime import UTC, timedelta
from uuid import uuid4

from nexora.identity_access.application.dto.auth import (
    IssuedTokens,
    LoginCommand,
    LoginResult,
    UserView,
)
from nexora.identity_access.application.ports.repositories import (
    SessionRepository,
    UserRepository,
)
from nexora.identity_access.application.ports.security import (
    Clock,
    LoginThrottle,
    PasswordHasher,
    TokenService,
)
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.exceptions.identity import InvalidCredentials
from nexora.identity_access.domain.value_objects.login_identifier import LoginIdentifier


class LoginUseCase:
    def __init__(
        self,
        *,
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        tokens: TokenService,
        throttle: LoginThrottle,
        clock: Clock,
        transaction: Transaction,
        absolute_timeout: timedelta = timedelta(hours=12),
        idle_timeout: timedelta = timedelta(minutes=30),
        warning_seconds: int = 120,
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._hasher = hasher
        self._tokens = tokens
        self._throttle = throttle
        self._clock = clock
        self._transaction = transaction
        self._absolute_timeout = absolute_timeout
        self._idle_timeout = idle_timeout
        self._warning_seconds = warning_seconds

    async def execute(self, command: LoginCommand) -> LoginResult:
        identifier = LoginIdentifier(command.identifier)
        throttle_key = f"{command.ip_address or 'none'}:{identifier.value}"
        self._throttle.ensure_allowed(throttle_key)

        user = await self._users.get_by_login_identifier(identifier)
        if not self._is_authentic(user, command.password):
            self._throttle.register_failure(throttle_key)
            raise InvalidCredentials

        assert user is not None  # noqa: S101  (garantizado por _is_authentic)
        now = self._clock.now()
        session_id = uuid4()
        absolute_expires_at = now + self._absolute_timeout
        refresh = self._tokens.issue_refresh_token(
            user_id=user.id,
            session_id=session_id,
            now=now,
            absolute_expires_at=absolute_expires_at,
        )
        access = self._tokens.issue_access_token(user_id=user.id, session_id=session_id, now=now)

        await self._sessions.add(
            Session(
                id=session_id,
                user_id=user.id,
                refresh_token_jti=refresh.token_id,
                created_at=now,
                last_activity_at=now,
                expires_at=absolute_expires_at,
                ip_address=command.ip_address,
                user_agent=command.user_agent,
            )
        )
        await self._transaction.commit()
        self._throttle.reset(throttle_key)

        return LoginResult(
            tokens=IssuedTokens(
                access_token=access.value,
                expires_in=int((access.expires_at - now).total_seconds()),
                refresh_token=refresh.value,
                refresh_expires_at=refresh.expires_at,
                session_id=session_id,
                idle_timeout_seconds=int(self._idle_timeout.total_seconds()),
                warning_seconds=self._warning_seconds,
                session_expires_at=absolute_expires_at.astimezone(UTC),
            ),
            user=UserView(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
            ),
        )

    def _is_authentic(self, user: User | None, password: str) -> bool:
        """Verifica siempre un hash, exista o no el usuario, para no filtrar su existencia."""
        if user is None:
            self._hasher.dummy_verify()
            return False
        if not self._hasher.verify(user.password_hash, password):
            return False
        return user.is_active
