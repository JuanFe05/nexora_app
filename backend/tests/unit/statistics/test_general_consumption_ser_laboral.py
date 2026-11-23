"""Contrato Ser Laboral con bytes CSV sintéticos; nunca datos de pacientes reales."""

import asyncio
import csv
import io
import zipfile
from decimal import Decimal
from typing import Any
from xml.etree import ElementTree as ET

import pytest
from tests.unit.statistics.test_general_consumption import (
    AUTH,
    BASE,
    COLUMNS,
    DATES,
    make_http,
)

HEADERS = (
    "estado", "sede", "emprs", "cnsctvo_dcto", "dscrp_transcn", "fcha_dcto",
    "pnto_atncn_atncn", "lna_prdcto", "cdgo_prcdmnto", "procedimiento", "cc_afldo",
    "afldo", "genero", "fcha_ingrso_pcnte", "fcha_egrso_pcnte", "prfsnl_salud_ordn",
    "prfsnl_salud_rlza", "cntdd", "vlr_untro", "usrio_mdfca", "nmro_atrzcn_eps",
)
EXPIRED = {"detail": "El archivo de Ser Laboral expiró; cárgalo de nuevo."}


def raw(**values: str) -> dict[str, str]:
    return dict(zip(HEADERS, (
        " cerrado ", " sede ", " empresa ", "001", " transaccion ", "01/09/2026",
        " laboral ", " linea ", "002", " consulta ", "0003", " nombre sintético ",
        " f ", "9/1/2026 7:14:43 AM", "9/2/2026 7:14:43 PM", " ordena ",
        " realiza ", "1.00", "10,500.00", " asesor ", "0004",
    ), strict=True)) | values


def csv_bytes(rows: list[dict[str, str]], encoding: str = "utf-8-sig",
              headers: tuple[str, ...] = HEADERS) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode(encoding)


def upload(client: Any, content: bytes) -> Any:
    return client.post(BASE + "/ser-laboral", content=content,
                       headers=AUTH | {"Content-Type": "text/csv"})


@pytest.mark.parametrize("encoding", ["utf-8-sig", "utf-8", "cp1252"])
def test_mapping_filter_totals_non_contiguous_and_encodings(encoding: str) -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        response = upload(client, csv_bytes([
            raw(), raw(cnsctvo_dcto="002", cntdd="2.00", vlr_untro="0.10"),
            raw(cntdd="2.00", vlr_untro="1.25"),
            raw(estado="ABIERTO", vlr_untro="999999"),
            raw(cnsctvo_dcto="002", cntdd="no numérico", vlr_untro=""),
        ], encoding))
        assert response.status_code == 200, response.text
        body = response.json()
        assert set(body) == {"ser_laboral_id", "filas", "total", "omitidas", "advertencias"}
        assert isinstance(body["ser_laboral_id"], str) and len(body["ser_laboral_id"]) >= 32
        assert body["total"] == 4 and body["omitidas"] == 1 and body["advertencias"] == []
        rows = body["filas"]
        assert [r["cnsctvo_dcto"] for r in rows] == ["001", "002", "001", "002"]
        assert [r["total_cntdd1"] for r in rows] == [10502.5, 0.2, 0, 0]
        assert [r["cntdd1"] for r in rows] == [10500, 0.2, 2.5, 0]
        expected = {key: "" for key, _, _ in COLUMNS}
        expected.update({
            "sede": "SEDE", "emprs": "EMPRESA", "cnsctvo_dcto": "001",
            "dscrp_transcn": "TRANSACCION", "fcha_dcto": "2026-09-01",
            "pnto_atncn": "LABORAL", "lna_prdcto": "LINEA", "admision": "0",
            "cdgo_prcdmnto": "002", "procedimiento": "CONSULTA", "cc_afldo": "0003",
            "nombre_completo": "NOMBRE SINTÉTICO", "genero": "F",
            "fcha_ingrso_pcnte": "2026-09-01", "fcha_egreso": "2026-09-02",
            "prfsnl_salud_ordn": "ORDENA", "prfsnl_salud_rlza": "REALIZA",
            "vlr_srvcs": 0, "vlr_smnstrs": 0, "cntdd": 1, "vlr_untro": 10500,
            "cntdd1": 10500, "total_cntdd1": 10502.5, "vlr_copago": 0,
            "pago_tpo1": 0, "pago_tpo2": 0, "usrio_mdfca": "ASESOR",
            "nmro_atrzcn_eps": "0004", "mes_dcto": "SEPTIEMBRE",
        })
        assert rows[0] == expected
        assert list(rows[0]) == [key for key, _, _ in COLUMNS]
        assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("value", ["", "no numérico", "NaN", "Infinity"])
