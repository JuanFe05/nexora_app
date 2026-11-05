"""Resolucion del usuario autenticado a partir del access token (S10).

Los permisos se consultan en cada request: nunca viajan dentro del JWT, de modo que revocar
una sesion o cambiar una asignacion de rol tiene efecto inmediato.
"""

from __future__ import annotations

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
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._access = access
        self._tokens = tokens
        self._clock = clock
        self._transaction = transaction

    async def execute(self, access_token: str) -> AuthenticatedPrincipal:
        claims = self._tokens.decode_access_token(access_token)
        now = self._clock.now()

        session = await self._sessions.get(claims.session_id)
        if session is None or not session.is_usable(now) or session.user_id != claims.user_id:
            raise SessionNotActive

        user = await self._users.get_by_id(claims.user_id)
        if user is None or not user.is_active:
            raise SessionNotActive

        roles, permissions = await self._access.effective_access(user.id)
        await self._sessions.touch(session.id, now)
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
