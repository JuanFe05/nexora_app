"""Puertos y administración de las cuotas moderadoras persistidas."""

import builtins
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID

from nexora.identity_access.application.ports.security import Clock
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.statistics.domain.filters import InvalidReportFilter


class FeeYearNotFound(Exception):
    """La vigencia que se intenta eliminar no existe."""


@dataclass(frozen=True, slots=True)
class FeeSchedule:
    vigencia: int
    importes: tuple[int, ...]
    actualizado_por: str | None
    actualizado_en: datetime


class ModeratorFeeSnapshot(Protocol):
    """Puerto de vida de aplicación; cada lectura debe obtener datos actuales."""

    async def snapshot(self) -> Mapping[int, frozenset[int]]: ...


class ModeratorFeesRepository(Protocol):
    async def list(self) -> list[FeeSchedule]: ...

    async def upsert(
        self, year: int, amounts: tuple[int, ...], actor: UUID, changed_at: datetime
    ) -> FeeSchedule: ...

    async def delete(self, year: int) -> bool: ...


def validate_year(year: int) -> None:
    if not 2000 <= year <= 2100:
        raise InvalidReportFilter("La vigencia debe estar entre 2000 y 2100.")


def validate_amounts(amounts: list[int]) -> tuple[int, ...]:
    if not 1 <= len(amounts) <= 10:
        raise InvalidReportFilter("Debe indicar entre 1 y 10 importes.")
    if any(type(amount) is not int or not 1 <= amount <= 10_000_000 for amount in amounts):
        raise InvalidReportFilter("Los importes deben ser enteros entre 1 y 10000000.")
    if len(set(amounts)) != len(amounts):
        raise InvalidReportFilter("Los importes deben ser únicos.")
    return tuple(sorted(amounts))


class ModeratorFeesAdministration:
    def __init__(
        self, repository: ModeratorFeesRepository, transaction: Transaction, clock: Clock
    ) -> None:
        self._repository, self._transaction, self._clock = repository, transaction, clock

    async def list(self) -> list[FeeSchedule]:
        return await self._repository.list()

    async def upsert(self, year: int, amounts: builtins.list[int], actor: UUID) -> FeeSchedule:
        validate_year(year)
        normalized = validate_amounts(amounts)
        try:
            row = await self._repository.upsert(year, normalized, actor, self._clock.now())
            await self._transaction.commit()
            return row
        except Exception:
            await self._transaction.rollback()
            raise

    async def delete(self, year: int) -> None:
        validate_year(year)
        try:
            if not await self._repository.delete(year):
                raise FeeYearNotFound(
                    f"Registro de cuotas moderadoras de la vigencia {year} no encontrado"
                )
            await self._transaction.commit()
        except Exception:
            await self._transaction.rollback()
            raise