def test_invalid_numbers_and_dates_are_zero_and_empty(value: str) -> None:
    client, _, _, _ = make_http()
    with client:
        response = upload(client, csv_bytes([raw(
            cntdd=value, vlr_untro=value, fcha_dcto="31/02/2026",
            fcha_ingrso_pcnte="13/1/2026 1:00:00 AM", fcha_egrso_pcnte="invalid",
        )]))
        assert response.status_code == 200
        row = response.json()["filas"][0]
        assert [row[k] for k in ("cntdd", "vlr_untro", "cntdd1", "total_cntdd1")] == [0]*4
        date_keys = ("fcha_dcto", "fcha_ingrso_pcnte", "fcha_egreso", "mes_dcto")
        assert [row[k] for k in date_keys] == [""] * 4


def test_unused_garbled_header_and_quoted_multiline_text_are_ignored() -> None:
    client, _, _, _ = make_http()
    with client:
        response = upload(client, csv_bytes([raw(afldo=" nombre,\nsintético ") | {
            "A?o": "ignorar", "Textbox37": "999", "vlr_factrdo": "999",
        }], headers=HEADERS + ("A?o", "Textbox37", "vlr_factrdo")))
        assert response.status_code == 200
        assert response.json()["filas"][0]["nombre_completo"] == "NOMBRE, SINTÉTICO"
        assert response.json()["filas"][0]["total_cntdd1"] == 10500


@pytest.mark.parametrize("missing", [(h,) for h in HEADERS] + [("sede", "cntdd", "vlr_untro")])
def test_missing_headers_422_and_existing_token_unchanged(missing: tuple[str, ...]) -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        response = upload(
            client, csv_bytes([raw()], headers=tuple(h for h in HEADERS if h not in missing))
        )
        assert response.status_code == 422
        assert response.json() == {
            "detail": f"Cabeceras requeridas faltantes: {', '.join(missing)}."
        }
        exported = client.get(BASE + "/export", params=DATES | {
            "formato": "csv", "ser_laboral_id": token,
        }, headers=AUTH)
        assert exported.status_code == 200 and b"LABORAL" in exported.content
        assert len(invoices.calls) == len(admissions.calls) == 1


@pytest.mark.parametrize("rows", [[], [raw(estado="ABIERTO")], [raw(estado="")]])
def test_zero_closed_rows_422(rows: list[dict[str, str]]) -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        response = upload(client, csv_bytes(rows))
        assert response.status_code == 422
        assert response.json() == {"detail": "Ningún registro cumple los filtros."}
        assert invoices.calls == admissions.calls == []


def test_upload_size_cap_and_permission() -> None:
    client, invoices, admissions, auth = make_http()
    with client:
        response = upload(client, b"x" * (25 * 1024 * 1024 + 1))
        assert response.status_code == 413
        auth.permissions = frozenset()
        assert upload(client, csv_bytes([raw()])).status_code == 403
        assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_combined_export_order_single_header_and_unknown_token(formato: str) -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        response = client.get(BASE + "/export", params=DATES | {
            "formato": formato, "ser_laboral_id": token,
        }, headers=AUTH)
        assert response.status_code == 200
        if formato == "csv":
            rows = list(
                csv.reader(io.StringIO(response.content.decode("utf-8-sig")), delimiter=";")
            )
            assert rows[0] == [label for _, label, _ in COLUMNS]
            assert [r[6] for r in rows[1:]] == ["CONSULTA", "URGENCIAS", "LABORAL"]
        else:
            with zipfile.ZipFile(io.BytesIO(response.content)) as book:
                assert "xl/worksheets/sheet2.xml" not in book.namelist()
                xml = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314
            ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            rows = xml.findall("s:sheetData/s:row", ns)
            assert len(rows) == 4
            assert [n.text for n in rows[0].findall("s:c/s:is/s:t", ns)] == [
                label for _, label, _ in COLUMNS
            ]
            assert all(text in ET.tostring(row).decode() for text, row in zip(
                ["CONSULTA", "URGENCIAS", "LABORAL"], rows[1:], strict=True))
        bad = client.get(BASE + "/export", params=DATES | {
            "formato": formato, "ser_laboral_id": "unknown",
        }, headers=AUTH)
        assert bad.status_code == 410 and bad.json() == EXPIRED
        assert len(invoices.calls) == len(admissions.calls) == 1


