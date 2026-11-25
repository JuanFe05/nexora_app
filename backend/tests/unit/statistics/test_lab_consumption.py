"""Laboratorio: contrato público con datos sintéticos, sin archivos clínicos."""

import asyncio
import csv
import io
import struct
import threading
import zipfile
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Any
from xml.etree import ElementTree as ET

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openpyxl import Workbook
from tests.unit.statistics.test_general_consumption import admission, invoice
from tests.unit.statistics.test_general_consumption_ser_laboral import HEADERS, csv_bytes, raw
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.presentation.http.v1.dependencies.auth import get_authenticate_use_case
from nexora.statistics.application.lab_consumption import LabConsumptionReport
from nexora.statistics.application.ports import CatalogOption
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.presentation.http.v1.lab_consumption_router import (
    create_lab_consumption_router,
)

BASE = "/statistics/administrative/lab-consumption"
AUTH = {"Authorization": "Bearer test-token"}
PERMISSION = "statistics.administrative.lab_consumption.view"
KEYS = (
    "cnsctvo_dcto",
    "cdgo_prcdmnto",
    "lna_prdcto",
    "procedimiento",
    "cntdd",
    "fcha_ingrso_pcnte",
    "fcha_dcto",
    "admision",
    "estado",
    "emprs",
    "dscrp_transcn",
    "sede",
)
LABELS = (
    "Transacción / Factura / Admisión",
    "CUPS",
    "Tipo Procedimiento",
    "Nombre Procedimiento",
    "Cantidad",
    "Fecha Ingreso",
    "Fecha Factura",
    "Admisión",
    "Estado Documento",
    "Empresa",
    "Tipo Documento",
    "Sede",
)
ANNAR_HEADERS = (
    "Sede",
    "Nombre Sede",
    "Cliente",
    "Nombre Cliente",
    "Cen.Costo",
    "Nombre Centro de Costos",
    "Medico",
    "Nombre Medico",
    "Seccion",
    "Nombre de la Sección",
    "Examen",
    "Nombre del Examen",
    "Nivel",
    "Valor",
)
ANNAR_LABELS = (
    "Código Centro de Costo",
    "Nombre Centro de Costos",
    "Nombre del Examen",
    "Cantidad",
    "Empresa",
    "Punto Atención",
)


def xls_bytes(rows: list[list[Any]], headers: tuple[str, ...] = ANNAR_HEADERS) -> bytes:
    """BIFF8 mínimo en memoria, aceptado por xlrd; no necesita otra dependencia Excel."""

    def record(code: int, data: bytes = b"") -> bytes:
        return struct.pack("<HH", code, len(data)) + data

    def bof(kind: int) -> bytes:
        return record(0x0809, struct.pack("<HHHHII", 0x0600, kind, 0x0DBB, 1996, 0x41, 6))

    def bound(offset: int) -> bytes:
        return record(0x0085, struct.pack("<IBBBB", offset, 0, 0, 1, 0) + b"A")

    prefix = bof(5) + record(0x0042, struct.pack("<H", 1200))
    start = len(prefix + bound(0) + record(0x000A))
    content = prefix + bound(start) + record(0x000A) + bof(0x10)
    content += record(0x0200, struct.pack("<IIHHH", 0, len(rows) + 1, 0, len(headers), 0))
    for r, values in enumerate([list(headers), *rows]):
        for c, value in enumerate(values):
            if isinstance(value, int | float):
                content += record(0x0203, struct.pack("<HHHd", r, c, 0, value))
            else:
                text = str(value)
                content += record(
                    0x0204, struct.pack("<HHHHB", r, c, 0, len(text), 1) + text.encode("utf-16le")
                )
    return content + record(0x000A)


XLS_MIME = "application/vnd.ms-excel"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def xlsx_bytes(rows: list[list[Any]], headers: tuple[str, ...] = ANNAR_HEADERS) -> bytes:
    """Synthetic modern workbook; no user files or repository scratch."""
    book = Workbook()
    sheet = book.active
    assert sheet is not None
    sheet.append(list(headers))
    for row in rows:
        sheet.append(row)
    content = io.BytesIO()
    book.save(content)
    book.close()
    return content.getvalue()


def annar_row(
    code: str = "10",
    description: str = " Sección diez ",
    exam_code: str = "E",
    exam_name: str = " Examen ",
) -> list[Any]:
    return [
        " 01",
        " sede ",
        "C",
        " Empresa\xa0 ",
        "CC",
        " Punto\xa0 ",
        "M",
        "Médico",
        code,
        description,
        exam_code,
        exam_name,
        "1",
        10500.0,
    ]


