"""Transaccion respaldada por la sesion de SQLAlchemy del request."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.infrastructure.persistence.integrity import identity_conflicts


class SqlAlchemyTransaction:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def commit(self) -> None:
        with identity_conflicts():
            await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()
