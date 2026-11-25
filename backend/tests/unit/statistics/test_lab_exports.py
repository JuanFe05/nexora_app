"""Grouped laboratory downloads, checked through the public HTTP contract."""

# ruff: noqa: F811 -- pytest fixture imported from the shared laboratory contract

import csv
import io
import threading
import zipfile
from typing import Any
from xml.etree import ElementTree as ET

import pytest
from tests.unit.statistics.test_general_consumption_ser_laboral import csv_bytes, raw
from tests.unit.statistics.test_lab_consumption import (
    ANNAR_LABELS,
    AUTH,
    BASE,
    LABELS,
    annar_row,
    export,
    http,  # noqa: F401 -- shared fixture
    upload,
    xls_bytes,
)

NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def sheet_rows(book: zipfile.ZipFile, index: int) -> list[list[str | None]]:
    sheet = ET.fromstring(book.read(f"xl/worksheets/sheet{index}.xml"))  # noqa: S314
    return [
        [c.findtext("s:is/s:t", namespaces=NS) or c.findtext("s:v", namespaces=NS) for c in row]
        for row in sheet.findall("s:sheetData/s:row", NS)
    ]


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
@pytest.mark.parametrize("imports", [False, True])
def test_grouped_content_and_optional_imports(http: Any, formato: str, imports: bool) -> None:
    client, invoices, admissions, _, _ = http
    tokens = {}
    if imports:
        tokens["ser_laboral_id"] = upload(
            client, "/ser-laboral", csv_bytes([raw(lna_prdcto="LABORATORIO")])
        ).json()["ser_laboral_id"]
        tokens["annar_lab_id"] = upload(
            client, "/annar-lab", xls_bytes([annar_row(), annar_row("2")])
        ).json()["annar_lab_id"]
    response = export(client, formato=formato, tablas=["annar_lab", "facturas"], **tokens)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        if formato == "xlsx":
            workbook = ET.fromstring(book.read("xl/workbook.xml"))  # noqa: S314
            assert [s.attrib["name"] for s in workbook.findall("s:sheets/s:sheet", NS)] == [
                "Datos Aplicativo", "ANNAR LAB"
            ]
            aplicativo, annar = sheet_rows(book, 1), sheet_rows(book, 2)
        else:
            assert response.headers["content-type"] == "application/zip"
            assert book.namelist() == ["Datos_Aplicativo.csv", "ANNAR_LAB.csv"]
            tables = []
            for name in book.namelist():
                content = book.read(name)
                assert content.startswith(b"\xef\xbb\xbf")
                tables.append(list(csv.reader(io.StringIO(content.decode("utf-8-sig")),
                                              delimiter=";")))
            aplicativo, annar = tables
    assert aplicativo[0] == list(LABELS)
    assert [r[0] for r in aplicativo[1:]] == ["F1", "A1"] + (["001"] if imports else [])
    assert annar[0] == list(ANNAR_LABELS)
    assert [r[0] for r in annar[1:]] == (["10", "2"] if imports else [])
    assert len(invoices.calls) == len(admissions.calls) == 1


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_column_selection_only_affects_aplicativo(http: Any, formato: str) -> None:
    response = export(http[0], formato=formato, columnas=["cntdd:number", "cdgo_prcdmnto:text"])
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        if formato == "xlsx":
            rows = sheet_rows(book, 1)
            assert rows == [["Cantidad", "CUPS"], ["1.5", "890201"], ["2", "001"]]
            assert sheet_rows(book, 2) == [list(ANNAR_LABELS)]
        else:
            assert book.read("Datos_Aplicativo.csv").decode("utf-8-sig") == (
                "Cantidad;CUPS\r\n1.5;890201\r\n2;001\r\n"
            )
            assert book.read("ANNAR_LAB.csv").decode("utf-8-sig") == (
                ";".join(ANNAR_LABELS) + "\r\n"
            )


@pytest.mark.parametrize("columns", [["unknown:text"], ["cntdd:number"] * 2, ["cntdd:bad"]])
def test_invalid_columns_before_sql(http: Any, columns: list[str]) -> None:
    response = export(http[0], columnas=columns)
    assert response.status_code == 422
    assert http[1].calls == http[2].calls == []


BODY = {
    "aplicativo": [{"cups": "001", "descripcion": "HEMOGRAMA", "cantidad": 12500.5}],
    "annar": [{"examen": "10", "descripcion": "HEMATOLOGÍA", "cantidad": 22508}],
    "titulo": "CONSUMO DE LABORATORIO",
    "periodo": "ENERO 2026",
}


def test_analysis_layout_values_and_no_sql(http: Any) -> None:
    response = http[0].post(BASE + "/export/analysis/xlsx", headers=AUTH, json=BODY)
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        'attachment; filename="analisis-consumo-laboratorio.xlsx"'
    )
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        workbook = ET.fromstring(book.read("xl/workbook.xml"))  # noqa: S314
        assert [s.attrib["name"] for s in workbook.findall("s:sheets/s:sheet", NS)] == ["Análisis"]
        assert sheet_rows(book, 1) == [
            [BODY["titulo"]], [BODY["periodo"]], ["Datos Aplicativo", "ANNAR LAB"],
            ["CUPS", "Descripción", "Cantidad", "Código", "Descripción", "Cantidad"],
            ["001", "HEMOGRAMA", "12500.5", "10", "HEMATOLOGÍA", "22508"],
        ]
        styles = book.read("xl/styles.xml").decode()
        assert "FF123EBD" in styles
        sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314
        assert [m.attrib["ref"] for m in sheet.findall("s:mergeCells/s:mergeCell", NS)] == [
            "A1:G1", "A2:G2", "A4:C4", "E4:G4",
        ]
        assert not any(c.attrib["r"].startswith("D") for c in sheet.findall(".//s:c", NS))
        style_tree = ET.fromstring(styles)  # noqa: S314
        cell_styles = style_tree.findall("s:cellXfs/s:xf", NS)
        for ref, expected in (("C6", "12500.5"), ("G6", "22508")):
            quantity = sheet.find(f'.//s:c[@r="{ref}"]', NS)
            assert quantity is not None and "t" not in quantity.attrib
            assert quantity.findtext("s:v", namespaces=NS) == expected
            # General renders both integers and fractions without an optional decimal separator.
            assert cell_styles[int(quantity.attrib["s"])].attrib["numFmtId"] == "0"
    assert http[1].calls == http[2].calls == []


