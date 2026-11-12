"""Contrato de origen del informe explícito, independiente del transporte y el almacenamiento."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

from nexora.statistics.domain.filters import ReportFilter


@dataclass(frozen=True, slots=True)
class CatalogOption:
    id: int
    nombre: str


@dataclass(frozen=True, slots=True)
class ReportPage:
    items: list[dict[str, Any]]
    total: int


class ReportSource(Protocol):
    async def sites(self) -> list[CatalogOption]: ...

    async def companies(self) -> list[CatalogOption]: ...

    async def product_lines(self) -> list[CatalogOption]: ...

    async def page(self, filter: ReportFilter, limit: int, offset: int) -> ReportPage: ...

    def stream(self, filter: ReportFilter) -> AsyncIterator[list[dict[str, Any]]]:
        """Todas las filas del filtro, por bloques y en el mismo orden que la tabla."""
        ...


DetailedInvoicesSource = ReportSource
