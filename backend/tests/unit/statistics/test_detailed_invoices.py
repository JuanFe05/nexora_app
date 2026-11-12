"""Report contracts exercised without a database or network."""

import re
from collections.abc import AsyncIterator, Mapping
from dataclasses import FrozenInstanceError
from datetime import date
from typing import Any

import pytest
from sqlalchemy import text

from nexora.integration_management.application.ports import (
    ExternalQueryFailed,
    ExternalSourceUnavailable,
    ReadOnlyQuery,
)
from nexora.statistics.application.detailed_invoices import DetailedInvoicesReport
from nexora.statistics.application.ports import CatalogOption, ReportPage
from nexora.statistics.domain.filters import DetailedInvoicesFilter, InvalidReportFilter
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)
from nexora.statistics.infrastructure.queries.catalogs import COMPANIES, SITES
from nexora.statistics.infrastructure.queries.detailed_invoices import (
    DETAILED_INVOICES_QUERY,
    DETAILED_INVOICES_SQL,
)

START = date(2026, 1, 1)
END = date(2026, 1, 31)


class FakeReader:
    def __init__(self, rows: list[dict[str, Any]] | None = None) -> None:
        self.rows = rows or []
        self.calls: list[tuple[ReadOnlyQuery, Mapping[str, Any] | None]] = []
        self.error: Exception | None = None

    async def fetch_all(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        self.calls.append((query, params))
        if self.error:
            raise self.error
        return [dict(row) for row in self.rows]

    async def stream(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None = None, *, chunk_size: int = 2
    ) -> AsyncIterator[list[dict[str, Any]]]:
        self.calls.append((query, params))
        if self.error:
            raise self.error
        for start in range(0, len(self.rows), 2):
            yield [dict(row) for row in self.rows[start : start + 2]]


def test_filter_dates_deduplication_and_immutability() -> None:
    with pytest.raises(
        InvalidReportFilter, match=r"^La fecha inicial no puede ser posterior a la final\.$"
    ):
        DetailedInvoicesFilter(END, START, (), ())
    filters = DetailedInvoicesFilter(START, START, (3, 1, 3), (9, 2, 9))
    assert filters.sedes == (3, 1)
    assert filters.empresas == (9, 2)
    with pytest.raises(FrozenInstanceError):
        filters.sedes = ()  # type: ignore[misc]


@pytest.mark.parametrize(
    ("sites", "companies"), [((), ()), ((3, 1, 3), ()), ((), (9, 2, 9)), ((3,), (9,))]
)
async def test_page_parameters_and_total(
    sites: tuple[int, ...], companies: tuple[int, ...]
) -> None:
    reader = FakeReader(
        [
            {"nmro_dcto": "A-1", "total_registros": 82, "vlr_factrdo": 12},
            {"nmro_dcto": "A-2", "total_registros": 82, "vlr_factrdo": 24},
        ]
    )
    report = DetailedInvoicesReport(SqlServerDetailedInvoicesSource(reader))
    result = await report.page(DetailedInvoicesFilter(START, END, sites, companies), 2, 10)
    assert result == ReportPage(
        [
            {"nmro_dcto": "A-1", "vlr_factrdo": 12},
            {"nmro_dcto": "A-2", "vlr_factrdo": 24},
        ],
        82,
    )
    assert reader.calls == [
        (
            DETAILED_INVOICES_QUERY,
            {
                "fecha_inicial": START,
                "fecha_final": END,
                "filtrar_sedes": int(bool(sites)),
                "filtrar_empresas": int(bool(companies)),
                "filtrar_lineas": 0,
                "lineas": [-1],
                "sedes": list(dict.fromkeys(sites)) or [-1],
                "empresas": list(dict.fromkeys(companies)) or [-1],
                "limit": 2,
                "offset": 10,
            },
        )
    ]


@pytest.mark.parametrize(("limit", "offset"), [(1, 0), (100, 1000)])
async def test_empty_page_and_pagination_boundaries(limit: int, offset: int) -> None:
    reader = FakeReader()
    result = await DetailedInvoicesReport(SqlServerDetailedInvoicesSource(reader)).page(
        DetailedInvoicesFilter(START, END, (), ()), limit, offset
    )
    assert result == ReportPage([], 0)
    # Con offset > 0 y sin filas se hace un segundo sondeo (offset 0) para conocer el total real.
    assert len(reader.calls) == (2 if offset > 0 else 1)
    assert reader.calls[0][1]["limit"] == limit
    assert reader.calls[0][1]["offset"] == offset


@pytest.mark.parametrize(("limit", "offset"), [(0, 0), (101, 0), (50, -1)])
async def test_invalid_pagination_never_queries(limit: int, offset: int) -> None:
    reader = FakeReader()
    with pytest.raises(InvalidReportFilter):
        await DetailedInvoicesReport(SqlServerDetailedInvoicesSource(reader)).page(
            DetailedInvoicesFilter(START, END, (), ()), limit, offset
        )
    assert reader.calls == []


@pytest.mark.parametrize("catalog", ["sites", "companies"])
async def test_catalog_names_fall_back_to_real_id(catalog: str) -> None:
    reader = FakeReader(
        [
            {"id": 4, "nombre": " Central "},
            {"id": 5, "nombre": None},
            {"id": 6, "nombre": "  "},
            {"id": 7, "nombre": ""},
        ]
    )
    report = DetailedInvoicesReport(SqlServerDetailedInvoicesSource(reader))
    result = await getattr(report, catalog)()
    assert result == [
        CatalogOption(4, "Central"),
        CatalogOption(5, "5"),
        CatalogOption(6, "6"),
        CatalogOption(7, "7"),
    ]
    query = SITES if catalog == "sites" else COMPANIES
    assert reader.calls == [(query, None)]
    assert query.sql.lstrip().startswith("SET NOCOUNT ON;")


@pytest.mark.parametrize("error_type", [ExternalSourceUnavailable, ExternalQueryFailed])
async def test_external_failures_propagate(error_type: type[Exception]) -> None:
    reader = FakeReader()
    reader.error = error_type()
    with pytest.raises(error_type):
        await DetailedInvoicesReport(SqlServerDetailedInvoicesSource(reader)).page(
            DetailedInvoicesFilter(START, END, (), ()), 50, 0
        )
    assert len(reader.calls) == 1


def test_sql_bindings_original_markers_and_read_only_statements() -> None:
    assert set(text(DETAILED_INVOICES_SQL).compile().params) == {
        "fecha_inicial",
        "fecha_final",
        "filtrar_sedes",
        "filtrar_empresas",
        "filtrar_lineas",
        "lineas",
        "sedes",
        "empresas",
        "offset",
        "limit",
    }
    assert DETAILED_INVOICES_QUERY.list_params == frozenset({"sedes", "empresas", "lineas"})
    for marker in ("OUTER APPLY", "WITH (NOLOCK)", "cte_doc_x", "COUNT(*) OVER ()"):
        assert marker in DETAILED_INVOICES_SQL
    sql = re.sub(r"--[^\n]*", "", DETAILED_INVOICES_SQL)
    assert not re.search(r"\b(CREATE|UPDATE|DELETE|DROP)\b", sql, re.IGNORECASE)
    assert re.findall(r"\bINSERT\s+INTO\s+(\S+)", sql, re.IGNORECASE) == ["@def"]
    assert "DATEADD(DAY, 1, @fcha_fin)" in sql
    assert "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY" in sql
