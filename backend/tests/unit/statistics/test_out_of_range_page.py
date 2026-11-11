from datetime import date
from typing import Any

from nexora.integration_management.application.ports import ReadOnlyQuery
from nexora.statistics.domain.filters import DetailedInvoicesFilter
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)


class OffsetAwareReader:
    """Devuelve filas solo si el offset cae dentro de 3 registros."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def fetch_all(self, query: ReadOnlyQuery, params: Any = None) -> list[dict[str, Any]]:
        self.calls.append(dict(params))
        if params["offset"] >= 3:
            return []
        return [{"nmro_dcto": "A-1", "total_registros": 3}]


async def test_out_of_range_page_keeps_the_real_total() -> None:
    reader = OffsetAwareReader()
    source = SqlServerDetailedInvoicesSource(reader)
    day = date(2026, 1, 31)

    page = await source.page(DetailedInvoicesFilter(day, day, (), ()), 50, 100)

    assert page.items == []
    assert page.total == 3
    assert [call["offset"] for call in reader.calls] == [100, 0]