class Source:
    def __init__(self, rows: list[dict[str, Any]], lines: list[CatalogOption] | None = None):
        self.rows = rows
        self.lines = lines if lines is not None else [CatalogOption(7, " laboratorio ")]
        self.calls: list[ReportFilter] = []

    async def stream(self, filters: ReportFilter) -> AsyncIterator[list[dict[str, Any]]]:
        self.calls.append(filters)
        yield self.rows

    async def sites(self) -> list[CatalogOption]:
        return [CatalogOption(1, "Central")]

    companies = sites

    async def product_lines(self) -> list[CatalogOption]:
        return self.lines


@pytest.fixture
def http() -> Iterator[tuple[TestClient, Source, Source, FakeAuthentication, LabConsumptionReport]]:
    invoices = Source(
        [
            invoice(
                cnsctvo_dcto="F1",
                lna_prdcto=" laboratorio ",
                procedimiento=" examen ",
                cntdd="1.5",
                fcha_ingrso_pcnte="2026-01-02",
                fcha_dcto="2026-01-03",
                estado=" cerrado ",
                emprs=" empresa ",
                dscrp_transcn=" otro ",
                sede=" central ",
            )
        ]
    )
    admissions = Source(
        [
            admission(
                lna_prdcto=" laboratorio ",
                cdgo_prcdmnto="001",
                estdo_admsn=" abierto ",
            )
        ]
    )
    report = LabConsumptionReport(invoices, admissions)  # type: ignore[arg-type]
    auth = FakeAuthentication()
    auth.permissions = frozenset({PERMISSION})

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await report.aclose()

    app = FastAPI(lifespan=lifespan)
    _register_error_handlers(app)
    app.include_router(create_lab_consumption_router(provider=lambda: report))
    app.dependency_overrides[get_authenticate_use_case] = lambda: auth
    with TestClient(app) as client:
        yield client, invoices, admissions, auth, report


def upload(
    client: TestClient, suffix: str, content: bytes, mime: str | None = None,
) -> Any:
    headers = AUTH | ({"Content-Type": mime} if mime else {})
    return client.post(BASE + suffix, content=content, headers=headers)


def export(client: TestClient, **params: Any) -> Any:
    return client.get(BASE + "/export", params=DATES | {"formato": "csv"} | params, headers=AUTH)


def test_catalog_resolution_guard_and_twelve_column_mapping(http: Any) -> None:
    client, invoices, admissions, _, _ = http
    invoices.lines = [
        CatalogOption(2, "CONSULTA"),
        CatalogOption(7, "LaBoRaToRiO"),
        CatalogOption(8, "ADOLECENCIA LABORATORIO"),
    ]
    invoices.rows += [invoice(lna_prdcto="CONSULTA")]
    admissions.rows += [admission(lna_prdcto="CONSULTA")]
    response = client.get(
        BASE,
        params=DATES
        | {
            "sedes": [1, 1],
            "empresas": [2],
            "lineas": [999],
        },
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "facturas",
        "admisiones",
        "total_facturas",
        "total_admisiones",
        "advertencias",
    }
    assert body["total_facturas"] == body["total_admisiones"] == 1
    assert body["advertencias"] == []
    assert list(body["facturas"][0]) == list(body["admisiones"][0]) == list(KEYS)
    assert list(body["facturas"][0].values()) == [
        "F1",
        "890201",
        "LABORATORIO",
        "EXAMEN",
        1.5,
        "2026-01-02",
        "2026-01-03",
        "0",
        "CERRADO",
        "EMPRESA",
        "OTRO",
        "CENTRAL",
    ]
    assert list(body["admisiones"][0].values()) == [
        "A1",
        "001",
        "LABORATORIO",
        "CONSULTA",
        2,
        "2026-01-30",
        "2026-01-31",
        "A1",
        "ABIERTO",
        "EPS",
        "ADMISIÓN",
        "CENTRAL",
    ]
    assert (
        invoices.calls
        == admissions.calls
        == [
            ReportFilter(
                date(2026, 1, 1),
                date(2026, 1, 31),
                (1,),
                (2,),
                (7, 8),
            )
        ]
    )


