"""Notificación SIVIGILA: regla de semana, encabezado por sede y exportaciones PDF / Excel."""

import io
import re
import zipfile
import zlib
from dataclasses import asdict
from datetime import date
from typing import Any

import pytest
from tests.unit.statistics.test_sivigila import AUTH, BASE, http, record  # noqa: F401

from nexora.statistics.application.sivigila import process_rows
from nexora.statistics.domain.sivigila import (
    epidemiological_period,
    epidemiological_week,
    notification_location,
    notification_title,
)
from nexora.statistics.infrastructure.sivigila_pdf import build_analysis_pdf

SEDE = "CORINTO-CL 7 # 7 -79"
RECT = re.compile(r"([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re")


def test_week_rule_matches_notificaciones_bas() -> None:
    # Semana 1 = primer domingo del año; antes de él, última semana del año anterior.
    assert epidemiological_week(date(2026, 1, 4)) == 1
    assert epidemiological_week(date(2026, 1, 3)) == 52  # el 2025 empezó su semana 1 el 5-ene
    assert epidemiological_week(date(2025, 1, 5)) == 1
    assert epidemiological_period(date(2026, 10, 6)) == (40, 10, 2026)
    assert epidemiological_period(date(2026, 1, 31)) == (4, 1, 2026)
    assert epidemiological_period(date(2026, 2, 1)) == (5, 2, 2026)


def test_subtitle_uses_first_attention_date_with_zero_padding() -> None:
    rows = [record(fcha_atncn="2026-02-01"), record(fcha_atncn="2026-10-06")]
    assert process_rows(rows, fallback_date=date(2026, 12, 31)).subtitulo == (
        "SEMANA 05 PERIODO 02 2026"
    )
    assert process_rows([], fallback_date=date(2026, 10, 6)).subtitulo == (
        "SEMANA 40 PERIODO 10 2026"
    )


@pytest.mark.parametrize(
    ("sites", "location", "title"),
    [
        (["FLORIDA-CRA 19 # 10-32"], "FLORIDA", "NOTIFICACIÓN FLORIDA VALLE DEL CAUCA"),
        (["SEDE 3 CRA 19 # 10-52"], "FLORIDA", "NOTIFICACIÓN FLORIDA VALLE DEL CAUCA"),
        (["sede 3  cra 19 # 10-52", "FLORIDA-CRA 19 # 10-32"], "FLORIDA", None),
        ([SEDE], "CORINTO", "NOTIFICACIÓN CORINTO CAUCA"),
        (["MIRANDA-CL 10 # 7-31"], "MIRANDA", "NOTIFICACIÓN MIRANDA CAUCA"),
        ([SEDE, "MIRANDA-CL 10 # 7-31"], "GENERAL", "NOTIFICACIÓN GENERAL"),
        (["FLORIDA-CRA 19 # 10-32", "OTRA SEDE"], "GENERAL", None),
        (["FLORIDA OTRA 1", "FLORIDA OTRA 2"], "GENERAL", None),  # sin ciudad arbitraria
        (["OTRA SEDE"], "OTRA SEDE", "NOTIFICACIÓN OTRA SEDE"),
        ([], "GENERAL", "NOTIFICACIÓN GENERAL"),
    ],
)
def test_notification_location_rules(sites: list[str], location: str, title: str | None) -> None:
    assert notification_location(sites) == location
    if title:
        assert notification_title(location) == title


def payload() -> dict[str, Any]:
    rows = [
        record(cdgo_dgnstco="J00X", cdgo_dgnstco_rl_1="A09X", gener="M", sede=SEDE),
        record(cdgo_dgnstco="B019", sede=SEDE),
        record(cdgo_dgnstco="Z000", sede=SEDE),
    ]
    return asdict(process_rows(rows, fallback_date=date(2026, 1, 1), selected_sites=[SEDE]))


def content_stream(pdf: bytes) -> str:
    found = re.search(rb"stream\n(.*?)\nendstream", pdf, re.S)
    assert found
    return zlib.decompress(found.group(1)).decode("latin-1")


