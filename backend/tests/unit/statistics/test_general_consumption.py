"""Consumo General con datos sintéticos, sin SQL Server real."""

import asyncio
import csv
import io
import zipfile
from datetime import date
from decimal import Decimal
from typing import Any
from xml.etree import ElementTree as ET

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.unit.statistics.test_general_billing import record
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.presentation.http.v1.dependencies.auth import get_authenticate_use_case
from nexora.statistics.application.general_billing import COLUMNS as BILLING_COLUMNS
from nexora.statistics.application.general_billing import process_chunks
from nexora.statistics.application.general_consumption import COLUMNS, GeneralConsumptionReport
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.domain.general_consumption import UnconfiguredFeeYear, fila_cumple
from nexora.statistics.presentation.http.v1.general_consumption_router import (
    create_general_consumption_router,
)

BASE = "/statistics/administrative/general-consumption"
PERMISSION = "statistics.administrative.general_consumption.view"
AUTH = {"Authorization": "Bearer test-token"}
FILTER = ReportFilter(date(2026, 1, 1), date(2026, 1, 31), (1,), (2,), (3,))


def invoice(**values: Any) -> dict[str, Any]:
    return (
        record(
            pnto_atncn="CONSULTA",
            admision=0,
            cdgo_prcdmnto="890201",
            usrio_realiza=" Asesor Realiza ",
            usrio_mdfca="NO USAR",
        )
        | values
    )


def admission(**values: Any) -> dict[str, Any]:
    return {
        "cnsctvo_admsn": "A1",
        "emprsa": " eps ",
        "sede": " central ",
        "fcha_admsn": "2026-01-30 12:00:00",
        "fcha_slda_admsn": "2026-01-31",
        "fcha_ncmnto": "2026-01-01",
        "tpo_idntfccn": "RC",
        "nmro_idntfccn": "001",
        "prmr_nmbre": " Ana ",
        "sgndo_nmbre": " María ",
        "prmr_aplldo": " Pérez ",
        "sgndo_aplldo": " Díaz ",
        "sexo": "F",
        "prfsnl_ordna": " doc uno ",
        "prfsnl_rlza": " doc dos ",
        "cd_dx": "A01",
        "dx": " diagnostico ",
        "usro_mdfccn": " asesor ",
        "nmro_atrzcn_eps": "0002",
        "prcdmnto": " consulta ",
        "vlr_srvco": 100,
        "cntdd": 2,
        "vlr_ttl": 200,
        "vlr_hnrrio": 9999,
        "vlr_srvcs": 200,
        "vlr_smnstrs": 0,
        "estado": "ABIERTO",
        "vlr_copago": 999,
        "pago_tpo1": 999,
        "pago_tpo2": 999,
        "drccn": " calle 1 ",
        "mncpo_rsdncia": " cali ",
    } | values


class Source:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[ReportFilter] = []

    async def stream(self, filters: ReportFilter) -> Any:
        self.calls.append(filters)
        for row in self.rows:
            yield [row]

    async def sites(self) -> list[Any]:
        return []

    companies = product_lines = sites


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ({}, True),
        ({"estado": " cerrado "}, True),
        ({"estado": "ABIERTO"}, False),
        ({"cdgo_prcdmnto": " 2 "}, False),
        ({"cdgo_prcdmnto": 3}, False),
        ({"cdgo_prcdmnto": "23"}, True),
        ({"dscrp_transcn": " factura agrupada "}, False),
        ({"dscrp_transcn": "OTRO"}, True),
        ({"pnto_atncn": " urgencias "}, False),
        ({"pnto_atncn": "URGENCIAS", "emprs": "PARTICULAR", "admision": 100}, True),
        ({"pnto_atncn": "URGENCIAS", "emprs": " particular fisio natura "}, True),
        ({"pnto_atncn": "URGENCIAS", "emprs": "PARTICULAR OTRO"}, False),
        ({"admision": None}, True),
        ({"admision": " "}, True),
        ({"admision": "0"}, True),
        ({"admision": 12}, False),
    ],
)
def test_fila_cumple_each_condition(values: dict[str, Any], expected: bool) -> None:
    assert fila_cumple(invoice(**values)) is expected


