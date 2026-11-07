"""Refresh con limite absoluto, inactividad y rotacion atomica con gracia acotada."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import NoReturn
from uuid import UUID

from nexora.identity_access.application.dto.auth import IssuedTokens
from nexora.identity_access.application.ports.repositories import SessionRepository
from nexora.identity_access.application.ports.security import Clock, TokenService
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.domain.exceptions.identity import (
    InvalidToken,
    RefreshTokenReused,
    SessionNotActive,
)


@dataclass(frozen=True, slots=True)
class RefreshCommand:
    refresh_token: str = field(repr=False)


class RefreshSessionUseCase:
    def __init__(
        self,
        *,
        sessions: SessionRepository,
        tokens: TokenService,
        clock: Clock,
        transaction: Transaction,
        idle_timeout: timedelta = timedelta(minutes=30),
        rotation_grace: timedelta = timedelta(seconds=30),
    ) -> None:
        self._sessions = sessions
        self._tokens = tokens
        self._clock = clock
        self._transaction = transaction
        self._idle_timeout = idle_timeout
        self._rotation_grace = rotation_grace

    async def execute(self, command: RefreshCommand) -> IssuedTokens:
        # Firma, tipo y claims siempre se verifican. exp se comprueba abajo con el reloj
        # inyectado para poder persistir la revocacion aun cuando el JWT alcanzo el tope.
        claims = self._tokens.decode_refresh_token(command.refresh_token, allow_expired=True)
        now = self._clock.now()
        session = await self._sessions.get(claims.session_id)
        if session is None or session.user_id != claims.user_id:
            raise SessionNotActive
        if not session.is_usable(now, self._idle_timeout):
            await self._fail_rotation(session.id, now)
        if claims.expires_at <= now:
            raise InvalidToken

        refresh = self._tokens.issue_refresh_token(
            user_id=claims.user_id, session_id=claims.session_id, now=now,
            absolute_expires_at=session.expires_at,
        )
        rotated = await self._sessions.rotate_refresh_token(
            session_id=claims.session_id,
            expected_jti=claims.token_id,
            new_jti=refresh.token_id,
            now=now,
            idle_timeout=self._idle_timeout,
            rotation_grace=self._rotation_grace,
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
        # El repositorio relee despues del UPDATE fallido, no usa un snapshot ORM viejo.
        session = await self._sessions.get(session_id)
        if session is not None and not session.is_revoked:
            await self._sessions.revoke(session_id, now)
            await self._transaction.commit()
            if session.is_usable(now, self._idle_timeout):
                raise RefreshTokenReused
            raise SessionNotActive
        await self._transaction.rollback()
        raise SessionNotActive
