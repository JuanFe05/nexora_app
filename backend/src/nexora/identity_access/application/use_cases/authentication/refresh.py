"""Rotacion del refresh token (S7).

La rotacion es una unica sentencia condicionada al JTI vigente: si no afecta ninguna fila, o la
sesion murio o el token presentado ya habia sido rotado (reutilizacion), y entonces se revoca.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import NoReturn
from uuid import UUID

from nexora.identity_access.application.dto.auth import IssuedTokens
from nexora.identity_access.application.ports.repositories import SessionRepository
from nexora.identity_access.application.ports.security import Clock, TokenService
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.domain.exceptions.identity import (
    RefreshTokenReused,
    SessionNotActive,
)


@dataclass(frozen=True, slots=True)
class RefreshCommand:
    refresh_token: str


class RefreshSessionUseCase:
    def __init__(
        self,
        *,
        sessions: SessionRepository,
        tokens: TokenService,
        clock: Clock,
        transaction: Transaction,
    ) -> None:
        self._sessions = sessions
        self._tokens = tokens
        self._clock = clock
        self._transaction = transaction

    async def execute(self, command: RefreshCommand) -> IssuedTokens:
        claims = self._tokens.decode_refresh_token(command.refresh_token)
        now = self._clock.now()

        refresh = self._tokens.issue_refresh_token(
            user_id=claims.user_id, session_id=claims.session_id, now=now
        )
        rotated = await self._sessions.rotate_refresh_token(
            session_id=claims.session_id,
            expected_jti=claims.token_id,
            new_jti=refresh.token_id,
            expires_at=refresh.expires_at,
            now=now,
        )
        if not rotated:
            await self._fail_rotation(claims.session_id, now)

        access = self._tokens.issue_access_token(
            user_id=claims.user_id, session_id=claims.session_id, now=now
        )
        await self._transaction.commit()
        return IssuedTokens(
            access_token=access.value,
            expires_in=int((access.expires_at - now).total_seconds()),
            refresh_token=refresh.value,
            refresh_expires_at=refresh.expires_at,
            session_id=claims.session_id,
        )

    async def _fail_rotation(self, session_id: UUID, now: datetime) -> NoReturn:
        session = await self._sessions.get(session_id)
        if session is not None and session.is_usable(now):
            # La sesion vive pero el JTI presentado ya fue rotado: token reutilizado.
            await self._sessions.revoke(session_id, now)
            await self._transaction.commit()
            raise RefreshTokenReused
        await self._transaction.rollback()
        raise SessionNotActive
