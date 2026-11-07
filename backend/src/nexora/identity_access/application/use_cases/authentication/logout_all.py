"""Revoca todas las sesiones del usuario autenticado en una transaccion."""

from __future__ import annotations

from uuid import UUID

from nexora.identity_access.application.ports.repositories import SessionRepository
from nexora.identity_access.application.ports.security import Clock
from nexora.identity_access.application.ports.transaction import Transaction


class LogoutAllUseCase:
    def __init__(
        self, *, sessions: SessionRepository, clock: Clock, transaction: Transaction
    ) -> None:
        self._sessions = sessions
        self._clock = clock
        self._transaction = transaction

    async def execute(self, user_id: UUID) -> None:
        await self._sessions.revoke_all_for_user(user_id, self._clock.now())
        await self._transaction.commit()
