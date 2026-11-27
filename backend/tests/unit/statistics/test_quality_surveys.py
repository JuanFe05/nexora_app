"""Encuestas de Calidad with synthetic rows from the real SQL adapters."""

import csv
import io
from collections.abc import AsyncIterator, Iterator
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_authenticate_use_case,
    get_container,
)
from nexora.integration_management.application.ports import ExternalQueryFailed, ReadOnlyQuery
from nexora.statistics.infrastructure.queries.admissions import ADMISSIONS_EXPORT_QUERY
from nexora.statistics.infrastructure.queries.catalogs import COMPANIES, SITES
from nexora.statistics.infrastructure.queries.detailed_invoices import (
    DETAILED_INVOICES_EXPORT_QUERY,
)
from nexora.statistics.presentation.http.v1.router import quality_surveys_router

BASE = "/api/v1/statistics/administrative/quality-surveys"
PERMISSION = "statistics.administrative.quality_surveys.view"
AUTH = {"Authorization": "Bearer test-token"}
FILTERS = {**DATES, "sedes": [3, 1, 3], "empresas": [8, 2], "lineas": [5, 4]}
SELECTION = ["nombre_completo:text", "cdgo_prcdmnto:text", "cc_afldo:text", "lna_prdcto:text"]
INVOICE = {
    "sede": "Centro", "cdgo_tpo_dcmnto": "CC", "cc_afldo": "0007",
    "prmr_nmbre": " Ana ", "sgndo_nmbre": "  ", "prmr_aplldo": " Pérez ",
    "sgndo_aplldo": None, "genero": "F", "tlfno_afldo": "0123", "emprs": "EPS I",
    "prfsnl_salud_rlza": "Factura Médico", "cdgo_prcdmnto": "00100",
    "procedimiento": "Servicio I", "lna_prdcto": "Consulta", "estado": "ABIERTO",
}
ADMISSION = {
    "sede": "Norte", "tpo_idntfccn": "TI", "nmro_idntfccn": "0008",
    "prmr_nmbre": " Luis ", "sgndo_nmbre": " José ", "prmr_aplldo": " Torres ",
    "sgndo_aplldo": " Díaz ", "sexo": "M", "tlfno": "0456", "emprsa": "EPS A",
    "prfsnl_ordna": "Admisión Ordena", "prfsnl_rlza": "No usar", "cdgo_prcdmnto": "890701",
    "prcdmnto": "Servicio A", "lna_prdcto": "Urgencias",
}
EXPECTED_INVOICE = {
    "sede": "Centro", "cdgo_tpo_dcmnto": "CC", "cc_afldo": "0007",
    "nombre_completo": "Ana Pérez", "genero": "F", "tlfno_afldo": "0123", "emprs": "EPS I",
    "prfsnl_salud_rlza": "Factura Médico", "cdgo_prcdmnto": "00100",
    "procedimiento": "Servicio I", "lna_prdcto": "Consulta",
}
EXPECTED_ADMISSION = {
    "sede": "Norte", "cdgo_tpo_dcmnto": "TI", "cc_afldo": "0008",
    "nombre_completo": "Luis José Torres Díaz", "genero": "M", "tlfno_afldo": "0456",
    "emprs": "EPS A", "prfsnl_salud_rlza": "Admisión Ordena", "cdgo_prcdmnto": "890701",
    "procedimiento": "Servicio A", "lna_prdcto": "Urgencias",
}


class Reader:
    def __init__(self) -> None:
        self.calls: list[tuple[ReadOnlyQuery, dict[str, Any] | None]] = []
        self.empty = False
        self.fail = False

    async def stream(
        self, query: ReadOnlyQuery, params: dict[str, Any] | None = None
    ) -> AsyncIterator[list[dict[str, Any]]]:
        self.calls.append((query, params))
        if self.fail:
            raise ExternalQueryFailed("private SQL detail")
        if self.empty:
            return
        if query is DETAILED_INVOICES_EXPORT_QUERY:
            yield [
                INVOICE.copy(),
                INVOICE.copy(),
                INVOICE | {"lna_prdcto": "MEDICAMENTO"},
                INVOICE | {"lna_prdcto": "MATERIAL - INSUMO MEDICO Qx"},
            ]
        else:
            assert query is ADMISSIONS_EXPORT_QUERY
            yield [ADMISSION | {"cdgo_prcdmnto": code} for code in ("8907010", " 890701", None)]
            yield [
                ADMISSION.copy(),
                ADMISSION | {"lna_prdcto": "MEDICAMENTO"},
                ADMISSION | {"lna_prdcto": "MATERIAL - INSUMO MEDICO Qx"},
            ]

    async def fetch_all(self, query: ReadOnlyQuery) -> list[dict[str, Any]]:
        self.calls.append((query, None))
        return [{"id": 8, "nombre": " Opción "}]


type Http = tuple[TestClient, Reader, FakeAuthentication]


@pytest.fixture
def http() -> Iterator[Http]:
    reader = Reader()
    auth = FakeAuthentication()
    auth.permissions = frozenset({PERMISSION})
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(quality_surveys_router, prefix="/api/v1")
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: auth
    with TestClient(app) as client:
        yield client, reader, auth