async def test_billing_default_predicate_and_columns_are_preserved() -> None:
    source = Source(
        [
            invoice(dscrp_transcn="FACTURA AGRUPADA", cnsctvo_dcto="1"),
            invoice(dscrp_transcn="OTRO", cnsctvo_dcto="2"),
        ]
    )
    rows = [row async for row in process_chunks(source.stream(FILTER))]
    assert len(rows) == 1 and rows[0]["dscrp_transcn"] == "FACTURA AGRUPADA"
    assert len(rows[0]) == len(BILLING_COLUMNS) == 44
    assert rows[0]["total_cntdd1"] == Decimal("0.10")
    assert rows[0]["usrio_mdfca"] == "NO USAR"


async def test_admissions_mapping_totals_are_independent_and_stable() -> None:
    rows = [
        admission(),
        admission(cnsctvo_admsn="A2", vlr_ttl=7),
        admission(vlr_ttl=Decimal("0.25")),
        admission(cnsctvo_admsn="A2", vlr_ttl=3),
    ]
    result = await GeneralConsumptionReport(Source([]), Source(rows)).build(FILTER)
    assert [r["admision"] for r in result["admisiones"]] == ["A1", "A2", "A1", "A2"]
    assert [r["total_cntdd1"] for r in result["admisiones"]] == [Decimal("200.25"), 10, 0, 0]
    row = result["admisiones"][0]
    assert list(row) == [key for key, _, _ in COLUMNS] and len(row) == 40
    assert row["cnsctvo_dcto"] == "A1" and row["dscrp_transcn"] == "ADMISION"
    assert row["fcha_dcto"] == "2026-01-30"
    assert {
        key: row[key]
        for key in (
            "pnto_atncn",
            "fcha_ingrso_pcnte",
            "fcha_egreso",
            "cdgo_tpo_dcmnto",
            "cc_afldo",
            "nombre_completo",
            "edad",
            "tipo_edad",
            "grupo_etario",
            "mes_dcto",
            "genero",
            "prfsnl_salud_ordn",
            "prfsnl_salud_rlza",
            "cdgo_dgnstco",
            "dscrpcn_dgnstco",
            "usrio_mdfca",
            "nmro_atrzcn_eps",
            "emprs",
            "procedimiento",
            "vlr_untro",
            "cntdd1",
            "vlr_copago",
            "pago_tpo1",
            "pago_tpo2",
            "prfjo_dcto",
            "drccn",
            "mncpo_rsdncia",
        )
    } == {
        "pnto_atncn": "URGENCIAS",
        "fcha_ingrso_pcnte": "2026-01-30",
        "fcha_egreso": "2026-01-31",
        "cdgo_tpo_dcmnto": "RC",
        "cc_afldo": "001",
        "nombre_completo": "ANA MARÍA PÉREZ DÍAZ",
        "edad": 29,
        "tipo_edad": "DÍAS",
        "grupo_etario": "PRIMERA INFANCIA",
        "mes_dcto": "ENERO",
        "genero": "F",
        "prfsnl_salud_ordn": "DOC UNO",
        "prfsnl_salud_rlza": "DOC DOS",
        "cdgo_dgnstco": "A01",
        "dscrpcn_dgnstco": "DIAGNOSTICO",
        "usrio_mdfca": "ASESOR",
        "nmro_atrzcn_eps": "0002",
        "emprs": "EPS",
        "procedimiento": "CONSULTA",
        "vlr_untro": 100,
        "cntdd1": 200,
        "vlr_copago": 0,
        "pago_tpo1": 0,
        "pago_tpo2": 0,
        "prfjo_dcto": "",
        "drccn": "CALLE 1",
        "mncpo_rsdncia": "CALI",
    }
    assert result["total_admisiones"] == 4 and result["total_facturas"] == 0
    assert all(i["valor"] == 0 for i in result["indicadores"])


