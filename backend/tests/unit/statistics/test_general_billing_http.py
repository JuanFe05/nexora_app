"""Billing HTTP and optional factory labels; all inputs are synthetic."""

import csv
import io
import json
import zipfile
from collections.abc import Iterator
from contextlib import asynccontextmanager
from decimal import Decimal
from types import SimpleNamespace
from typing import Any
from xml.etree import ElementTree

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.unit.statistics.test_detailed_invoices import FakeReader
from tests.unit.statistics.test_general_billing import record
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers, create_app
from nexora.identity_access.presentation.http.v1.dependencies.auth import get_authenticate_use_case
from nexora.statistics.application.general_billing import COLUMNS
from nexora.statistics.application.report import Report
from nexora.statistics.infrastructure.general_billing_source import GeneralBillingSource
from nexora.statistics.presentation.http.v1.report_router import create_report_router
from nexora.statistics.presentation.http.v1.router import general_billing_router

BASE = "/statistics/administrative/general-billing"
PERMISSION = "statistics.administrative.general_billing.view"
AUTH = {"Authorization": "Bearer test-token"}
LABELS = {key: label for key, label, _ in COLUMNS}
EXPECTED_HEADERS = [
    "Sede",
    "Empresa",
    "Prefijo Documento",
    "No. Transacción / No. Documento / No. Admisión",
    "Tipo Documento",
    "Fecha Factura",
    "Punto Atención / Servicio",
    "Tipo Atención / Servicio",
    "No. Admisión",
    "Código (Interno / CUPS)",
    "Código (CUMS)",
    "Descripción Servicio / Procedimiento",
    "Tipo Id. Paciente",
    "Número Id. Paciente",
    "Nombre Paciente",
    "F. Nacimiento Paciente",
    "Edad Paciente",
    "Tipo Edad Paciente",
    "Grupo Etario",
    "Sexo Paciente",
    "Municipio Residencia",
    "Dirección Residencia",
    "F. Ingreso Paciente",
    "F. Egreso Paciente",
    "Nombre Médico Ordena",
    "Nombre Médico Realiza",
    "Cod. Dx",
    "Descripción DX (CIE10)",
    "Valor Servicios",
    "Valor Suministros",
    "Cantidad",
    "Valor Unitario",
    "Cantidad × Vlr. Unitario",
    "Vlr. Total Servicios / Suministros",
    "Vlr. Copago & Cuota Moderadora",
    "Pago Particular",
    "Descuento",
    "Asesor / Facturador",
    "Autorización",
    "Relación Factura Agrupada",
    "No. Remisión",
    "Fecha Remisión",
    "Relación de Envío",
    "Nombre Mes",
]


def test_columns_match_exact_s3_labels_and_semantic_types() -> None:
    assert [label for _, label, _ in COLUMNS] == EXPECTED_HEADERS
    assert len(COLUMNS) == 44 and len(set(LABELS)) == 44
    kinds = {key: kind for key, _, kind in COLUMNS}
    assert kinds["procedimiento"] == "longtext"
    assert kinds["cntdd1"] == "money"


@pytest.fixture
def http() -> Iterator[tuple[TestClient, FakeReader, FakeAuthentication, GeneralBillingSource]]:
    reader = FakeReader([record(), record(cntdd1="0.20"), record(cnsctvo_dcto="2")])
    source = GeneralBillingSource(reader)
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({PERMISSION})

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> Any:
        try:
            yield
        finally:
            await source.aclose()

    app = FastAPI(lifespan=lifespan)
    _register_error_handlers(app)
    app.state.general_billing_source = source
    app.include_router(general_billing_router)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        yield client, reader, authentication, source


def get(client: TestClient, suffix: str = "", **params: Any) -> Any:
    return client.get(BASE + suffix, params=DATES | params, headers=AUTH)


def export_params(columns: Any = COLUMNS) -> list[str]:
    return [
        f"{key}:{'number' if kind == 'money' else 'text' if kind == 'longtext' else kind}"
        for key, _, kind in columns
    ]


def test_page_pagination_and_export_use_one_spool(http: Any) -> None:
    client, reader, _, source = http
    page = get(client, limit=1, offset=1)
    assert page.status_code == 200 and page.headers["X-Total-Count"] == "3"
    assert len(page.json()) == 1 and page.json()[0]["total_cntdd1"] == 0
    first = get(client, limit=1)
    assert first.json()[0]["total_cntdd1"] == 0.3
    assert first.json()[0]["vlr_copago"] == 15.25
    assert list(page.json()[0]) == list(LABELS)
    outside = get(client, limit=100, offset=99)
    assert outside.status_code == 200 and outside.json() == []
    assert outside.headers["X-Total-Count"] == "3"
    export = get(client, "/export", formato="csv", columnas=export_params())
    assert export.status_code == 200
    rows = list(csv.reader(io.StringIO(export.content.decode("utf-8-sig")), delimiter=";"))
    assert len(rows) == 4 and rows[1][33] == "0.3"
    assert len(reader.calls) == 1 and source.spool_directory is not None


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
@pytest.mark.parametrize("reverse", [False, True])
def test_exact_export_labels_and_requested_order(http: Any, formato: str, reverse: bool) -> None:
    client, reader, _, _ = http
    columns = tuple(reversed(COLUMNS)) if reverse else COLUMNS
    response = get(client, "/export", formato=formato, columnas=export_params(columns))
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    assert (
        response.headers["Content-Disposition"]
        == f'attachment; filename="facturacion-general_2026-01-01_2026-01-31.{formato}"'
    )
    if formato == "csv":
        rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig")), delimiter=";"))
        assert rows[0] == (list(reversed(EXPECTED_HEADERS)) if reverse else EXPECTED_HEADERS)
        assert rows[1][export_params(columns).index("cc_afldo:text")] == "00123"
    else:
        with zipfile.ZipFile(io.BytesIO(response.content)) as book:
            sheet = ElementTree.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314 -- generated synthetic workbook
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        header = sheet.find("s:sheetData/s:row", ns)
        assert header is not None
        assert [node.text for node in header.findall("s:c/s:is/s:t", ns)] == (
            list(reversed(EXPECTED_HEADERS)) if reverse else EXPECTED_HEADERS
        )
    assert len(reader.calls) == 1


