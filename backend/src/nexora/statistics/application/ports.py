"""Contrato de origen del informe explícito, independiente del transporte y el almacenamiento."""

from dataclasses import dataclass
from typing import Any, Protocol

from nexora.statistics.domain.filters import DetailedInvoicesFilter


@dataclass(frozen=True, slots=True)
class CatalogOption:
    id: int
    nombre: str


@dataclass(frozen=True, slots=True)
class ReportPage:
    items: list[dict[str, Any]]
    total: int


class DetailedInvoicesSource(Protocol):
    async def sites(self) -> list[CatalogOption]: ...

    async def companies(self) -> list[CatalogOption]: ...

    async def page(self, filter: DetailedInvoicesFilter, limit: int, offset: int) -> ReportPage: ...