def assert_queries(reader: Reader) -> None:
    assert len(reader.calls) == 2
    assert sorted(id(query) for query, _ in reader.calls) == sorted(
        [id(DETAILED_INVOICES_EXPORT_QUERY), id(ADMISSIONS_EXPORT_QUERY)]
    )
    for _, params in reader.calls:
        assert params == {
            "fecha_inicial": date(2026, 1, 1), "fecha_final": date(2026, 1, 31),
            "sedes": [3, 1], "empresas": [8, 2], "lineas": [-1],
            "filtrar_sedes": 1, "filtrar_empresas": 1, "filtrar_lineas": 0,
        }


def test_consult_combines_exact_fields_without_deduplication(http: Http) -> None:
    client, reader, _ = http
    response = client.get(BASE, params=FILTERS, headers=AUTH)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {"rows": [EXPECTED_INVOICE] * 2 + [EXPECTED_ADMISSION], "total": 3}
    assert_queries(reader)


@pytest.mark.parametrize("fmt", ["csv", "xlsx"])
@pytest.mark.parametrize("empty", [False, True])
def test_export_contains_only_selected_columns_in_request_order(
    http: Http, fmt: str, empty: bool
) -> None:
    client, reader, _ = http
    reader.empty = empty
    response = client.get(
        BASE + "/export", params={**FILTERS, "formato": fmt, "columnas": SELECTION}, headers=AUTH
    )
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["content-disposition"] == (
        f'attachment; filename="encuestas-de-calidad_2026-01-01_2026-01-31.{fmt}"'
    )
    assert_queries(reader)
    if fmt == "csv":
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert response.content.startswith(b"\xef\xbb\xbf")
        rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig")), delimiter=";"))
    else:
        assert response.headers["content-type"] == (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        book = load_workbook(io.BytesIO(response.content), read_only=True)
        try:
            rows = [list(row) for row in book.active.values]
        finally:
            book.close()
    data = [["Ana Pérez", "00100", "0007", "Consulta"]] * 2 + [["Luis José Torres Díaz", "890701", "0008", "Urgencias"]]
    assert rows == [["Nombre", "CUPS Servicio", "Número Id. Paciente", "Tipo Servicio"]] + ([] if empty else data)


def test_excludes_disallowed_lines_from_both_sources_but_preserves_other_line_values(http: Http) -> None:
    client, reader, _ = http
    response = client.get(BASE, params=FILTERS, headers=AUTH)
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert [row["lna_prdcto"] for row in rows] == ["Consulta", "Consulta", "Urgencias"]
    assert all(row["lna_prdcto"].strip().casefold() not in {
        "medicamento", "material - insumo medico qx",
    } for row in rows)
    assert_queries(reader)


def test_empty_consult(http: Http) -> None:
    client, reader, _ = http
    reader.empty = True
    response = client.get(BASE, params=DATES, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {"rows": [], "total": 0}


@pytest.mark.parametrize(
    "suffix", ["", "/filters/sites", "/filters/companies", "/export"]
)
def test_requires_independent_permission(http: Http, suffix: str) -> None:
    client, reader, auth = http
    params = {**DATES, "formato": "csv", "columnas": SELECTION}
    response = client.get(BASE + suffix, params=params)
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    auth.permissions = frozenset({"statistics.administrative.general_consumption.view"})
    response = client.get(BASE + suffix, params=params, headers=AUTH)
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert reader.calls == []


@pytest.mark.parametrize(
    ("suffix", "query"),
    [("sites", SITES), ("companies", COMPANIES)],
)
def test_catalogs(http: Http, suffix: str, query: ReadOnlyQuery) -> None:
    client, reader, _ = http
    response = client.get(f"{BASE}/filters/{suffix}", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == [{"id": 8, "nombre": "Opción"}]
    assert reader.calls == [(query, None)]


@pytest.mark.parametrize(
    ("change", "detail"),
    [
        ({"formato": "txt"}, None),
        ({"columnas": []}, None),
        ({"columnas": ["nombre_completo:invalid"]}, "Columna de exportación inválida."),
        ({"columnas": ["tlfno_afldo:date"]}, "Columna de exportación inválida."),
        ({"columnas": ["estado:text"]}, "Columna de exportación inválida."),
        ({"columnas": ["sede:text", "sede:text"]}, "No se permiten columnas duplicadas."),
        ({"fecha_inicial": "2026-02-01"}, "La fecha inicial no puede ser posterior a la final."),
    ],
)
def test_export_rejects_invalid_requests_before_sql(
    http: Http, change: dict[str, Any], detail: str | None
) -> None:
    client, reader, _ = http
    response = client.get(
        BASE + "/export",
        params={**DATES, "formato": "csv", "columnas": SELECTION, **change},
        headers=AUTH,
    )
    assert response.status_code == 422
    if detail is None:
        assert isinstance(response.json()["detail"], list)
    else:
        assert response.json() == {"detail": detail}
    assert reader.calls == []


@pytest.mark.parametrize("suffix", ["", "/export"])
def test_sql_error_returns_safe_error_before_download(http: Http, suffix: str) -> None:
    client, reader, _ = http
    reader.fail = True
    response = client.get(
        BASE + suffix, params={**DATES, "formato": "csv", "columnas": SELECTION}, headers=AUTH
    )
    assert response.status_code == 502
    assert response.json() == {"detail": "No se pudo consultar la fuente de datos externa"}
    assert "content-disposition" not in response.headers
