"""Disk-spool reuse, expiry, concurrency and cleanup through ReportSource's public API."""

import asyncio
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from tests.unit.statistics.test_detailed_invoices import END, START, FakeReader
from tests.unit.statistics.test_general_billing import record

from nexora.integration_management.application.ports import ExternalQueryFailed
from nexora.statistics.application.report import Report
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.infrastructure.general_billing_source import GeneralBillingSource
from nexora.statistics.infrastructure.queries.detailed_invoices import (
    DETAILED_INVOICES_EXPORT_QUERY,
)

FILTER = ReportFilter(START, END, (3,), (4,), (5,))


async def exported(
    source: GeneralBillingSource, filter: ReportFilter = FILTER
) -> list[dict[str, Any]]:
    return [row async for chunk in source.stream(filter) for row in chunk]


async def test_page_export_reuse_exact_numbers_and_single_sql_stream() -> None:
    reader = FakeReader([record(), record(cntdd1="0.20"), record(cnsctvo_dcto="2")])
    source = GeneralBillingSource(reader)
    try:
        page = await Report(source).page(FILTER, 1, 1)
        assert page.total == 3 and len(page.items) == 1
        assert page.items[0]["total_cntdd1"] == 0
        rows = await exported(source)
        assert rows[0]["total_cntdd1"] == Decimal("0.30")
        assert not isinstance(rows[0]["total_cntdd1"], float)
        assert rows[1] == page.items[0]
        outside = await source.page(FILTER, 2, 99)
        assert outside.items == [] and outside.total == 3
        assert len(reader.calls) == 1 and reader.calls[0][0] == DETAILED_INVOICES_EXPORT_QUERY
        params = reader.calls[0][1]
        assert params is not None and params["lineas"] == [5] and params["sedes"] == [3]
        assert "limit" not in params and "offset" not in params
    finally:
        await source.aclose()


async def test_single_flight_and_filter_isolation() -> None:
    reader = FakeReader([record()])
    source = GeneralBillingSource(reader)
    try:
        results = await asyncio.gather(*(source.page(FILTER, 1, 0) for _ in range(8)))
        assert all(r == results[0] for r in results)
        assert len(reader.calls) == 1
        await exported(source, ReportFilter(START, END, (3,), (4,), (6,)))
        assert len(reader.calls) == 2
    finally:
        await source.aclose()


@pytest.mark.parametrize(("limit", "offset"), [(0, 0), (101, 0), (1, -1)])
async def test_invalid_page_has_no_sql_or_spool_effect(limit: int, offset: int) -> None:
    reader = FakeReader([record()])
    source = GeneralBillingSource(reader)
    try:
        with pytest.raises(InvalidReportFilter):
            await Report(source).page(FILTER, limit, offset)
        assert reader.calls == [] and source.spool_directory is None
    finally:
        await source.aclose()


async def test_empty_filtered_result_is_cached() -> None:
    reader = FakeReader([record(estado="ABIERTO")])
    source = GeneralBillingSource(reader)
    try:
        assert (await source.page(FILTER, 10, 0)).total == 0
        assert await exported(source) == []
        assert len(reader.calls) == 1
    finally:
        await source.aclose()


async def test_ttl_removes_files_without_another_request_and_rebuilds() -> None:
    reader = FakeReader([record()])
    source = GeneralBillingSource(reader, ttl_seconds=0.02)
    try:
        await source.page(FILTER, 1, 0)
        directory = source.spool_directory
        assert directory is not None and list(directory.iterdir())
        await asyncio.sleep(0.05)
        assert list(directory.iterdir()) == []
        await exported(source)
        assert len(reader.calls) == 2
    finally:
        await source.aclose()
    assert not directory.exists()


async def test_eviction_and_shutdown_remove_private_spool() -> None:
    source = GeneralBillingSource(FakeReader([record()]), max_entries=1)
    await source.page(FILTER, 1, 0)
    directory = source.spool_directory
    assert directory is not None
    first_files = set(directory.iterdir())
    assert first_files and directory.parent != Path.cwd()
    await source.page(ReportFilter(START, date(2026, 2, 1), (), ()), 1, 0)
    assert not any(path.exists() for path in first_files)
    assert len(list(directory.iterdir())) == 1
    await source.aclose()
    await source.aclose()
    assert not directory.exists()
    with pytest.raises(RuntimeError, match="closed"):
        await source.page(FILTER, 1, 0)


async def test_failed_build_removes_partial_file_and_can_retry() -> None:
    reader = FakeReader([record()])
    reader.error = ExternalQueryFailed()
    source = GeneralBillingSource(reader)
    try:
        with pytest.raises(ExternalQueryFailed):
            await source.page(FILTER, 1, 0)
        directory = source.spool_directory
        assert directory is not None and list(directory.iterdir()) == []
        reader.error = None
        assert (await source.page(FILTER, 1, 0)).total == 1
        assert len(reader.calls) == 2
    finally:
        await source.aclose()


async def test_export_lease_survives_expiry_and_eviction_then_cleans_up() -> None:
    source = GeneralBillingSource(
        FakeReader([record(cnsctvo_dcto=str(i)) for i in range(2001)]),
        ttl_seconds=0.02,
        max_entries=1,
    )
    stream = source.stream(FILTER)
    try:
        assert len(await anext(stream)) == 2000
        directory = source.spool_directory
        assert directory is not None
        paths = set(directory.iterdir())
        await asyncio.sleep(0.05)
        assert all(path.exists() for path in paths)  # active export cannot be truncated
        assert len(await anext(stream)) == 1
        await stream.aclose()
        assert list(directory.iterdir()) == []
    finally:
        await stream.aclose()
        await source.aclose()


@pytest.mark.parametrize("catalog", ["sites", "companies", "product_lines"])
async def test_catalogs_delegate_without_building_spool(catalog: str) -> None:
    reader = FakeReader([{"id": 4, "nombre": " Central "}])
    source = GeneralBillingSource(reader)
    try:
        result = await getattr(source, catalog)()
        assert result[0].id == 4 and result[0].nombre == "Central"
        assert len(reader.calls) == 1 and source.spool_directory is None
    finally:
        await source.aclose()
