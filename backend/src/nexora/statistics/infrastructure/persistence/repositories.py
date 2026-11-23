"""Repositorio por petición y adaptador de instantáneas de vida de aplicación."""

from collections.abc import AsyncIterator, Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.statistics.application.moderator_fees import FeeSchedule
from nexora.statistics.infrastructure.persistence.mappers import fee_to_read
from nexora.statistics.infrastructure.persistence.models import ModeratorFeeModel


class SqlAlchemyModeratorFeesRepository:
    def __init__(
        self, session: AsyncSession, user_name: Callable[[UUID], Awaitable[str | None]]
    ) -> None:
        self._session, self._user_name = session, user_name

    async def _read(self, model: ModeratorFeeModel) -> FeeSchedule:
        name = await self._user_name(model.updated_by) if model.updated_by is not None else None
        return fee_to_read(model, name)

    async def list(self) -> list[FeeSchedule]:
        rows = await self._session.execute(
            select(ModeratorFeeModel).order_by(ModeratorFeeModel.year.desc())
        )
        return [await self._read(model) for model in rows.scalars()]

    async def upsert(
        self, year: int, amounts: tuple[int, ...], actor: UUID, changed_at: datetime
    ) -> FeeSchedule:
        statement = insert(ModeratorFeeModel).values(
            year=year, amounts=list(amounts), updated_by=actor, updated_at=changed_at
        )
        await self._session.execute(
            statement.on_conflict_do_update(
                index_elements=[ModeratorFeeModel.year],
                set_={
                    "importes": statement.excluded.importes,
                    "actualizado_por": statement.excluded.actualizado_por,
                    "actualizado_en": statement.excluded.actualizado_en,
                },
            )
        )
        # populate_existing evita devolver una versión anterior del identity map de la petición.
        model = (
            await self._session.execute(
                select(ModeratorFeeModel)
                .where(ModeratorFeeModel.year == year)
                .execution_options(populate_existing=True)
            )
        ).scalar_one()
        return await self._read(model)

    async def delete(self, year: int) -> bool:
        result = await self._session.execute(
            delete(ModeratorFeeModel)
            .where(ModeratorFeeModel.year == year)
            .returning(ModeratorFeeModel.year)
        )
        return result.scalar_one_or_none() is not None


class DatabaseModeratorFeeSnapshot:
    """Retiene solo la fábrica; abre/cierra su propia sesión para cada consulta/exportación."""

    def __init__(self, sessions: Callable[[], AsyncIterator[AsyncSession]]) -> None:
        self._sessions = sessions

    async def snapshot(self) -> Mapping[int, frozenset[int]]:
        # El context manager cierra el generador y la sesión también ante error o cancelación.
        async with asynccontextmanager(self._sessions)() as session:
            rows = await session.execute(select(ModeratorFeeModel.year, ModeratorFeeModel.amounts))
            return {year: frozenset(amounts) for year, amounts in rows.all()}
