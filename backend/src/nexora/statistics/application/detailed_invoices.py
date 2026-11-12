"""Caso de uso de facturas detalladas de solo lectura."""

from collections.abc import AsyncIterator
from typing import Any

from nexora.statistics.application.ports import CatalogOption, DetailedInvoicesSource, ReportPage
from nexora.statistics.domain.filters import DetailedInvoicesFilter, InvalidReportFilter


class DetailedInvoicesReport:
    def __init__(self, source: DetailedInvoicesSource) -> None:
        self._source = source

    async def sites(self) -> list[CatalogOption]:
        return await self._source.sites()

    async def companies(self) -> list[CatalogOption]:
        return await self._source.companies()

    async def page(self, filter: DetailedInvoicesFilter, limit: int, offset: int) -> ReportPage:
        if not 1 <= limit <= 100:
            raise InvalidReportFilter("El límite debe estar entre 1 y 100.")
        if offset < 0:
            raise InvalidReportFilter("El desplazamiento no puede ser negativo.")
        return await self._source.page(filter, limit, offset)

    def export_chunks(self, filter: DetailedInvoicesFilter) -> AsyncIterator[list[dict[str, Any]]]:
        """Exporta todo el resultado del filtro, sin el limite de paginacion de la tabla."""
        return self._source.stream(filter)
