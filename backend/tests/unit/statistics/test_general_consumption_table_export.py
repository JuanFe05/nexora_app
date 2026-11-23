"""Selección de tablas por la API pública, con fuentes sintéticas."""

import csv
import io
import zipfile
from typing import Any
from unittest.mock import AsyncMock
from xml.etree import ElementTree as ET

import pytest
from tests.unit.statistics.test_general_consumption import (
    AUTH,
    BASE,
    COLUMNS,
    DATES,
    Fees,
    invoice,
    make_http,
)
from tests.unit.statistics.test_general_consumption_ser_laboral import (
    EXPIRED,
    csv_bytes,
    raw,
    upload,
)

from nexora.statistics.application.general_consumption import GeneralConsumptionReport


def export_rows(content: bytes, formato: str) -> list[list[str]]:
    if formato == "csv":
        return list(csv.reader(io.StringIO(content.decode("utf-8-sig")), delimiter=";"))
    with zipfile.ZipFile(io.BytesIO(content)) as book:
        assert "xl/worksheets/sheet2.xml" not in book.namelist()
        xml = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: list[list[str]] = []
    for row in xml.findall("s:sheetData/s:row", ns):
        values: list[str] = [""] * (len(rows[0]) if rows else 0)
        for cell in row.findall("s:c", ns):
            column = 0
            for letter in cell.attrib["r"].rstrip("0123456789"):
                column = column * 26 + ord(letter) - ord("A") + 1
            values.extend([""] * max(0, column - len(values)))
            values[column - 1] = (
                cell.findtext("s:is/s:t", namespaces=ns)
                or cell.findtext("s:v", default="", namespaces=ns)
            )
        rows.append(values)
    return rows


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
@pytest.mark.parametrize(
    ("tablas", "points", "suffix"),
    [
        (["facturas"], ["CONSULTA"], "-facturas-detalladas"),
        (["admisiones"], ["URGENCIAS"], "-admisiones"),
        (["ser_laboral"], ["LABORAL"], "-ser-laboral"),
        (["admisiones", "facturas"], ["CONSULTA", "URGENCIAS"],
         "-facturas-detalladas-admisiones"),
        (["ser_laboral", "facturas"], ["CONSULTA", "LABORAL"],
         "-facturas-detalladas-ser-laboral"),
        (["ser_laboral", "admisiones"], ["URGENCIAS", "LABORAL"],
         "-admisiones-ser-laboral"),
        (["ser_laboral", "admisiones", "facturas"],
         ["CONSULTA", "URGENCIAS", "LABORAL"], ""),
        (["facturas", "facturas"], ["CONSULTA"], "-facturas-detalladas"),
        (["ser_laboral", "ser_laboral"], ["LABORAL"], "-ser-laboral"),
        (None, ["CONSULTA", "URGENCIAS", "LABORAL"], ""),
    ],
)
def test_selected_tables_rows_header_order_and_filename(
    formato: str, tablas: list[str] | None, points: list[str], suffix: str,
) -> None:
    client, _, _, _ = make_http()
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        params = DATES | {"formato": formato, "ser_laboral_id": token}
        if tablas is not None:
            params["tablas"] = tablas
        response = client.get(BASE + "/export", params=params, headers=AUTH)
        assert response.status_code == 200, response.text
        rows = export_rows(response.content, formato)
        assert rows[0] == [label for _, label, _ in COLUMNS]
        assert all(len(row) == 40 for row in rows)
        assert [row[6] for row in rows[1:]] == points
        assert response.headers["Content-Disposition"] == (
            f'attachment; filename="consumo-general{suffix}_'
            f'{DATES["fecha_inicial"]}_{DATES["fecha_final"]}.{formato}"'
        )
        assert response.headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
@pytest.mark.parametrize("tabla", ["facturas", "admisiones", "ser_laboral"])
def test_selected_tables_honor_columnas(formato: str, tabla: str) -> None:
    client, _, _, _ = make_http()
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        response = client.get(BASE + "/export", params=DATES | {
            "formato": formato, "tablas": tabla, "ser_laboral_id": token,
            "columnas": ["pnto_atncn:text", "cntdd1:number"],
        }, headers=AUTH)
        assert response.status_code == 200
        point, amount = {
            "facturas": ("CONSULTA", "0.1"),
            "admisiones": ("URGENCIAS", "200"),
            "ser_laboral": ("LABORAL", "10500"),
        }[tabla]
        assert export_rows(response.content, formato) == [
            ["Punto Atención / Servicio", "Cantidad × Vlr. Unitario"], [point, amount],
        ]


