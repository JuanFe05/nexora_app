"""Resolucion del usuario autenticado a partir del access token (S10).

Los permisos se consultan en cada request: nunca viajan dentro del JWT, de modo que revocar
una sesion o cambiar una asignacion de rol tiene efecto inmediato.
"""

from __future__ import annotations

from datetime import timedelta

from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal, UserView
from nexora.identity_access.application.ports.repositories import (
    AccessRepository,
    SessionRepository,
    UserRepository,
)
from nexora.identity_access.application.ports.security import Clock, TokenService
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.domain.exceptions.identity import SessionNotActive


class AuthenticateRequestUseCase:
    def __init__(
        self,
        *,
        users: UserRepository,
        sessions: SessionRepository,
        access: AccessRepository,
        tokens: TokenService,
        clock: Clock,
        transaction: Transaction,
        idle_timeout: timedelta = timedelta(minutes=30),
        activity_touch_interval: timedelta = timedelta(seconds=60),
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._access = access
        self._tokens = tokens
        self._clock = clock
        self._transaction = transaction
        self._idle_timeout = idle_timeout
        self._activity_touch_interval = activity_touch_interval

    async def execute(self, access_token: str) -> AuthenticatedPrincipal:
        claims = self._tokens.decode_access_token(access_token)
        now = self._clock.now()

        session = await self._sessions.get(claims.session_id)
        if session is None or session.user_id != claims.user_id:
            raise SessionNotActive
        if not session.is_usable(now, self._idle_timeout):
            if not session.is_revoked:
                await self._sessions.revoke(session.id, now)
                await self._transaction.commit()
            raise SessionNotActive

        user = await self._users.get_by_id(claims.user_id)
        if user is None or not user.is_active:
            raise SessionNotActive

        roles, permissions = await self._access.effective_access(user.id)
        if now - session.last_activity_at >= self._activity_touch_interval:
            await self._sessions.touch(
                session.id,
                now,
                idle_timeout=self._idle_timeout,
                activity_touch_interval=self._activity_touch_interval,
            )
            await self._transaction.commit()

        return AuthenticatedPrincipal(
            user=UserView(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
            ),
            session_id=session.id,
            roles=roles,
            permissions=permissions,
        )