@pytest.mark.parametrize("empty", [False, True])
def test_unknown_column_is_422_without_querying_or_changing_spool(http: Any, empty: bool) -> None:
    client, reader, _, source = http
    reader.rows = [] if empty else reader.rows
    response = get(client, "/export", formato="csv", columnas=["unknown:text"])
    assert response.status_code == 422
    assert response.json() == {"detail": "Columnas desconocidas: unknown."}
    assert reader.calls == [] and source.spool_directory is None


@pytest.mark.parametrize(
    "suffix", ["", "/export", "/filters/sites", "/filters/companies", "/filters/product-lines"]
)
def test_permission_403_does_not_touch_source(http: Any, suffix: str) -> None:
    client, reader, authentication, source = http
    authentication.permissions = frozenset()
    response = get(client, suffix, formato="csv", columnas=["sede:text"])
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert reader.calls == [] and source.spool_directory is None


@pytest.mark.parametrize(
    "params", [{"limit": 0}, {"limit": 101}, {"offset": -1}, {"fecha_inicial": "2026-02-01"}]
)
def test_invalid_pagination_and_dates_never_touch_source(http: Any, params: dict[str, Any]) -> None:
    client, reader, _, source = http
    assert get(client, **params).status_code == 422
    assert reader.calls == [] and source.spool_directory is None


def test_http_money_tokens_are_exact_not_float_or_string(http: Any) -> None:
    client, reader, _, _ = http
    reader.rows = [record(cntdd1=Decimal("1234567890123456.123456789"))]
    response = get(client)
    assert response.status_code == 200
    body = json.loads(response.text, parse_float=Decimal)
    assert body[0]["cntdd1"] == Decimal("1234567890123456.123456789")
    assert body[0]["total_cntdd1"] == Decimal("1234567890123456.123456789")


@pytest.mark.parametrize(
    "report_name", ["detailed-invoices", "vital-signs", "admissions", "triage"]
)
@pytest.mark.parametrize("explicit_none", [False, True])
def test_unlabelled_factory_preserves_original_page_and_export_contract(
    report_name: str,
    explicit_none: bool,
) -> None:
    from nexora.statistics.infrastructure.detailed_invoices_source import (
        SqlServerDetailedInvoicesSource,
    )

    reader = FakeReader([{"sede": " Central ", "total_registros": 7}])
    report = Report(SqlServerDetailedInvoicesSource(reader))
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({PERMISSION})
    app = FastAPI()
    _register_error_handlers(app)
    options: dict[str, Any] = {"labels": None} if explicit_none else {}
    prefix = f"/statistics/reports/{report_name}"
    app.include_router(
        create_report_router(
            prefix=prefix,
            permission=PERMISSION,
            provider=lambda: report,
            title=report_name,
            filename=report_name,
            **options,
        )
    )
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        page = client.get(prefix, params=DATES, headers=AUTH)
        assert page.status_code == 200 and page.content == b'[{"sede":" Central "}]'
        assert page.headers["X-Total-Count"] == "7"
        export = client.get(
            prefix + "/export",
            params=DATES | {"formato": "csv", "columnas": ["sede:text"]},
            headers=AUTH,
        )
        assert export.status_code == 200
        assert export.content == "\ufeffsede\r\n Central \r\n".encode()
        reader.rows = []
        empty = client.get(
            prefix + "/export",
            params=DATES | {"formato": "csv", "columnas": ["unknown:text"]},
            headers=AUTH,
        )
        assert empty.status_code == 200 and empty.content == "\ufeffunknown\r\n".encode()


def test_bootstrap_registers_app_scoped_source_and_cleans_it_at_shutdown(monkeypatch: Any) -> None:
    class ManagedReader(FakeReader):
        disposed = False

        def dispose(self) -> None:
            self.disposed = True

    class Database:
        disposed = False

        async def dispose(self) -> None:
            self.disposed = True

    async def initialize(container: Any) -> None:
        pass

    reader = ManagedReader([record()])
    database = Database()
    container = SimpleNamespace(sqlserver=reader, database=database)
    monkeypatch.setattr("nexora.bootstrap.app.build_container", lambda settings: container)
    monkeypatch.setattr("nexora.bootstrap.app.initialize_access", initialize)
    settings = SimpleNamespace(
        app_name="Test", is_production=False, api_prefix="/api/v1", allowed_origins=()
    )
    app = create_app(settings)
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({PERMISSION})
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        response = client.get("/api/v1" + BASE, params=DATES, headers=AUTH)
        assert response.status_code == 200
        directory = app.state.general_billing_source.spool_directory
        assert directory is not None and directory.exists()
        export = client.get(
            "/api/v1" + BASE + "/export",
            params=DATES | {"formato": "csv", "columnas": ["sede:text"]},
            headers=AUTH,
        )
        assert export.status_code == 200 and len(reader.calls) == 1
    assert not directory.exists() and reader.disposed and database.disposed
