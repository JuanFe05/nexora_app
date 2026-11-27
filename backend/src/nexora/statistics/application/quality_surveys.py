"""Informe de solo lectura sobre las consultas SQL compartidas."""

import asyncio

from nexora.statistics.application.ports import CatalogOption, ReportSource
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.domain.quality_surveys import (
    ADMISSIONS_CUPS,
    EXCLUDED_PRODUCT_LINES,
    project,
)


async def _collect(
    source: ReportSource, filters: ReportFilter, *, admission: bool
) -> list[dict[str, str]]:
    rows = []
    async for chunk in source.stream(filters):
        rows.extend(
            project(raw, admission=admission)
            for raw in chunk
            if str(raw.get("lna_prdcto") or "").strip().casefold() not in EXCLUDED_PRODUCT_LINES
            and (not admission or raw.get("cdgo_prcdmnto") == ADMISSIONS_CUPS)
        )
    return rows


class QualitySurveysReport:
    def __init__(self, invoices: ReportSource, admissions: ReportSource) -> None:
        self._invoices = invoices
        self._admissions = admissions

    async def sites(self) -> list[CatalogOption]:
        return await self._invoices.sites()

    async def companies(self) -> list[CatalogOption]:
        return await self._invoices.companies()

    async def rows(self, filters: ReportFilter) -> list[dict[str, str]]:
        tasks = (
            asyncio.create_task(_collect(self._invoices, filters, admission=False)),
            asyncio.create_task(_collect(self._admissions, filters, admission=True)),
        )
        try:
            invoices, admissions = await asyncio.gather(*tasks)
        except BaseException:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise
        invoices.extend(admissions)
        return invoices
