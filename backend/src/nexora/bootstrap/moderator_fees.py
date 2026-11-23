"""Composición de configuración estadística con nombres públicos de usuarios IAM."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.application.ports.security import Clock
from nexora.identity_access.infrastructure.persistence.repositories import SqlAlchemyUserRepository
from nexora.identity_access.infrastructure.persistence.transaction import SqlAlchemyTransaction
from nexora.statistics.application.moderator_fees import ModeratorFeesAdministration
from nexora.statistics.infrastructure.persistence.repositories import (
    SqlAlchemyModeratorFeesRepository,
)


def build_moderator_fees_administration(
    session: AsyncSession, clock: Clock
) -> ModeratorFeesAdministration:
    users = SqlAlchemyUserRepository(session)

    async def user_name(user_id: UUID) -> str | None:
        user = await users.get_by_id(user_id)
        return user.full_name if user is not None else None

    return ModeratorFeesAdministration(
        SqlAlchemyModeratorFeesRepository(session, user_name), SqlAlchemyTransaction(session), clock
    )
