"""Regresiones independientes de ANNAR LAB: archivos inválidos y exportación agrupada."""

import io
import zipfile

import pytest
from fastapi.testclient import TestClient
from tests.unit.statistics.test_lab_consumption import (
    ANNAR_HEADERS,
    AUTH,
    BASE,
    XLS_MIME,
    XLSX_MIME,
    annar_row,
    export,
    http,  # noqa: F401
    upload,
    xls_bytes,
    xlsx_bytes,
)


@pytest.mark.parametrize(("writer", "mime"), [(xls_bytes, XLS_MIME), (xlsx_bytes, XLSX_MIME)])
@pytest.mark.parametrize("duplicate", ANNAR_HEADERS)
def test_duplicate_required_headers_clear_error_and_preserve_token(
    http,  # noqa: F811
    writer,
    mime,
    duplicate,
):
    client, invoices, admissions, _, _ = http
    valid = upload(client, "/annar-lab", writer([annar_row()]), mime)
    assert valid.status_code == 200
    token = valid.json()["annar_lab_id"]
    response = upload(client, "/annar-lab", writer([], ANNAR_HEADERS + (duplicate,)), mime)
    assert response.status_code == 422
    assert response.json() == {"detail": "No se permiten cabeceras requeridas duplicadas."}
    assert invoices.calls == admissions.calls == []
    saved = export(client, annar_lab_id=token)
    assert saved.status_code == 200
    with zipfile.ZipFile(io.BytesIO(saved.content)) as archive:
        assert archive.read("ANNAR_LAB.csv").decode("utf-8-sig").splitlines() == [
            "Código Centro de Costo;Nombre Centro de Costos;Nombre del Examen;Cantidad;Empresa;"
            "Punto Atención",
            "10;Sección diez;Examen;1;Empresa;Punto",
        ]


def malformed_xlsx():
    content = io.BytesIO()
    with (
        zipfile.ZipFile(io.BytesIO(xlsx_bytes([annar_row()]))) as source,
        zipfile.ZipFile(content, "w") as target,
    ):
        for name in source.namelist():
            target.writestr(name, "<broken" if name == "xl/workbook.xml" else source.read(name))
    return content.getvalue()


def two_sheet_xlsx():
    from openpyxl import Workbook

    book = Workbook()
    book.create_sheet("Second")
    content = io.BytesIO()
    book.save(content)
    book.close()
    return content.getvalue()


@pytest.mark.parametrize(("content", "mime", "message"), [
    (xlsx_bytes([annar_row()]), XLS_MIME, "El archivo XLS de ANNAR LAB no es válido."),
    (xls_bytes([annar_row()]), XLSX_MIME, "El archivo XLSX de ANNAR LAB no es válido."),
    (b"", XLSX_MIME, "El archivo XLSX de ANNAR LAB no es válido."),
    (b"not a workbook", XLSX_MIME, "El archivo XLSX de ANNAR LAB no es válido."),
    (b"PK\x03\x04truncated", XLSX_MIME, "El archivo XLSX de ANNAR LAB no es válido."),
    (malformed_xlsx(), XLSX_MIME, "El archivo XLSX de ANNAR LAB no es válido."),
    (two_sheet_xlsx(), XLSX_MIME, "El archivo XLSX de ANNAR LAB debe tener una sola hoja."),
    (xls_bytes([annar_row()]), "application/json",
     "Tipo de archivo no permitido; usa XLS o XLSX de ANNAR LAB."),
])
def test_replacement_failure_at_capacity_preserves_all_public_tokens(
    http,  # noqa: F811
    content,
    mime,
    message,
):
    client, invoices, admissions, _, _ = http
    tokens = []
    for index in range(8):
        writer, valid_mime = (xls_bytes, XLS_MIME) if index % 2 == 0 else (xlsx_bytes, XLSX_MIME)
        loaded = upload(client, "/annar-lab", writer([annar_row(str(index))]), valid_mime)
        assert loaded.status_code == 200
        tokens.append(loaded.json()["annar_lab_id"])
    assert len(set(tokens)) == 8
    response = upload(client, "/annar-lab", content, mime)
    assert response.status_code == 422
    assert response.json() == {"detail": message}
    assert response.headers["content-type"] == "application/json"
    assert invoices.calls == admissions.calls == []
    for index, token in enumerate(tokens):
        saved = export(client, annar_lab_id=token)
        assert saved.status_code == 200
        with zipfile.ZipFile(io.BytesIO(saved.content)) as archive:
            assert archive.read("ANNAR_LAB.csv").decode("utf-8-sig").splitlines()[1:] == [
                f"{index};Sección diez;Examen;1;Empresa;Punto",
            ]
    assert len(invoices.calls) == len(admissions.calls) == 8


def test_truncated_zip_sent_as_xls_returns_422(http):  # noqa: F811
    client, _, _, _, _ = http
    with TestClient(client.app, raise_server_exceptions=False) as transport:
        response = transport.post(
            BASE + "/annar-lab", headers=AUTH, content=b"PK\x03\x04truncated"
        )
    assert response.status_code == 422
    assert response.json() == {"detail": "El archivo XLS de ANNAR LAB no es válido."}


def test_annar_import_exports_in_grouped_download(http):  # noqa: F811
    client, invoices, admissions, _, _ = http
    response = upload(
        client,
        "/annar-lab",
        xls_bytes([annar_row("2"), annar_row("2"), annar_row("10"), [""] * 14]),
    )
    assert response.status_code == 200
    body = response.json()
    assert [(g["seccion"], g["cantidad"]) for g in body["analisis_annar"]] == [
        ("2", 2),
        ("10", 1),
    ]
    response = export(client, annar_lab_id=body["annar_lab_id"])
    assert response.status_code == 200
    assert len(invoices.calls) == len(admissions.calls) == 1
