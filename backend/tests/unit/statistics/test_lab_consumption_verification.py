"""Regresiones independientes de ANNAR LAB: archivos inválidos y exportación agrupada."""

from fastapi.testclient import TestClient
from tests.unit.statistics.test_lab_consumption import (
    AUTH,
    BASE,
    annar_row,
    export,
    http,  # noqa: F401
    upload,
    xls_bytes,
)


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