async def test_indicator_math_uses_valid_invoices_once_and_all_fee_amounts() -> None:
    rows = [
        invoice(cnsctvo_dcto=str(i), emprs=company, vlr_lqdd_pcnte=amount)
        for i, (company, amount) in enumerate(
            [
                ("EPS", 5000),
                ("EPS", 20100),
                ("EPS", 52800),
                ("EPS", Decimal("12.25")),
                ("SOS PGP MIR Y COR CONTRIBUTIVO", 5000),
                ("SOS PGP MIR Y COR CONTRIBUTIVO", 100),
                ("SOS PGP MIR Y COR SUBSIDIADO", 20100),
                ("SOS PGP MIR Y COR SUBSIDIADO", 200),
            ]
        )
    ]
    rows += [
        rows[-1].copy(),
        invoice(estado="ABIERTO", vlr_lqdd_pcnte=999999),
        invoice(cnsctvo_dcto="P", emprs="PARTICULAR", vlr_frmas_pgo_tpo1="123.45"),
    ]
    result = await GeneralConsumptionReport(Source(rows), Source([admission()])).build(FILTER)
    assert [i["valor"] for i in result["indicadores"]] == [
        Decimal("123.45"),
        Decimal("312.25"),
        103000,
        100,
        5000,
        200,
        20100,
    ]
    assert len({i["clave"] for i in result["indicadores"]}) == 7
    assert result["total_facturas"] == 10
    assert result["facturas"][8]["vlr_copago"] == 0
    assert result["facturas"][7]["total_cntdd1"] == Decimal("0.2")
    assert result["advertencias"] == []


async def test_unconfigured_year_and_injected_configuration() -> None:
    source = Source([invoice(fcha_dcto="2025-01-01", vlr_lqdd_pcnte=5000)])
    report = GeneralConsumptionReport(source, Source([]))
    with pytest.raises(
        UnconfiguredFeeYear, match="No hay cuotas moderadoras configuradas para la vigencia 2025"
    ):
        await report.build(FILTER)
    source.rows = [invoice(fcha_dcto="2025-01-01", estado="ABIERTO")]
    assert (await report.build(FILTER))["facturas"] == []
    custom = GeneralConsumptionReport(
        Source([invoice(vlr_lqdd_pcnte=123)]), Source([]), fees={2026: frozenset({123})}
    )
    assert (await custom.build(FILTER))["indicadores"][2]["valor"] == 123


async def test_queries_are_concurrent_filters_equal_and_cache_single_flight() -> None:
    started: set[str] = set()
    both = asyncio.Event()

    class Concurrent(Source):
        async def stream(self, filters: ReportFilter) -> Any:
            started.add(str(id(self)))
            if len(started) == 2:
                both.set()
            await asyncio.wait_for(both.wait(), 2)
            async for chunk in super().stream(filters):
                yield chunk

    invoices, admissions = Concurrent([invoice()]), Concurrent([admission()])
    report = GeneralConsumptionReport(invoices, admissions, ttl_seconds=0.05)
    first, second = await asyncio.gather(report.build(FILTER), report.build(FILTER))
    assert first == second
    assert invoices.calls == admissions.calls == [FILTER]
    await report.build(FILTER)
    assert len(invoices.calls) == 1
    await asyncio.sleep(0.06)
    await report.build(FILTER)
    assert invoices.calls == admissions.calls == [FILTER, FILTER]


