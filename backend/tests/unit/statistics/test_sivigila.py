"""Notificación SIVIGILA: reglas, pipeline y HTTP con registros sintéticos y lector falso."""

import io
import zipfile
from collections.abc import Iterator
from datetime import date
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.unit.statistics.test_detailed_invoices import FakeReader
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_authenticate_use_case,
    get_container,
)
from nexora.statistics.application.sivigila import process_rows
from nexora.statistics.domain.sivigila import (
    DENGUE_CODES,
    EDA_CODES,
    IRA_CODES,
    RABIA_CODES,
    VARICELA_CODES,
    Age,
    eda_group,
    epidemiological_period,
    events_for_codes,
    full_name,
    ira_group,
    normalize_sex,
    resolve_age,
)
from nexora.statistics.presentation.http.v1.router import sivigila_router

BASE = "/statistics/administrative/sivigila"
PERMISSION = "statistics.administrative.sivigila.view"


def record(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "sede": "CORINTO CAUCA", "linea_servicio": "Consulta", "tipo_documento": "CC",
        "nmro_idntfccn": "00123", "empresa": "EPS X", "gener": "F",
        "prmr_nmbre": "Ana", "sgndo_nmbre": "", "prmr_aplldo": " Pérez ", "sgndo_aplldo": None,
        "fcha_ncmnto": "1990-05-10", "fcha_atncn": "2026-10-06", "edad": 36, "tipo_edad": "Años",
        "cdgo_dgnstco": "Z000", "diagnostico": "", "cdgo_dgnstco_rl_1": "", "diagnostico_rl_1": "",
        "cdgo_dgnstco_rl_2": "", "diagnostico_rl_2": "", "profesional_salud": "Dr. A",
        "especialidad": "General",
    }  # fmt: skip
    return base | overrides


def test_exact_code_lists_from_bas_files() -> None:
    assert (len(IRA_CODES), len(EDA_CODES), len(DENGUE_CODES)) == (71, 41, 10)
    assert (len(VARICELA_CODES), len(RABIA_CODES)) == (5, 66)
    assert {"J00X", "J13X", "J22X"} <= IRA_CODES and "J02" not in IRA_CODES
    assert "A09X" in EDA_CODES and "A09" not in EDA_CODES
    assert events_for_codes([" j00x ", "A90X", None, "", "W509"]) == {"ira", "dengue", "rabia"}
    assert events_for_codes(["J001", "B02"]) == frozenset()  # sin búsqueda por prefijo


@pytest.mark.parametrize(
    ("age", "kind", "ira", "eda"),
    [
        (0, "Años", "Menor de 1 Año", "Menor de 1 Año"),
        (400, "Meses", "Menor de 1 Año", "Menor de 1 Año"),
        (30, "Días", "Menor de 1 Año", "Menor de 1 Año"),
        (1, "Años", "1 Año", "De 1 a 4 Años"),
        (4, "Años", "De 2 a 4 Años", "De 1 a 4 Años"),
        (19, "Años", "De 5 a 19 Años", "De 15 a 19 Años"),
        (59, "Años", "De 40 a 59 Años", "De 55 a 59 Años"),
        (60, "Años", "Mayor de 60 Años", "De 60 a 64 Años"),
        (80, "Años", "Mayor de 60 Años", "Mayor de 80 Años"),
        (None, "Años", "", ""),
        (5, "", "", ""),
    ],
)
def test_age_groups(age: int | None, kind: str, ira: str, eda: str) -> None:
    assert (ira_group(age, kind), eda_group(age, kind)) == (ira, eda)


def test_age_validation_prefers_dates_and_falls_back_to_query() -> None:
    assert resolve_age(99, "Años", "2026-01-10", "2026-05-09") == Age(3, "Meses")
    assert resolve_age(36, "Años", "1990-05-10", "2026-10-06") == Age(36, "Años")
    assert resolve_age(5, "Años", "", "2026-10-06") == Age(5, "Años")
    assert resolve_age("x", "?", "", "") is None


def test_names_sex_and_epidemiological_week() -> None:
    assert full_name("Ana", "", "  Pérez  ", None) == "Ana Pérez"
    assert [normalize_sex(v) for v in ("F", " m ", "Masculino", "", None, "X")] == [
        "F",
        "M",
        "M",
        "",
        "",
        "",
    ]
    assert epidemiological_period(date(2026, 10, 6)) == (40, 10, 2026)
    assert epidemiological_period(date(2026, 1, 4)) == (1, 1, 2026)


