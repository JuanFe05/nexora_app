"""Public HTTP contract with a synthetic SQL Server reader."""

import csv
from collections.abc import Iterator
from decimal import Decimal
from io import BytesIO, StringIO
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import text
from tests.unit.statistics.test_detailed_invoices import END, START, FakeReader
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers, create_app
from nexora.identity_access.presentation.http.v1.dependencies.auth import get_authenticate_use_case
from nexora.statistics.presentation.http.v1 import router as statistics_routes

BASE = "/statistics/administrative/management-secretariat/detailed-invoices"
PERMISSION = "statistics.administrative.management_secretariat.view"
OLD_PERMISSION = "statistics.reports.detailed_invoices.view"
HEADERS = """Sede
Empresa
No. Transacción / No. Documento / No. Admisión
Factura
Fecha Factura
Tipo Atención / Servicio
No. Admisión
Código (Interno / CUPS)
Código (CUMS)
Descripción Servicio / Procedimiento
Tipo Id. Paciente
Número Id. Paciente
Nombre Paciente
F. Ingreso Paciente
F. Egreso Paciente
Nombre Médico Ordena
Nombre Médico Realiza
Cod. Dx
Descripción DX (CIE10)
Valor Servicios
Valor Suministros
Cantidad
Valor Unitario
Cantidad * Vlr. Unitario
Vlr. Total Servicios / Suministros
Vlr. Copago & Cuota Moderadora
Pago Particular
Descuento
Asesor / Facturador
Autorización
Nombre Mes""".splitlines()
AMOUNT = "-12345678901234567890123456789.123456789"


@pytest.fixture
def http() -> Iterator[tuple[TestClient, FakeReader, FakeAuthentication]]:
    reader = FakeReader([
        {
            "sede": "  Sede\t Norte ", "cc_afldo": " 001234 ", "cdgo_prcdmnto": "00 AB",
            "factura": " F-00001 ", "fcha_dcto": "2026-01-09", "mes_dcto": "ENERO",
            "cntdd": Decimal("1.25"), "vlr_untro": Decimal(AMOUNT), "total_registros": 2,
        },
    ] * 2)
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({PERMISSION})
    app = FastAPI()
    _register_error_handlers(app)
    app.state.container = SimpleNamespace(sqlserver=reader)
    # Mount the exported router when available; on base the new URLs must return 404.
    if hasattr(statistics_routes, "management_secretariat_router"):
        app.include_router(statistics_routes.management_secretariat_router)
    app.include_router(statistics_routes.statistics_router)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app, headers={"Authorization": "Bearer test-token"}) as client:
        yield client, reader, authentication


def get(client: TestClient, suffix: str = "", **params: Any) -> Any:
    return client.get(BASE + suffix, params=DATES | params)


def test_application_mounts_secretariat_api_with_its_own_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reader = FakeReader([])
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({OLD_PERMISSION})
    container = SimpleNamespace(sqlserver=reader, database=SimpleNamespace(session=None))
    monkeypatch.setattr("nexora.bootstrap.app.build_container", lambda settings: container)
    settings = SimpleNamespace(
        app_name="Test", is_production=False, api_prefix="/api/v1", allowed_origins=(),
    )
    app = create_app(settings)  # type: ignore[arg-type]
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    client = TestClient(app)
    headers = {"Authorization": "Bearer test-token"}
    url = "/api/v1" + BASE

    denied = client.get(url, params=DATES, headers=headers)
    assert denied.status_code == 403
    assert reader.calls == []

    authentication.permissions = frozenset({PERMISSION})
    allowed = client.get(url, params=DATES, headers=headers)
    assert allowed.status_code == 200
    assert allowed.json() == []
    assert reader.calls
    assert client.get("/health").json() == {"status": "ok"}
    client.close()