async def test_cache_ttl_capacity_shutdown_and_offloading(monkeypatch: Any) -> None:
    import threading

    from nexora.statistics.application import ser_laboral as module

    cache = module.SerLaboralCache(ttl_seconds=0.2, max_entries=2)
    main = threading.get_ident()
    threads: list[int] = []
    original = module.process_csv

    def observed(content: bytes) -> Any:
        threads.append(threading.get_ident())
        return original(content)

    monkeypatch.setattr(module, "process_csv", observed)
    first = await cache.load(csv_bytes([raw()]))
    second = await cache.load(csv_bytes([raw()]))
    third = await cache.load(csv_bytes([raw()]))
    assert len({r["ser_laboral_id"] for r in (first, second, third)}) == 3
    with pytest.raises(module.SerLaboralExpired):
        cache.rows(first["ser_laboral_id"])
    assert cache.rows(second["ser_laboral_id"])[0]["total_cntdd1"] == Decimal(10500)
    assert threads and all(t != main for t in threads)
    await asyncio.sleep(0.21)
    with pytest.raises(module.SerLaboralExpired):
        cache.rows(second["ser_laboral_id"])
    fourth = await cache.load(csv_bytes([raw()]))
    cache.close()
    with pytest.raises(module.SerLaboralExpired):
        cache.rows(fourth["ser_laboral_id"])


async def test_incremental_cap_stops_reading_and_exact_limit_is_allowed() -> None:
    client, invoices, admissions, _ = make_http()
    limit = 25 * 1024 * 1024
    chunks = iter([b"x" * limit, b"x", b"must not read"])
    reads = 0
    messages: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        nonlocal reads
        reads += 1
        return {"type": "http.request", "body": next(chunks), "more_body": True}

    async def send(message: dict[str, Any]) -> None:
        messages.append(message)

    await client.app({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "http", "path": BASE + "/ser-laboral",
        "raw_path": (BASE + "/ser-laboral").encode(), "root_path": "",
        "query_string": b"", "server": ("testserver", 80), "client": ("test", 123),
        "headers": [(b"authorization", b"Bearer test-token"), (b"content-type", b"text/csv")],
    }, receive, send)
    assert reads == 2
    assert messages[0]["status"] == 413
    assert b"25 MB" in messages[1]["body"]
    assert invoices.calls == admissions.calls == []
    # Blank physical CSV lines do not add records; exactly the cap still parses normally.
    valid = csv_bytes([raw()])
    with client:
        response = upload(client, valid + b"\n" * (limit - len(valid)))
        assert response.status_code == 200 and response.json()["total"] == 1


def test_expired_token_http_410_without_sql() -> None:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from tests.unit.statistics.test_general_consumption import Fees, Source
    from tests.unit.statistics.test_router import FakeAuthentication

    from nexora.bootstrap.app import _register_error_handlers
    from nexora.identity_access.presentation.http.v1.dependencies.auth import (
        get_authenticate_use_case,
    )
    from nexora.statistics.application.general_consumption import GeneralConsumptionReport
    from nexora.statistics.application.ser_laboral import SerLaboralCache
    from nexora.statistics.presentation.http.v1.general_consumption_router import (
        create_general_consumption_router,
    )

    source = Source([])
    report = GeneralConsumptionReport(source, source, fees=Fees())
    report.ser_laboral = SerLaboralCache(ttl_seconds=0.01)
    auth = FakeAuthentication()
    auth.permissions = frozenset({"statistics.administrative.general_consumption.view"})
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(create_general_consumption_router(provider=lambda: report))
    app.dependency_overrides[get_authenticate_use_case] = lambda: auth
    with TestClient(app) as client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        # Wait on the same portal/event loop which owns the TTL timer.
        assert client.portal is not None
        client.portal.call(asyncio.sleep, 0.02)
        response = client.get(BASE + "/export", params=DATES | {
            "formato": "csv", "ser_laboral_id": token,
        }, headers=AUTH)
        assert response.status_code == 410 and response.json() == EXPIRED
        assert source.calls == []
        client.portal.call(report.aclose)


def test_preserve_consult_and_export_without_token_after_upload() -> None:
    client, _, _, _ = make_http()
    with client:
        before = client.get(BASE, params=DATES, headers=AUTH)
        exported_before = client.get(
            BASE + "/export", params=DATES | {"formato": "csv"}, headers=AUTH
        )
        assert upload(client, csv_bytes([raw()])).status_code == 200
        after = client.get(BASE, params=DATES, headers=AUTH)
        exported_after = client.get(
            BASE + "/export", params=DATES | {"formato": "csv"}, headers=AUTH
        )
        assert before.status_code == after.status_code == 200
        assert before.content == after.content
        assert exported_before.status_code == exported_after.status_code == 200
        assert exported_before.content == exported_after.content