def test_no_laboratory_lines_empty_with_warning_without_queries(http: Any) -> None:
    client, invoices, admissions, _, _ = http
    invoices.lines = [CatalogOption(1, "CONSULTA")]
    response = client.get(BASE, params=DATES, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {
        "facturas": [],
        "admisiones": [],
        "total_facturas": 0,
        "total_admisiones": 0,
        "advertencias": ["No hay líneas de producto de LABORATORIO configuradas."],
    }
    assert invoices.calls == admissions.calls == []


async def test_sql_queries_are_concurrent_and_etl_offloaded(monkeypatch: Any) -> None:
    from nexora.statistics.domain import lab_consumption as domain

    entered: set[str] = set()
    ready = asyncio.Event()
    worker_threads: list[int] = []
    original = domain.normalize_text

    def observed(value: Any) -> str:
        worker_threads.append(threading.get_ident())
        return original(value)

    class Concurrent(Source):
        async def stream(self, filters: ReportFilter) -> AsyncIterator[list[dict[str, Any]]]:
            entered.add(str(id(self)))
            if len(entered) == 2:
                ready.set()
            await asyncio.wait_for(ready.wait(), 2)
            yield self.rows

    report = LabConsumptionReport(
        Concurrent([invoice(lna_prdcto="LABORATORIO")]),
        Concurrent([admission(lna_prdcto="LABORATORIO")]),
    )  # type: ignore[arg-type]
    monkeypatch.setattr(domain, "normalize_text", observed)
    result = await report.build(ReportFilter(date(2026, 1, 1), date(2026, 1, 31), (), ()))
    assert result["total_facturas"] == result["total_admisiones"] == 1
    assert len(entered) == 2
    assert worker_threads and threading.get_ident() not in worker_threads
    await report.aclose()


@pytest.mark.parametrize(
    ("values", "retained"),
    [
        ({}, True),
        ({"estado": "ABIERTO"}, False),
        ({"cdgo_prcdmnto": "2"}, False),
        ({"cdgo_prcdmnto": "3"}, False),
        ({"dscrp_transcn": "FACTURA AGRUPADA"}, False),
        ({"pnto_atncn": "URGENCIAS", "emprs": "EPS"}, False),
        ({"pnto_atncn": "URGENCIAS", "emprs": "PARTICULAR", "admision": 9}, True),
        ({"pnto_atncn": "URGENCIAS", "emprs": "PARTICULAR FISIO NATURA"}, True),
        ({"admision": 9}, False),
        ({"admision": ""}, True),
    ],
)
def test_invoice_reuses_fila_cumple(http: Any, values: Any, retained: bool) -> None:
    client, invoices, _, _, _ = http
    invoices.rows = [invoice(lna_prdcto="LABORATORIO") | values]
    response = client.get(BASE, params=DATES, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["total_facturas"] == int(retained)


@pytest.mark.parametrize("encoding", ["utf-8-sig", "cp1252"])
def test_ser_laboral_mapping_and_filters(http: Any, encoding: str) -> None:
    client, invoices, admissions, _, _ = http
    response = upload(
        client,
        "/ser-laboral",
        csv_bytes(
            [
                raw(lna_prdcto=" laboratorio ", cntdd="1.25"),
                raw(lna_prdcto="CONSULTA"),
                raw(lna_prdcto="LABORATORIO", estado="ABIERTO"),
            ],
            encoding,
        ),
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"ser_laboral_id", "filas", "total", "omitidas", "advertencias"}
    assert body["total"] == 1 and body["omitidas"] == 2 and body["advertencias"] == []
    assert list(body["filas"][0]) == list(KEYS)
    assert list(body["filas"][0].values()) == [
        "001",
        "002",
        "LABORATORIO",
        "CONSULTA",
        1.25,
        "2026-09-01",
        "2026-09-01",
        "",
        "CERRADO",
        "EMPRESA",
        "TRANSACCION",
        "SEDE",
    ]
    assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize(
    "rows", [[], [raw(lna_prdcto="CONSULTA")], [raw(lna_prdcto="LABORATORIO", estado="ABIERTO")]]
)
def test_ser_empty_rows_422(http: Any, rows: Any) -> None:
    response = upload(http[0], "/ser-laboral", csv_bytes(rows))
    assert response.status_code == 422
    assert response.json() == {"detail": "Ningún registro cumple los filtros."}


def test_ser_missing_headers_invalid_load_preserves_token(http: Any) -> None:
    client, invoices, admissions, _, _ = http
    token = upload(client, "/ser-laboral", csv_bytes([raw(lna_prdcto="LABORATORIO")])).json()[
        "ser_laboral_id"
    ]
    response = upload(client, "/ser-laboral", csv_bytes([raw()], headers=HEADERS[:-1]))
    assert response.status_code == 422
    assert response.json() == {"detail": "Cabeceras requeridas faltantes: nmro_atrzcn_eps."}
    assert export(client, tablas="ser_laboral", ser_laboral_id=token).status_code == 200
    assert len(invoices.calls) == len(admissions.calls) == 1


@pytest.mark.parametrize(("writer", "mime"), [(xls_bytes, XLS_MIME), (xlsx_bytes, XLSX_MIME)])
def test_annar_workbook_mapping_normalized_headers_analysis(
    http: Any, writer: Any, mime: str
) -> None:
    client, invoices, admissions, _, _ = http
    headers = tuple(
        " \xa0" + h.upper().replace("ó", "o").replace("Ó", "O") + " \xa0" for h in ANNAR_HEADERS
    )
    response = upload(
        client,
        "/annar-lab",
        writer(
            [
                annar_row("10", " Sección diez ", "20", " Hemograma "),
                annar_row("2", " Sección dos ", "20", " Hemograma "),
                annar_row("10", " Otra sección ", "10", " Glucosa "),
                annar_row("10", " Tercera sección ", "20", " Hemograma diferencial "),
                [""] * 14,
            ],
            headers,
        ),
        mime,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"annar_lab_id", "filas", "total", "advertencias", "analisis_annar"}
    assert body["total"] == 4 and body["advertencias"] == []
    assert body["filas"][0] == {
        "codigo_centro_costo": "10",
        "nombre_centro_costos": "Sección diez",
        "nombre_examen": "Hemograma",
        "cantidad": 1,
        "empresa": "Empresa",
        "punto_atencion": "Punto",
    }
    assert body["analisis_annar"] == [
        {"examen": "10", "descripcion": "Glucosa", "cantidad": 1},
        {"examen": "20", "descripcion": "Hemograma", "cantidad": 2},
        {"examen": "20", "descripcion": "Hemograma diferencial", "cantidad": 1},
    ]
    assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize(("writer", "mime"), [(xls_bytes, XLS_MIME), (xlsx_bytes, XLSX_MIME)])
@pytest.mark.parametrize("missing", ANNAR_HEADERS)
def test_annar_missing_headers_listed_and_token_preserved(
    http: Any, missing: str, writer: Any, mime: str,
) -> None:
    client, invoices, admissions, _, _ = http
    token = upload(client, "/annar-lab", writer([annar_row()]), mime).json()["annar_lab_id"]
    before = export(client, annar_lab_id=token)
    response = upload(
        client, "/annar-lab", writer([], tuple(h for h in ANNAR_HEADERS if h != missing)), mime,
    )
    assert response.status_code == 422
    assert response.json() == {"detail": f"Cabeceras requeridas faltantes: {missing}."}
    after = export(client, tablas="annar_lab", annar_lab_id=token)
    assert before.status_code == after.status_code == 200
    with (
        zipfile.ZipFile(io.BytesIO(before.content)) as original,
        zipfile.ZipFile(io.BytesIO(after.content)) as saved,
    ):
        assert saved.namelist() == original.namelist()
        assert {name: saved.read(name) for name in saved.namelist()} == {
            name: original.read(name) for name in original.namelist()
        }
    assert len(invoices.calls) == len(admissions.calls) == 2


@pytest.mark.parametrize("suffix", ["/ser-laboral", "/annar-lab"])
def test_upload_size_limit_413(http: Any, suffix: str) -> None:
    response = upload(http[0], suffix, b"x" * (25 * 1024 * 1024 + 1))
    assert response.status_code == 413
    assert "25 MB" in response.json()["detail"]
    assert http[1].calls == http[2].calls == []


@pytest.mark.parametrize("content", [b"not an xls", b"", xls_bytes([annar_row()])[:80]])
def test_annar_invalid_workbook_422(http: Any, content: bytes) -> None:
    response = upload(http[0], "/annar-lab", content)
    assert response.status_code == 422
    assert response.json() == {"detail": "El archivo XLS de ANNAR LAB no es válido."}


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
@pytest.mark.parametrize(
    "tables",
    [
        None,
        ["facturas"],
        ["admisiones"],
        ["ser_laboral"],
        ["annar_lab"],
        ["admisiones", "facturas"],
        ["ser_laboral", "facturas", "ser_laboral"],
        ["ser_laboral", "admisiones", "facturas"],
    ],
)
def test_exports_always_grouped(
    http: Any,
    formato: str,
    tables: list[str] | None,
) -> None:
    client, invoices, admissions, _, _ = http
    ser = upload(client, "/ser-laboral", csv_bytes([raw(lna_prdcto="LABORATORIO")])).json()
    annar = upload(client, "/annar-lab", xls_bytes([annar_row()])).json()
    selected = ["facturas", "admisiones", "ser_laboral"]
    params = {} if tables is None else {"tablas": tables}
    response = export(
        client,
        formato=formato,
        ser_laboral_id=ser["ser_laboral_id"],
        annar_lab_id=annar["annar_lab_id"],
        **params,
    )
    assert response.status_code == 200, response.text if formato == "csv" else "xlsx failed"
    labels = LABELS
    if formato == "csv":
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            content = archive.read("Datos_Aplicativo.csv").decode("utf-8-sig")
        rows = list(csv.reader(io.StringIO(content), delimiter=";"))
        assert rows[0] == list(labels)
        assert len(rows) == len(selected) + 1
        assert [r[0] for r in rows[1:]] == [
            {"facturas": "F1", "admisiones": "A1", "ser_laboral": "001", "annar_lab": "10"}[t]
            for t in selected
        ]
    else:
        with zipfile.ZipFile(io.BytesIO(response.content)) as book:
            assert "xl/worksheets/sheet2.xml" in book.namelist()
            xml = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        rows = xml.findall("s:sheetData/s:row", ns)
        assert len(rows) == len(selected) + 1
        assert [t.text for t in rows[0].findall("s:c/s:is/s:t", ns)] == list(labels)
    extension = "zip" if formato == "csv" else "xlsx"
    assert response.headers["content-disposition"] == (
        f'attachment; filename="consumo-laboratorio_2026-01-01_2026-01-31.{extension}"'
    )
    assert len(invoices.calls) == len(admissions.calls) == 1


@pytest.mark.parametrize(
    ("table", "token", "message"),
    [
        ("ser_laboral", "ser_laboral_id", "Carga el CSV de Ser Laboral para exportarlo."),
        ("annar_lab", "annar_lab_id", "Carga el XLS de ANNAR LAB para exportarlo."),
    ],
)
def test_export_required_and_expired_tokens_before_sql(
    http: Any, table: str, token: str, message: str
) -> None:
    client, invoices, admissions, _, _ = http
    expired = export(client, tablas=table, **{token: "expired"})
    assert expired.status_code == 410
    expected = (
        "El archivo de Ser Laboral expiró; cárgalo de nuevo."
        if table == "ser_laboral"
        else "El archivo de ANNAR LAB expiró; cárgalo de nuevo."
    )
    assert expired.json() == {"detail": expected}
    assert invoices.calls == admissions.calls == []
    rejected = export(client, tablas="facturas", **{token: "expired"})
    assert rejected.status_code == 410
    assert invoices.calls == admissions.calls == []


def test_combined_without_ser_token_optional_and_annar_may_not_mix(http: Any) -> None:
    client, invoices, admissions, _, _ = http
    response = export(client, tablas=["annar_lab", "facturas"])
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        content = archive.read("Datos_Aplicativo.csv").decode("utf-8-sig")
    assert len(list(csv.reader(io.StringIO(content), delimiter=";"))) == 3
    assert len(invoices.calls) == len(admissions.calls) == 1


@pytest.mark.parametrize(
    ("method", "suffix"),
    [
        ("GET", ""),
        ("GET", "/filters/sites"),
        ("GET", "/filters/companies"),
        ("POST", "/ser-laboral"),
        ("POST", "/annar-lab"),
        ("GET", "/export"),
        ("POST", "/export/analysis/xlsx"),
    ],
)
def test_all_routes_require_existing_permission(http: Any, method: str, suffix: str) -> None:
    client, invoices, admissions, auth, _ = http
    missing = client.request(method, BASE + suffix, params=DATES | {"formato": "csv"})
    assert missing.status_code == 401
    assert missing.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    auth.permissions = frozenset({"statistics.administrative.general_consumption.view"})
    forbidden = client.request(
        method, BASE + suffix, headers=AUTH, params=DATES | {"formato": "csv"}
    )
    assert forbidden.status_code == 403
    assert forbidden.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("suffix", ["/filters/sites", "/filters/companies"])
def test_shared_catalog_endpoints(http: Any, suffix: str) -> None:
    assert http[0].get(BASE + suffix, headers=AUTH).json() == [{"id": 1, "nombre": "Central"}]


@pytest.mark.parametrize(
    ("kind", "token_key"),
    [("ser", "ser_laboral_id"), ("annar", "annar_lab_id"), ("xlsx", "annar_lab_id")]
)
async def test_import_caches_ttl_capacity_offload_shutdown(
    kind: str, token_key: str, monkeypatch: Any
) -> None:
    from nexora.statistics.application import lab_consumption as module
    from nexora.statistics.application.ser_laboral import SerLaboralExpired

    function = {"ser": "process_lab_csv", "annar": "process_xls", "xlsx": "process_xlsx"}[kind]
    original = getattr(module, function)
    threads: list[int] = []

    def observed(content: bytes) -> Any:
        threads.append(threading.get_ident())
        return original(content)

    monkeypatch.setattr(module, function, observed)
    report = LabConsumptionReport(
        Source([]),
        Source([]),  # type: ignore[arg-type]
        upload_ttl_seconds=0.1,
        upload_max_entries=2,
    )
    cache = report.ser_laboral if kind == "ser" else report.annar_lab
    content = (
        csv_bytes([raw(lna_prdcto="LABORATORIO")]) if kind == "ser" else
        (xlsx_bytes([annar_row()]) if kind == "xlsx" else xls_bytes([annar_row()]))
    )
    first, second, third = [await cache.load(content) for _ in range(3)]
    assert len({r[token_key] for r in (first, second, third)}) == 3
    with pytest.raises(SerLaboralExpired):
        cache.rows(first[token_key])
    assert len(cache.rows(second[token_key])) == 1
    await asyncio.sleep(0.12)
    with pytest.raises(SerLaboralExpired):
        cache.rows(second[token_key])
    fourth = await cache.load(content)
    await report.aclose()
    with pytest.raises(SerLaboralExpired):
        cache.rows(fourth[token_key])
    assert threads and threading.get_ident() not in threads


def test_preserve_general_consumption_default_upload_and_export() -> None:
    from tests.unit.statistics.test_general_consumption import BASE as GENERAL_BASE
    from tests.unit.statistics.test_general_consumption import make_http

    client, invoices, admissions, _ = make_http()
    with client:
        response = client.post(GENERAL_BASE + "/ser-laboral", headers=AUTH,
                               content=csv_bytes([raw(lna_prdcto="CONSULTA")]))
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {"ser_laboral_id", "filas", "total", "omitidas", "advertencias"}
        assert body["total"] == 1 and body["omitidas"] == 0
        assert len(body["filas"][0]) == 40
        assert body["filas"][0]["lna_prdcto"] == "CONSULTA"
        assert body["filas"][0]["admision"] == "0"
        response = client.get(GENERAL_BASE + "/export", headers=AUTH, params=DATES | {
            "formato": "csv", "tablas": "ser_laboral", "ser_laboral_id": body["ser_laboral_id"],
        })
        assert response.status_code == 200
        assert len(next(csv.reader(io.StringIO(response.content.decode("utf-8-sig")),
                                  delimiter=";"))) == 40
        assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("suffix", ["/ser-laboral", "/annar-lab"])
async def test_incremental_size_cap_stops_reading_at_first_excess(http: Any, suffix: str) -> None:
    client, invoices, admissions, _, _ = http
    limit = 25 * 1024 * 1024
    chunks = iter([b"x" * limit, b"x", b"must not read"])
    messages: list[dict[str, Any]] = []
    reads = 0

    async def receive() -> dict[str, Any]:
        nonlocal reads
        reads += 1
        return {"type": "http.request", "body": next(chunks), "more_body": True}

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    path = BASE + suffix
    await client.app({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
        "scheme": "http", "path": path, "raw_path": path.encode(), "root_path": "",
        "query_string": b"", "server": ("testserver", 80), "client": ("test", 123),
        "headers": [(b"authorization", b"Bearer test-token")],
    }, receive, send)
    assert reads == 2
    assert messages[0]["status"] == 413
    assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("suffix", ["/ser-laboral", "/annar-lab"])
def test_exact_size_limit_allowed(http: Any, suffix: str) -> None:
    content = (csv_bytes([raw(lna_prdcto="LABORATORIO")]) if suffix == "/ser-laboral"
               else xls_bytes([annar_row()]))
    padding = b"\n" if suffix == "/ser-laboral" else b"\x00"
    response = upload(http[0], suffix, content + padding * (25 * 1024 * 1024 - len(content)))
    assert response.status_code == 200
    assert response.json()["total"] == 1
