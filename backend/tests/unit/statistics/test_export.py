"""Streaming export: one format per request, all rows, no pagination, exact values."""

import io
import zipfile
from collections.abc import Iterator
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.unit.statistics.test_detailed_invoices import FakeReader
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_authenticate_use_case,
    get_container,
)
from nexora.integration_management.application.ports import ExternalQueryFailed
from nexora.statistics.infrastructure.queries.detailed_invoices import (
    DETAILED_INVOICES_EXPORT_SQL,
    DETAILED_INVOICES_SQL,
)
from nexora.statistics.presentation.http.v1.router import statistics_router

URL = "/statistics/reports/detailed-invoices/export"
ROWS = [
    {"nmro_dcto": f"F-{n}", "fcha_dcto": "2026-01-05 00:00:00", "vlr_factrdo": "1250.50"}
    for n in range(5)
]
COLUMNS = ["nmro_dcto:text", "fcha_dcto:date", "vlr_factrdo:number"]


@pytest.fixture
def http() -> Iterator[tuple[TestClient, FakeReader]]:
    reader = FakeReader(ROWS)
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(statistics_router)
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: FakeAuthentication()
    with TestClient(app) as client:
        yield client, reader


def _get(client: TestClient, **extra: object):
    params = {**DATES, "formato": "csv", "columnas": COLUMNS, **extra}
    return client.get(URL, params=params, headers={"Authorization": "Bearer test-token"})


def test_export_sql_is_the_paged_query_without_paging_or_total() -> None:
    assert "OFFSET" not in DETAILED_INVOICES_EXPORT_SQL
    assert "total_registros" not in DETAILED_INVOICES_EXPORT_SQL
    paged_body = DETAILED_INVOICES_SQL.split("COUNT(*) OVER ()")[0]
    assert DETAILED_INVOICES_EXPORT_SQL.startswith(paged_body.rstrip().rstrip(","))
    assert "ORDER BY doc.fcha_dcto" in DETAILED_INVOICES_EXPORT_SQL


def test_csv_streams_every_row_with_formatted_cells(http) -> None:
    client, reader = http

    response = _get(client)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert (
        "facturas-detalladas_2026-01-01_2026-01-31.csv" in response.headers["content-disposition"]
    )
    lines = response.content.decode("utf-8-sig").split("\r\n")
    assert lines[0] == "nmro_dcto;fcha_dcto;vlr_factrdo"
    assert lines[1] == "F-0;05/01/2026;1250.5"
    assert len(lines) == 7 and lines[-1] == ""  # cabecera + 5 filas, sin tope de paginación
    query, params = reader.calls[0]
    assert "limit" not in params and "offset" not in params


def test_csv_neutralizes_formulas_and_quotes_separators(http) -> None:
    client, reader = http
    reader.rows = [{"nmro_dcto": "=1+1", "fcha_dcto": "", "vlr_factrdo": "a;b"}]

    lines = _get(client).content.decode("utf-8-sig").split("\r\n")

    assert lines[1] == "'=1+1;;a;b".replace("a;b", '"a;b"')


def test_xlsx_is_a_valid_workbook_with_all_rows(http) -> None:
    client, _ = http

    response = _get(client, formato="xlsx")

    assert response.status_code == 200
    assert "spreadsheetml.sheet" in response.headers["content-type"]
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        sheet = book.read("xl/worksheets/sheet1.xml").decode()
        assert book.testzip() is None
    assert sheet.count("<row ") == 6
    assert "<v>1250.5</v>" in sheet and "05/01/2026" in sheet


@pytest.mark.parametrize("formato", ["both", "csv,xlsx", ""])
def test_only_one_format_per_request(http, formato: str) -> None:
    client, reader = http

    assert _get(client, formato=formato).status_code == 422
    assert reader.calls == []


@pytest.mark.parametrize("columnas", [["nope:text"], ["nmro_dcto:json"], ["a b:text"]])
def test_invalid_or_unknown_columns_are_rejected_before_streaming(http, columnas) -> None:
    client, _ = http

    assert _get(client, columnas=columnas).status_code == 422


def test_export_requires_authentication_and_reports_source_failure(http) -> None:
    client, reader = http
    assert (
        client.get(URL, params={**DATES, "formato": "csv", "columnas": COLUMNS}).status_code == 401
    )
    reader.error = ExternalQueryFailed("x")

    assert _get(client).status_code == 502