@pytest.mark.parametrize(("app_count", "annar_count"), [(0, 2), (2, 0), (1, 3)])
def test_analysis_unequal_tables_keep_independent_rows(http: Any, app_count: int,
                                                     annar_count: int) -> None:
    body = {"aplicativo": BODY["aplicativo"] * app_count,
            "annar": BODY["annar"] * annar_count}
    response = http[0].post(BASE + "/export/analysis/xlsx", headers=AUTH, json=body)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        sheet = ET.fromstring(book.read("xl/worksheets/sheet1.xml"))  # noqa: S314
        for column, count, value in (("C", app_count, "12500.5"), ("G", annar_count, "22508")):
            cells = [c for c in sheet.findall(".//s:c", NS)
                     if c.attrib["r"].startswith(column) and c.find("s:v", NS) is not None]
            assert [c.attrib["r"] for c in cells] == [f"{column}{i + 6}" for i in range(count)]
            assert all(c.findtext("s:v", namespaces=NS) == value and "t" not in c.attrib
                       for c in cells)
        assert not any(c.attrib["r"].startswith("D") for c in sheet.findall(".//s:c", NS))
    assert http[1].calls == http[2].calls == []


@pytest.mark.parametrize("body", [
    {}, {"aplicativo": [], "annar": [], "extra": 1},
    {"aplicativo": [{"cups": "x", "descripcion": "x", "cantidad": "NaN"}], "annar": []},
    {"aplicativo": [], "annar": [{"seccion": "x", "cantidad": 1}]},
    {"aplicativo": [], "annar": [], "titulo": "x" * 121},
    {"aplicativo": [], "annar": [], "periodo": "x" * 181},
    {"aplicativo": [{"cups": "x", "descripcion": "x", "cantidad": 1}] * 10001, "annar": []},
])
def test_analysis_validation_422_without_sql(http: Any, body: Any) -> None:
    response = http[0].post(BASE + "/export/analysis/xlsx", headers=AUTH, json=body)
    assert response.status_code == 422
    assert http[1].calls == http[2].calls == []


def test_analysis_accepts_legacy_section_key(http: Any) -> None:
    body = {**BODY, "annar": [{"seccion": "10", "descripcion": "HEMATOLOGÍA", "cantidad": 22508}]}
    response = http[0].post(BASE + "/export/analysis/xlsx", headers=AUTH, json=body)
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        assert sheet_rows(book, 1)[3] == [
            "CUPS", "Descripción", "Cantidad", "Código", "Descripción", "Cantidad",
        ]
        assert sheet_rows(book, 1)[4][3:] == ["10", "HEMATOLOGÍA", "22508"]
    assert http[1].calls == http[2].calls == []


def test_analysis_empty_tables_defaults(http: Any) -> None:
    response = http[0].post(BASE + "/export/analysis/xlsx", headers=AUTH,
                            json={"aplicativo": [], "annar": []})
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as book:
        rows = sheet_rows(book, 1)
        assert ["Datos Aplicativo", "ANNAR LAB"] in rows


def test_archive_build_runs_in_worker(http: Any, monkeypatch: Any) -> None:
    from nexora.statistics.infrastructure import lab_consumption_exports as module

    observed = []
    original = module.build_grouped

    def build(*args: Any) -> Any:
        observed.append(threading.current_thread().name)
        return original(*args)

    monkeypatch.setattr(module, "build_grouped", build)
    assert export(http[0]).status_code == 200
    assert observed and all("asyncio" in name for name in observed)


@pytest.mark.parametrize("kind", ["ser_laboral", "annar_lab"])
@pytest.mark.parametrize("expired", [False, True])
def test_invalid_tokens_410_before_sql(http: Any, kind: str, expired: bool) -> None:
    client, invoices, admissions, _, report = http
    suffix, content = (
        ("/ser-laboral", csv_bytes([raw(lna_prdcto="LABORATORIO")]))
        if kind == "ser_laboral" else ("/annar-lab", xls_bytes([annar_row()]))
    )
    token = upload(client, suffix, content).json()[kind + "_id"]
    if expired:
        getattr(report, kind).close()
    response = export(client, tablas="facturas", **{kind + "_id": token if expired else "unknown"})
    assert response.status_code == 410
    source = "Ser Laboral" if kind == "ser_laboral" else "ANNAR LAB"
    assert response.json() == {"detail": f"El archivo de {source} expiró; cárgalo de nuevo."}
    assert invoices.calls == admissions.calls == []
    if not expired:
        assert export(client, **{kind + "_id": token}).status_code == 200
        assert len(invoices.calls) == len(admissions.calls) == 1


def test_analysis_permission_without_sql(http: Any) -> None:
    client, invoices, admissions, auth, _ = http
    response = client.post(BASE + "/export/analysis/xlsx", json=BODY)
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    auth.permissions = frozenset({"statistics.administrative.general_consumption.view"})
    response = client.post(BASE + "/export/analysis/xlsx", headers=AUTH, json=BODY)
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert invoices.calls == admissions.calls == []