def test_pdf_is_one_landscape_page_centered_and_analysis_only(http: Any) -> None:  # noqa: F811
    client, reader, _ = http
    response = client.post(BASE + "/export/pdf", json=payload(), headers=AUTH)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].endswith('NOTIFICACION_CORINTO_CAUCA.pdf"')
    assert reader.calls == []  # reutiliza los datos recibidos; no consulta SQL Server
    pdf = response.content
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
    assert pdf.count(b"/Type /Page ") == 1 and b"/MediaBox [0 0 792 612]" in pdf
    content = content_stream(pdf)
    boxes = [tuple(map(float, m)) for m in RECT.findall(content)]
    xs = [v for x, _, w, _ in boxes for v in (x, x + w)]
    ys = [v for _, y, _, h in boxes for v in (y, y + h)]
    assert min(xs) >= 20 and max(xs) <= 772 and min(ys) >= 20 and max(ys) <= 592
    assert abs((min(xs) + max(xs)) / 2 - 396) < 1  # la tabla más ancha queda centrada
    for text in ("SEMANA 40 PERIODO 10 2026", "Total general", "(Total)"):
        assert text in content
    assert "General" not in content.replace("Total general", "")  # sin otras pestañas


def test_pdf_content_block_is_vertically_centered() -> None:
    result = process_rows([record(cdgo_dgnstco="J00X")], fallback_date=date(2026, 1, 1))
    content = content_stream(build_analysis_pdf(result))
    bottoms = [float(y) for _, y, _, _ in RECT.findall(content)]
    tops = [float(y) + float(h) for _, y, _, h in RECT.findall(content)]
    # Título (35) + separación (16) sobre la primera tabla: el bloque completo queda centrado.
    assert abs(min(bottoms) - (612 - max(tops) - 51)) < 2
    assert min(bottoms) > 20 and max(tops) < 592


def test_workbook_has_seven_sheets_with_processed_data(http: Any) -> None:  # noqa: F811
    client, reader, _ = http
    response = client.post(BASE + "/export/xlsx", json=payload(), headers=AUTH)
    assert response.status_code == 200, response.text
    assert reader.calls == []
    book = zipfile.ZipFile(io.BytesIO(response.content))
    names = re.findall(r'<sheet name="([^"]+)"', book.read("xl/workbook.xml").decode())
    assert names == [
        "Análisis",
        "General",
        "Evento IRA",
        "Evento EDA",
        "Dengue",
        "Varicela",
        "Exposición Rábica",
    ]
    analysis = book.read("xl/worksheets/sheet1.xml").decode()
    assert "NOTIFICACIÓN CORINTO CAUCA" in analysis and "SEMANA 40 PERIODO 10 2026" in analysis
    assert "Total Consultas externas y urgencias (IRA)" in analysis and "Total general" in analysis
    sheets = {i: book.read(f"xl/worksheets/sheet{i}.xml").decode() for i in range(2, 8)}
    assert sheets[2].count("<row ") == 4  # encabezado + 3 registros
    assert "<v>46301</v>" in sheets[2]  # fecha real (2026-10-06), no texto
    assert "Grupo IRA" in sheets[3] and "Grupo EDA" in sheets[4]
    assert sheets[5].count("<row ") == 1  # Dengue sin casos
    assert sheets[6].count("<row ") == 2  # Varicela: B019
    assert sheets[7].count("<row ") == 1


def test_export_rejects_inconsistent_payload(http: Any) -> None:  # noqa: F811
    client, _, _ = http
    broken = payload()
    del broken["pestanas"]["rabia"]
    assert client.post(BASE + "/export/pdf", json=broken, headers=AUTH).status_code == 422
    broken = payload()
    broken["ira"]["filas"][0]["valores"].pop()
    assert client.post(BASE + "/export/xlsx", json=broken, headers=AUTH).status_code == 422