async def test_sql_adapters_use_the_same_real_filter_parameters() -> None:
    from nexora.statistics.infrastructure.admissions_source import SqlServerAdmissionsSource
    from nexora.statistics.infrastructure.detailed_invoices_source import (
        SqlServerDetailedInvoicesSource,
    )

    class Reader:
        calls: list[Any]

        def __init__(self) -> None:
            self.calls = []

        async def stream(self, query: Any, params: Any) -> Any:
            self.calls.append((query.name, params))
            yield [admission()] if query.name == "statistics.admissions_export" else [invoice()]

    reader = Reader()
    report = GeneralConsumptionReport(
        SqlServerDetailedInvoicesSource(reader), SqlServerAdmissionsSource(reader)
    )
    result = await report.build(FILTER)
    assert result["total_facturas"] == result["total_admisiones"] == 1
    assert {name for name, _ in reader.calls} == {
        "statistics.admissions_export",
        "statistics.detailed_invoices_export",
    }
    assert (
        reader.calls[0][1]
        == reader.calls[1][1]
        == {
            "fecha_inicial": FILTER.fecha_inicial,
            "fecha_final": FILTER.fecha_final,
            "sedes": [1],
            "empresas": [2],
            "lineas": [3],
            "filtrar_sedes": 1,
            "filtrar_empresas": 1,
            "filtrar_lineas": 1,
        }
    )
    await report.aclose()


async def test_etl_is_offloaded_and_failed_streams_are_closed(monkeypatch: Any) -> None:
    import threading

    from nexora.statistics.application import general_consumption as module
    from nexora.statistics.application.general_billing import clean_record

    main_thread = threading.get_ident()
    threads: list[int] = []

    def observed(row: Any) -> Any:
        threads.append(threading.get_ident())
        return clean_record(row)

    monkeypatch.setattr(module, "clean_record", observed)
    report = GeneralConsumptionReport(Source([invoice()]), Source([admission()]))
    await report.build(FILTER)
    assert threads and all(thread != main_thread for thread in threads)
    await report.aclose()

    started, closed = asyncio.Event(), asyncio.Event()

    class Waiting(Source):
        async def stream(self, filters: ReportFilter) -> Any:
            try:
                started.set()
                await asyncio.Event().wait()
                yield []
            finally:
                closed.set()

    class Failing(Source):
        async def stream(self, filters: ReportFilter) -> Any:
            await started.wait()
            raise RuntimeError("synthetic stream failure")
            yield []

    failing = GeneralConsumptionReport(Failing([]), Waiting([]))
    with pytest.raises(RuntimeError, match="synthetic stream failure"):
        await failing.build(FILTER)
    assert closed.is_set()
    await failing.aclose()


def make_http(rows: list[dict[str, Any]] | None = None) -> Any:
    invoices, admissions = Source(rows if rows is not None else [invoice()]), Source([admission()])
    report = GeneralConsumptionReport(invoices, admissions)
    auth = FakeAuthentication()
    auth.permissions = frozenset({PERMISSION})
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(create_general_consumption_router(provider=lambda: report))
    app.dependency_overrides[get_authenticate_use_case] = lambda: auth
    return TestClient(app), invoices, admissions, auth


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_http_contract_union_headers_and_cache(formato: str) -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        response = client.get(BASE, params=DATES, headers=AUTH)
        assert response.status_code == 200
        body = response.json()
        assert set(body) == {
            "indicadores",
            "facturas",
            "admisiones",
            "advertencias",
            "total_facturas",
            "total_admisiones",
        }
        assert isinstance(body["facturas"][0]["cntdd1"], float)
        assert len(body["facturas"][0]) == 40
        assert body["facturas"][0]["usrio_mdfca"] == "ASESOR REALIZA"
        exported = client.get(BASE + "/export", params=DATES | {"formato": formato}, headers=AUTH)
        assert exported.status_code == 200
        assert exported.headers["Cache-Control"] == "no-store"
        if formato == "csv":
            rows = list(
                csv.reader(io.StringIO(exported.content.decode("utf-8-sig")), delimiter=";")
            )
            assert rows[0] == [label for _, label, _ in COLUMNS]
            assert len(rows) == 3 and rows[1][6] == "CONSULTA" and rows[2][6] == "URGENCIAS"
        else:
            with zipfile.ZipFile(io.BytesIO(exported.content)) as book:
                xml = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314
                assert "sheet2.xml" not in " ".join(book.namelist())
            ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            rows = xml.findall("s:sheetData/s:row", ns)
            assert len(rows) == 3
            assert [n.text for n in rows[0].findall("s:c/s:is/s:t", ns)] == [
                label for _, label, _ in COLUMNS
            ]
            assert "CONSULTA" in ET.tostring(rows[1]).decode()
            assert "URGENCIAS" in ET.tostring(rows[2]).decode()
        assert len(invoices.calls) == len(admissions.calls) == 1
        selected = client.get(
            BASE + "/export",
            params=DATES
            | {
                "formato": "csv",
                "columnas": ["sede:text", "cntdd1:number"],
            },
            headers=AUTH,
        )
        assert selected.content.decode("utf-8-sig").splitlines() == [
            "Sede;Cantidad × Vlr. Unitario",
            ";0.1",
            "CENTRAL;200",
        ]