def test_page_normalizes_without_losing_identifiers_precision_or_distinct_lines(http: Any) -> None:
    client, reader, _ = http
    response = get(client, buscar="  001234 ", sedes=[3, 3], empresas=[9], lineas=[5], limit=2)
    assert response.status_code == 200 and response.headers["X-Total-Count"] == "2"
    assert response.headers["Cache-Control"] == "no-store"
    assert len(response.json()) == 2 and response.json()[0] == response.json()[1]
    row = response.json()[0]
    assert list(row.values()) == [
        "Sede Norte", None, None, "F-00001", "2026-01-09", None, None, "00 AB", None,
        None, None, "001234", None, None, None, None, None, None, None, None, None, "1.25",
        AMOUNT, None, None, None, None, None, None, None, "ENERO",
    ]
    query, params = reader.calls[0]
    assert params == {
        "fecha_inicial": START, "fecha_final": END, "filtrar_sedes": 1,
        "filtrar_empresas": 1, "filtrar_lineas": 1, "sedes": [3], "empresas": [9],
        "lineas": [5], "limit": 2, "offset": 0, "buscar": "001234",
    }
    assert set(text(query.sql).compile().params) == set(params)
    assert "CHARINDEX" in query.sql and "COUNT(*) OVER ()" in query.sql
    assert "d.cntdd AS cntdd" in query.sql and "d.vlr_untro AS vlr_untro" in query.sql
    assert "CAST(d.cntdd" not in query.sql and "CAST(d.vlr_untro" not in query.sql
    assert "d.cntdd * d.vlr_untro AS cntdd1" in query.sql


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_export_headers_and_precision_with_same_filters_without_pagination(
    http: Any, formato: str
) -> None:
    client, reader, _ = http
    selected = dict(buscar="001234", sedes=[3], empresas=[9], lineas=[5])
    assert get(client, limit=1, offset=7, **selected).status_code == 200
    response = get(client, "/export", formato=formato, **selected)
    assert response.status_code == 200 and response.headers["Cache-Control"] == "no-store"
    assert response.headers["Content-Disposition"] == (
        'attachment; filename="secretaria-gerencia-facturas-detalladas_'
        f'2026-01-01_2026-01-31.{formato}"'
    )
    if formato == "csv":
        rows = list(csv.reader(StringIO(response.content.decode("utf-8-sig")), delimiter=";"))
    else:
        workbook = load_workbook(BytesIO(response.content), read_only=True)
        try:
            rows = [list(row) for row in workbook.active.values]
        finally:
            workbook.close()
    assert rows[0] == HEADERS and len(rows) == 3
    assert rows[1][4] == "09/01/2026" and rows[1][11] == "001234"
    assert rows[1][21:23] == ["1.25", AMOUNT]
    (page, page_params), (export, export_params) = reader.calls
    assert page.name != export.name and "management_secretariat" in export.name
    assert export_params == {k: v for k, v in page_params.items() if k not in {"limit", "offset"}}
    assert "OFFSET" not in export.sql and "total_registros" not in export.sql
    assert "CHARINDEX" in export.sql


def test_selected_columns_keep_canonical_order_even_without_rows(http: Any) -> None:
    client, reader, _ = http
    reader.rows = []
    result = get(client, "/export", formato="csv", columnas=["cc_afldo", "sede"])
    assert result.status_code == 200
    assert result.content == "\ufeffSede;Número Id. Paciente\r\n".encode()


@pytest.mark.parametrize(("columns", "detail"), [
    (["other"], "Columnas desconocidas: other."),
    (["sede", "sede"], "No se permiten columnas duplicadas."),
])
def test_invalid_columns_never_open_sql(http: Any, columns: list[str], detail: str) -> None:
    client, reader, _ = http
    result = get(client, "/export", formato="csv", columnas=columns)
    assert result.status_code == 422 and result.json() == {"detail": detail}
    assert reader.calls == []


@pytest.mark.parametrize(
    "suffix", ["", "/export", "/filters/sites", "/filters/companies", "/filters/product-lines"]
)
def test_detailed_invoices_permission_does_not_grant_secretariat_access(
    http: Any, suffix: str
) -> None:
    client, reader, authentication = http
    authentication.permissions = frozenset({OLD_PERMISSION})
    result = get(client, suffix, formato="csv")
    assert result.status_code == 403
    assert result.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert reader.calls == []


def test_existing_detailed_invoice_response_is_unchanged(http: Any) -> None:
    client, reader, authentication = http
    authentication.permissions = frozenset({OLD_PERMISSION})
    reader.rows = [{"nmro_dcto": "F-01", "vlr_factrdo": 9, "total_registros": 1}]
    result = client.get("/statistics/reports/detailed-invoices", params=DATES)
    assert result.status_code == 200 and result.headers["X-Total-Count"] == "1"
    assert result.content == b'[{"nmro_dcto":"F-01","vlr_factrdo":9}]'
    query, params = reader.calls[0]
    assert query.name == "statistics.detailed_invoices" and "buscar" not in params
    assert "CAST(d.vlr_untro AS BIGINT)" in query.sql