@pytest.mark.parametrize("tablas", [["ser_laboral"], ["facturas", "ser_laboral"]])
@pytest.mark.parametrize("token", [None, "unknown", "expired"])
def test_laboral_token_validation_precedes_build(
    tablas: list[str], token: str | None, monkeypatch: Any,
) -> None:
    client, invoices, admissions, _ = make_http([invoice(fcha_dcto="2025-01-01")])
    with client:
        if token == "expired":
            from nexora.statistics.application import ser_laboral

            token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
            now = ser_laboral.monotonic()
            monkeypatch.setattr(ser_laboral, "monotonic", lambda: now + 1801)
        params = DATES | {"formato": "csv", "tablas": tablas}
        if token is not None:
            params["ser_laboral_id"] = token
        response = client.get(BASE + "/export", params=params, headers=AUTH)
        assert response.status_code == (422 if token is None else 410)
        assert response.json() == (
            {"detail": "Carga el CSV de Ser Laboral para exportarlo."}
            if token is None else EXPIRED
        )
        assert "Content-Disposition" not in response.headers
        assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_laboral_only_skips_build_sql_and_fees(formato: str, monkeypatch: Any) -> None:
    client, invoices, admissions, _ = make_http([invoice(fcha_dcto="2025-01-01")])
    build = AsyncMock(side_effect=AssertionError("No debe construir el informe SQL"))
    fees = AsyncMock(side_effect=AssertionError("No debe leer cuotas"))
    monkeypatch.setattr(GeneralConsumptionReport, "build", build)
    monkeypatch.setattr(Fees, "snapshot", fees)
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        response = client.get(BASE + "/export", params=DATES | {
            "formato": formato, "tablas": "ser_laboral", "ser_laboral_id": token,
        }, headers=AUTH)
        assert response.status_code == 200
        assert len(export_rows(response.content, formato)) == 2
        build.assert_not_called()
        fees.assert_not_called()
        assert invoices.calls == admissions.calls == []


@pytest.mark.parametrize("tabla", ["facturas", "admisiones"])
def test_sql_tables_ignore_token_and_keep_year_validation(tabla: str) -> None:
    client, invoices, admissions, _ = make_http([invoice(fcha_dcto="2025-01-01")])
    with client:
        response = client.get(BASE + "/export", params=DATES | {
            "formato": "csv", "tablas": tabla, "ser_laboral_id": "unknown",
        }, headers=AUTH)
        assert response.status_code == 422
        assert response.json() == {
            "detail": "No hay cuotas moderadoras configuradas para la vigencia 2025."
        }
        assert "Content-Disposition" not in response.headers
        assert len(invoices.calls) == len(admissions.calls) == 1


@pytest.mark.parametrize("tablas", [["unknown"], ["facturas", "unknown"], [""]])
def test_unknown_tables_rejected_without_sources(tablas: list[str]) -> None:
    client, invoices, admissions, _ = make_http()
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        response = client.get(BASE + "/export", params=DATES | {
            "formato": "csv", "tablas": tablas, "ser_laboral_id": token,
        }, headers=AUTH)
        assert response.status_code == 422
        assert response.json()["detail"][0]["type"] == "literal_error"
        assert invoices.calls == admissions.calls == []
        preserved = client.get(BASE + "/export", params=DATES | {
            "formato": "csv", "ser_laboral_id": token,
        }, headers=AUTH)
        assert preserved.status_code == 200
        assert [row[6] for row in export_rows(preserved.content, "csv")[1:]] == [
            "CONSULTA", "URGENCIAS", "LABORAL",
        ]


@pytest.mark.parametrize("tabla", ["facturas", "admisiones", "ser_laboral"])
def test_table_export_requires_permission(tabla: str) -> None:
    client, invoices, admissions, auth = make_http()
    with client:
        token = upload(client, csv_bytes([raw()])).json()["ser_laboral_id"]
        auth.permissions = frozenset()
        response = client.get(BASE + "/export", params=DATES | {
            "formato": "csv", "tablas": tabla, "ser_laboral_id": token,
        }, headers=AUTH)
        assert response.status_code == 403
        assert invoices.calls == admissions.calls == []