@pytest.mark.parametrize("suffix", ["", "/export"])
def test_http_unconfigured_year_is_422(suffix: str) -> None:
    client, _, _, _ = make_http([invoice(fcha_dcto="2025-01-01")])
    with client:
        response = client.get(BASE + suffix, params=DATES | {"formato": "csv"}, headers=AUTH)
        assert response.status_code == 422
        assert response.json() == {
            "detail": "No hay cuotas moderadoras configuradas para la vigencia 2025."
        }


@pytest.mark.parametrize(
    "suffix",
    [
        "",
        "/export",
        "/filters/sites",
        "/filters/companies",
        "/filters/product-lines",
        "/export/analysis/pdf",
        "/export/analysis/xlsx",
    ],
)
def test_all_routes_enforce_permission_without_reading(suffix: str) -> None:
    client, invoices, admissions, auth = make_http()
    auth.permissions = frozenset()
    with client:
        if "/analysis/" in suffix:
            response = client.post(BASE + suffix, json={"indicadores": []}, headers=AUTH)
        else:
            response = client.get(BASE + suffix, params=DATES | {"formato": "csv"}, headers=AUTH)
        assert response.status_code == 403
        assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("formato", ["pdf", "xlsx"])
def test_analysis_exports_only_indicators_and_do_not_query(formato: str) -> None:
    import re
    import zlib

    client, invoices, admissions, _ = make_http()
    payload = {
        "indicadores": [{"clave": "venta", "etiqueta": "Total Venta Particular", "valor": 12345}],
        "titulo": "CONSUMO GENERAL",
        "periodo": "ENERO 2026",
    }
    with client:
        response = client.post(BASE + "/export/analysis/" + formato, json=payload, headers=AUTH)
        assert response.status_code == 200
        if formato == "pdf":
            assert b"/MediaBox [0 0 792 612]" in response.content
            stream = re.search(rb"stream\n(.*?)\nendstream", response.content, re.S)
            assert stream is not None
            text = zlib.decompress(stream[1]).decode("latin-1")
            assert "Total Venta Particular" in text and "12.345" in text
        else:
            with zipfile.ZipFile(io.BytesIO(response.content)) as book:
                text = book.read("xl/worksheets/sheet1.xml").decode()
                assert "Total Venta Particular" in text and "12345" in text
                assert "sheet2.xml" not in " ".join(book.namelist())
        assert "ANA" not in text and "URGENCIAS" not in text
        assert invoices.calls == admissions.calls == []
        rejected = client.post(
            BASE + "/export/analysis/" + formato,
            json=payload | {"facturas": [{"nombre_completo": "PACIENTE"}]},
            headers=AUTH,
        )
        assert rejected.status_code == 422


def test_invalid_columns_and_dates_are_422_without_queries() -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        for params in (
            {"columnas": ["unknown:text"]},
            {"columnas": ["sede:bad"]},
            {"fecha_inicial": "2026-02-01"},
        ):
            response = client.get(
                BASE + "/export", params=DATES | {"formato": "csv"} | params, headers=AUTH
            )
            assert response.status_code == 422
        assert invoices.calls == admissions.calls == []