def test_record_appears_once_per_event_and_general_has_all() -> None:
    rows = [
        record(cdgo_dgnstco="J00X", cdgo_dgnstco_rl_1="A90X", cdgo_dgnstco_rl_2="A09X"),
        record(cdgo_dgnstco="J00X", cdgo_dgnstco_rl_1="J010", gener="X"),
        record(cdgo_dgnstco="Z000"),
    ]
    result = process_rows(rows, reference_date=date(2026, 10, 6))
    tabs = result.pestanas
    assert [len(tabs[t]) for t in ("general", "ira", "eda", "dengue", "varicela", "rabia")] == [
        3,
        2,
        1,
        1,
        0,
        0,
    ]
    assert (
        tabs["ira"][0]["grupo"] == "De 20 a 39 Años"
        and tabs["eda"][0]["grupo"] == "De 35 a 39 Años"
    )
    assert tabs["dengue"][0]["grupo"] == "" and tabs["general"][0]["grupo"] == ""
    assert tabs["general"][0]["nombre_completo"] == "Ana Pérez"
    assert tabs["general"][0]["no_documento"] == "00123"
    assert tabs["general"][0]["fecha_nacimiento"] == "1990-05-10"


def test_analysis_is_computed_and_unknown_sex_is_not_assigned() -> None:
    rows = [
        record(cdgo_dgnstco="J00X"),
        record(cdgo_dgnstco="J00X", edad=2, tipo_edad="Meses", fcha_ncmnto="2026-08-01"),
        record(cdgo_dgnstco="A09X", gener="M"),
        record(cdgo_dgnstco="A09X", gener="?"),
        record(fcha_ncmnto="", fcha_atncn="", edad="", tipo_edad=""),
    ]
    result = process_rows(rows, reference_date=date(2026, 10, 6), site_name="Corinto Cauca")
    assert result.titulo == "NOTIFICACIÓN CORINTO CAUCA"
    assert result.subtitulo == "SEMANA 40 PERIODO 10 2026"
    ira_event, ira_all = result.ira.filas
    assert result.ira.columnas[0] == "< 1 Año" and result.ira.columnas[-1] == ">= 60 Años"
    assert ira_event.valores == [1, 0, 0, 0, 1, 0, 0] and ira_event.total == 2
    assert ira_all.total == 4  # el registro sin edad no se cuenta
    female, male, total = result.eda.filas
    assert result.eda.columnas[-1] == ">= 80 Años" and len(result.eda.columnas) == 18
    assert (female.total, male.total, total.total) == (0, 1, 1)
    assert male.valores[8] == 1  # 35 a 39 años
    assert any("sexo no reconocido" in w for w in result.advertencias)


def test_defective_record_does_not_break_processing() -> None:
    result = process_rows([record(), None, record()], reference_date=date(2026, 10, 6))  # type: ignore[list-item]
    assert result.total_registros == 2
    assert any("omitidos" in w for w in result.advertencias)


@pytest.fixture
def http() -> Iterator[tuple[TestClient, FakeReader, FakeAuthentication]]:
    reader = FakeReader([record(cdgo_dgnstco="J00X"), record(), record(cdgo_dgnstco="B019")])
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({PERMISSION})
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(sivigila_router)
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        yield client, reader, authentication


def get(client: TestClient, path: str = "", **extra: Any) -> Any:
    return client.get(
        BASE + path, params={**DATES, **extra}, headers={"Authorization": "Bearer test-token"}
    )


def test_requires_permission_without_touching_source(http: Any) -> None:
    client, reader, authentication = http
    authentication.permissions = frozenset()
    assert get(client).status_code == 403
    assert get(client, "/export", formato="csv", evento="ira").status_code == 403
    assert reader.calls == []


def test_consult_runs_one_query_with_dates_and_filters(http: Any) -> None:
    client, reader, _ = http
    response = get(client, sedes=[3], empresas=[4])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["subtitulo"] == "SEMANA 4 PERIODO 1 2026"
    assert body["total_registros"] == 3
    assert [len(body["pestanas"][t]) for t in ("general", "ira", "varicela")] == [3, 1, 1]
    stream_calls = [c for c in reader.calls if c[1] and "fecha_inicial" in c[1]]
    assert len(stream_calls) == 1  # una sola consulta para todas las pestañas
    params = stream_calls[0][1]
    assert params["fecha_inicial"] == date(2026, 1, 1) and params["fecha_final"] == date(
        2026, 1, 31
    )
    assert params["sedes"] == [3] and params["filtrar_lineas"] == 0


def test_reversed_dates_are_rejected(http: Any) -> None:
    client, _, _ = http
    assert get(client, fecha_inicial="2026-02-01").status_code == 422


def test_export_xlsx_uses_labels_and_group_header(http: Any) -> None:
    client, _, _ = http
    csv = get(client, "/export", formato="csv", evento="ira")
    assert csv.status_code == 200
    first = csv.content.decode("utf-8-sig").splitlines()
    assert first[0].split(";")[:4] == ["Sede", "Servicio", "Tipo Documento", "No. Documento"]
    assert "Grupo IRA" in first[0] and len(first) == 2
    xlsx = get(client, "/export", formato="xlsx", evento="general")
    assert zipfile.is_zipfile(io.BytesIO(xlsx.content))
