"""Incapacity report HTTP contract with synthetic data and no database."""

import csv
import io
import re
import sqlite3
import zipfile
from collections.abc import AsyncIterator, Iterator, Mapping
from contextlib import closing
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from xml.etree import ElementTree

import pytest
from fastapi.testclient import TestClient
from tests.unit.statistics.test_detailed_invoices import FakeReader
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import create_app
from nexora.identity_access.presentation.http.v1.dependencies.auth import get_authenticate_use_case
from nexora.integration_management.application.ports import ReadOnlyQuery

BASE = "/api/v1/statistics/administrative/disability-management"
AUTH = {"Authorization": "Bearer test-token"}
PERMISSION = "statistics.administrative.disability_management.view"
EXPECTED = {
    "tipo_idntfccn": ("Tipo de identificación", "CC"),
    "nmro_idntfccn": ("Identificación", "001"),
    "prmr_nmbre": ("Primer nombre", "Ana"),
    "sgndo_nmbre": ("Segundo nombre", ""),
    "prmr_aplldo": ("Primer apellido", "Pérez"),
    "sgndo_aplldo": ("Segundo apellido", "Díaz"),
    "empresa": ("Empresa", "Empresa Uno"),
    "fcha_atncn": ("Fecha de solicitud", "02/01/2026"),
    "idntfccn_sde": ("Código IPS", "009"),
    "sede": ("Descripción IPS", "IPS CLINICA SALUD FLORIDA SEDE FLORIDA VALLE"),
    "fcha_incpcdd": ("Fecha de inicio", "01/01/2026"),
    "fcha_fin_incpcdd": ("Fecha de fin", "03/01/2026"),
    "ds_incpcdd": ("Duración", 3),
    "prrga": ("Prórroga", "I"),
    "Contingencia": ("Origen de la patología", "AT"),
    "tpo_idntfccn_prfsnl": ("Tipo de identificación médico", "CC"),
    "idntfccn_prfsnl": ("Número de identificación del médico", "002"),
    "rgstro_mdco": ("Número del registro médico", "003"),
    "nombre_medico": ("Nombre del médico", "Eva Gil"),
    "especialidad": ("Especialidad del médico", "Medicina general"),
    "fecha_probable_parto": ("Fecha probable de parto", ""),
    "fecha_probable_nacimiento": ("Fecha probable de nacimiento", ""),
    "cdgo_dgnstco": ("Código del diagnóstico", "A01"),
    "diagnostico": ("Descripción del diagnóstico", "Diagnóstico"),
    "lateralidad": ("Lateralidad", ""),
    "clse_atencn": ("Modalidad de atención", "Ambulatoria electiva"),
    "estado_incapacidad": ("Estado de la incapacidad", "Inicial"),
    "cnsctvo_incpcdds": ("Número de la solicitud", 12),
}
EXPORT = {"columnas": [f"{key}:text" for key in EXPECTED], "formato": "csv"}


Http = tuple[TestClient, FakeReader, FakeAuthentication]


@pytest.fixture
def http(monkeypatch: pytest.MonkeyPatch) -> Iterator[Http]:
    raw = {key: value for key, (_, value) in EXPECTED.items()}
    raw.update(
        fcha_atncn=datetime(2026, 1, 2, 23, 59),
        fcha_incpcdd=date(2026, 1, 1),
        fcha_fin_incpcdd=date(2026, 1, 3),
        sede="SEDE 3 CRA 19 # 10-52",
        prrga=False,
        Contingencia="Accidente de trabajo",
        nmbrs="Eva",
        apllds="Gil",
        clse_atencn="Ambulatoria quirúrgica",
        estdo=99,
        total_registros=17,
    )
    reader = FakeReader([raw])
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({PERMISSION})
    container = SimpleNamespace(sqlserver=reader, database=SimpleNamespace(session=None))
    monkeypatch.setattr("nexora.bootstrap.app.build_container", lambda settings: container)
    settings = SimpleNamespace(
        app_name="Test", is_production=False, api_prefix="/api/v1", allowed_origins=(),
    )
    app = create_app(settings)  # type: ignore[arg-type]
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    # No lifespan: never initialize access or connect to a database.
    yield TestClient(app), reader, authentication


def test_page_and_both_exports_share_values_and_filters(http: Http) -> None:
    client, reader, _ = http
    params = DATES | {"empresas": [3, 2, 3]}
    page = client.get(BASE, params=params | {"limit": 1, "offset": 2}, headers=AUTH)
    assert page.status_code == 200
    assert page.headers["X-Total-Count"] == "17"
    assert page.json() == [{key: value for key, (_, value) in EXPECTED.items()}]
    page_query, page_params = reader.calls[0]
    assert page_query.list_params == frozenset({"empresas"})
    assert "inc.fcha_incpcdd >= :fecha_inicial" in page_query.sql
    assert "inc.fcha_incpcdd < DATEADD(DAY, 1, :fecha_final)" in page_query.sql
    assert "ae.unco_emprsa IN :empresas" in page_query.sql
    assert "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY" in page_query.sql
    assert page_params == {
        "fecha_inicial": date(2026, 1, 1),
        "fecha_final": date(2026, 1, 31),
        "filtrar_empresas": 1,
        "empresas": [3, 2],
        "search": "",
        "limit": 1,
        "offset": 2,
    }
    reader.rows *= 2
    response = client.get(BASE + "/export", params=params | EXPORT, headers=AUTH)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    rows = list(csv.reader(io.StringIO(response.content.decode("utf-8-sig")), delimiter=";"))
    assert rows == [[label for label, _ in EXPECTED.values()]] + [
        [str(value) for _, value in EXPECTED.values()]
    ] * 2
    export_query, export_params = reader.calls[1]
    assert "OFFSET" not in export_query.sql
    assert page_params is not None
    assert export_params == {k: v for k, v in page_params.items() if k not in {"limit", "offset"}}
    workbook = client.get(
        BASE + "/export", params=params | EXPORT | {"formato": "xlsx"}, headers=AUTH,
    )
    assert workbook.status_code == 200
    with zipfile.ZipFile(io.BytesIO(workbook.content)) as book:
        sheet = book.read("xl/worksheets/sheet1.xml").decode()
    assert all(f"<t>{label}</t>" in sheet for label, _ in EXPECTED.values())
    assert 'r="B2" t="inlineStr"><is><t xml:space="preserve">001</t>' in sheet
    assert 'r="H2" t="inlineStr"><is><t xml:space="preserve">02/01/2026</t>' in sheet
    assert 'r="M2"><v>3</v>' in sheet
    assert 'r="A3"' in sheet


class SearchReader:
    """Execute the actual query against synthetic data with a small SQL Server syntax shim."""

    def _execute(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None,
    ) -> list[dict[str, Any]]:
        assert params is not None
        sql = query.sql.replace("SET NOCOUNT ON;", "").replace(" WITH (NOLOCK)", "")
        sql = sql.replace("ISNULL(", "IFNULL(").replace("DATEADD(DAY,", "DATEADD('DAY',")
        sql = sql.replace("CAST(inc.fcha_incpcdd AS DATE)", "inc.fcha_incpcdd")
        sql = sql.replace(
            "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY", "LIMIT :limit OFFSET :offset",
        )
        sql = re.sub(r"\bN'", "'", sql).replace("NVARCHAR(MAX)", "TEXT")
        bind = {
            key: value.isoformat() if isinstance(value, date) else value
            for key, value in params.items()
        }
        companies = []
        for index, company in enumerate(bind.pop("empresas")):
            key = f"company_{index}"
            companies.append(f":{key}")
            bind[key] = company
        sql = sql.replace("IN :empresas", "IN (" + ", ".join(companies) + ")")
        with closing(sqlite3.connect(":memory:")) as db:
            db.row_factory = sqlite3.Row
            db.create_collation(
                "Latin1_General_100_CI_AS",
                lambda a, b: (a.lower() > b.lower()) - (a.lower() < b.lower()),
            )
            db.create_function(
                "CHARINDEX", 2, lambda needle, value: value.lower().find(needle.lower()) + 1,
            )
            db.create_function("CONCAT", 3, lambda a, b, c: "".join(x or "" for x in (a, b, c)))
            db.create_function(
                "DATEADD", 3,
                lambda _, days, value: (date.fromisoformat(value) + timedelta(days=days)).isoformat(),
            )
            db.executescript("""
                CREATE TABLE tbIncapacidad (unco_hstra, cnsctvo_incpcdds, fcha_incpcdd,
                    ds_incpcdd, prrga, unco_clse_atncn, unco_tpo_cntngnca);
                CREATE TABLE tbHistoriasClinicas (unco, fcha_atncn, Unco_sde_pnto_atncn,
                    Unco_afldo_emprsa, unco_dgnstco, unco_prfsnls_sld_espcldd);
                CREATE TABLE tbSedesPuntosAtencion (unco, unco_sde);
                CREATE TABLE tbSedes (unco, dscrpcn, idntfccn_sde);
                CREATE TABLE tbAfiliadosEmpresas (unco, unco_afldo, unco_emprsa);
                CREATE TABLE tbEmpresas (unco, dscrpcn_crta);
                CREATE TABLE tbAfiliados (unco, nmro_idntfccn, prmr_nmbre, sgndo_nmbre,
                    prmr_aplldo, sgndo_aplldo, unco_tpo_idntfccn);
                CREATE TABLE tbTiposDocumentos (unco, cdgo);
                CREATE TABLE tbClaseAtencion (unco, dscrpcn);
                CREATE TABLE tbDiagnosticos (unco, cdgo_dgnstco, dscrpcn);
                CREATE TABLE tbProfesionalesSaludEspec (unco, unco_prfsnls_sld, unco_espcldd);
                CREATE TABLE tbProfesionalesSalud (unco, nmbrs, apllds, nmro_idntfccn,
                    rgstro_mdco, unco_tpo_idntfccn);
                CREATE TABLE tbEspecialidades (unco, dscrpcn);
                CREATE TABLE tbTipoContigencia (unco, dscrpcn);
                INSERT INTO tbIncapacidad VALUES
                    (1, 1, '2026-01-01', 1, 0, NULL, NULL),
                    (2, 2, '2026-01-31', 1, 0, NULL, NULL),
                    (3, 3, '2026-01-31', 1, 1, NULL, NULL),
                    (4, 4, '2026-01-31', 1, 0, NULL, NULL),
                    (5, 5, '2026-02-01', 1, 0, NULL, NULL);
                INSERT INTO tbHistoriasClinicas VALUES
                    (1, '2026-01-01', NULL, 1, NULL, NULL),
                    (2, '2026-01-02', NULL, 2, NULL, NULL),
                    (3, '2026-01-03', 1, 1, 1, 1),
                    (4, '2026-01-04', NULL, 4, NULL, NULL),
                    (5, '2026-01-05', NULL, 2, NULL, NULL);
                INSERT INTO tbAfiliadosEmpresas VALUES (1, 1, 3), (2, 2, 3), (4, 2, 9);
                INSERT INTO tbEmpresas VALUES (3, 'Empresa Uno'), (9, 'Empresa Nueve');
                INSERT INTO tbAfiliados VALUES
                    (1, '001', 'Valle Norte', '', '', '', NULL),
                    (2, '002', 'Valle%', '', '', '', NULL);
                INSERT INTO tbSedesPuntosAtencion VALUES (1, 1);
                INSERT INTO tbSedes VALUES (1, 'SEDE 3 CRA 19 # 10-52', '009');
                INSERT INTO tbDiagnosticos VALUES (1, 'A01', 'VALLE%');
                INSERT INTO tbProfesionalesSaludEspec VALUES (1, 1, NULL);
                INSERT INTO tbProfesionalesSalud VALUES (1, 'Eva', 'Gil', '002', '003', NULL);
            """)
            return [dict(row) for row in db.execute(sql, bind)]

    async def fetch_all(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        return self._execute(query, params)

    async def stream(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None = None, *, chunk_size: int = 2,
    ) -> AsyncIterator[list[dict[str, Any]]]:
        rows = self._execute(query, params)
        for start in range(0, len(rows), chunk_size):
            yield rows[start : start + chunk_size]


def test_search_filters_the_full_dataset_before_pagination_and_exports(
    http: Http, monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, reader, _ = http
    search_reader = SearchReader()
    monkeypatch.setattr(reader, "fetch_all", search_reader.fetch_all)
    monkeypatch.setattr(reader, "stream", search_reader.stream)
    params = DATES | {"empresas": [3], "search": "  VaLlE%  ", "limit": 1}
    for offset, total, ids in [(0, "2", [2]), (1, "2", [3]), (2, "2", [])]:
        result = client.get(BASE, params=params | {"offset": offset}, headers=AUTH)
        assert result.status_code == 200
        assert result.headers["X-Total-Count"] == total
        assert [row["cnsctvo_incpcdds"] for row in result.json()] == ids

    for term, ids in [
        ("florida valle", [3]), ("eva gil", [3]), ("inicial", [1, 2, 3]),
        ("cra 19", []), ("missing", []), ("  ", [1, 2, 3]),
    ]:
        result = client.get(BASE, params=params | {"search": term, "limit": 10}, headers=AUTH)
        assert result.status_code == 200
        assert result.headers["X-Total-Count"] == str(len(ids))
        assert [row["cnsctvo_incpcdds"] for row in result.json()] == ids

    params |= {"columnas": ["cnsctvo_incpcdds:text"], "offset": 1}
    response = client.get(BASE + "/export", params=params | {"formato": "csv"}, headers=AUTH)
    assert response.status_code == 200
    assert list(csv.reader(io.StringIO(response.content.decode("utf-8-sig")), delimiter=";")) == [
        ["Número de la solicitud"], ["2"], ["3"],
    ]
    workbook = client.get(BASE + "/export", params=params | {"formato": "xlsx"}, headers=AUTH)
    assert workbook.status_code == 200
    with zipfile.ZipFile(io.BytesIO(workbook.content)) as book:
        sheet = ElementTree.fromstring(book.read("xl/worksheets/sheet1.xml"))
    assert [cell.attrib["r"] for cell in sheet.findall(".//{*}c")] == ["A1", "A2", "A3"]
    assert [value.text for value in sheet.findall(".//{*}c/{*}is/{*}t")] == [
        "Número de la solicitud", "2", "3",
    ]


@pytest.mark.parametrize(
    ("sede", "origen", "modalidad", "location", "code", "mode"),
    [
        (
            "FLORIDA-CRA 19 # 10-32", "Enfermedad profesional", "Hospitalaria electiva",
            "FLORIDA VALLE", "EP", "Ambulatoria electiva",
        ),
        (
            "CORINTO-CL 7 # 7 -79", "Enfermedad general", "Hospitalaria urgencias",
            "CORINTO CAUCA", "EG", "Ambulatoria urgencias",
        ),
        (
            "MIRANDA-CL 10 # 7-31", "Accidente de tránsito", "Ambulatoria urgencias",
            "MIRANDA CAUCA", "ES", "Ambulatoria urgencias",
        ),
    ],
)
def test_remaining_equivalences(
    http: Http, sede: str, origen: str, modalidad: str, location: str, code: str, mode: str,
) -> None:
    client, reader, _ = http
    reader.rows[0].update(sede=sede, Contingencia=origen, clse_atencn=modalidad, prrga=True)
    response = client.get(BASE, params=DATES, headers=AUTH)
    assert response.status_code == 200
    expected = {key: value for key, (_, value) in EXPECTED.items()}
    expected.update(
        sede=f"IPS CLINICA SALUD FLORIDA SEDE {location}",
        Contingencia=code, clse_atencn=mode, prrga="P",
    )
    assert response.json() == [expected]
    params = reader.calls[0][1]
    assert params is not None and params["filtrar_empresas"] == 0


@pytest.mark.parametrize("suffix", ["", "/export", "/filters/companies"])
def test_permission_blocks_data_access(http: Http, suffix: str) -> None:
    client, reader, authentication = http
    unauthenticated = client.get(BASE + suffix, params=DATES | EXPORT)
    assert unauthenticated.status_code == 401
    assert unauthenticated.json() == {
        "detail": "Falta el encabezado Authorization: Bearer",
    }
    authentication.permissions = frozenset()
    response = client.get(BASE + suffix, params=DATES | EXPORT, headers=AUTH)
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert reader.calls == []


def test_invalid_filters_and_unknown_columns_do_not_query(http: Http) -> None:
    client, reader, _ = http
    invalid = client.get(BASE, params=DATES | {"fecha_final": "2025-12-31"}, headers=AUTH)
    assert invalid.status_code == 422
    assert invalid.json() == {"detail": "La fecha inicial no puede ser posterior a la final."}
    unknown = client.get(
        BASE + "/export", params=DATES | EXPORT | {"columnas": ["missing:text"]}, headers=AUTH,
    )
    assert unknown.status_code == 422
    assert unknown.json() == {"detail": "Columnas desconocidas: missing."}
    assert reader.calls == []


def test_txt_export_uses_only_selected_columns_in_order_without_headers(http: Http) -> None:
    client, reader, _ = http
    reader.rows = [{"empresa": "Empresa Uno", "nmro_idntfccn": "001", "fcha_atncn": date(2026, 1, 2)}]
    response = client.get(
        BASE + "/export",
        params=DATES | {"formato": "txt", "columnas": ["fcha_atncn:date", "nmro_idntfccn:text"]},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["content-disposition"].endswith(".txt\"")
    assert response.content.decode("utf-8") == "02/01/2026|001\r\n"


def test_txt_export_escapes_embedded_pipe_and_newlines_without_extra_records(http: Http) -> None:
    client, reader, _ = http
    reader.rows = [{"diagnostico": "Dolor | agudo\r\nControl", "nmro_idntfccn": "001"}]
    response = client.get(
        BASE + "/export",
        params=DATES | {"formato": "txt", "columnas": ["diagnostico:text", "nmro_idntfccn:text"]},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.content.decode("utf-8") == "Dolor \\u007C agudo\\r\\nControl|001\r\n"


def test_company_catalog(http: Http) -> None:
    client, reader, _ = http
    reader.rows = [{"id": 3, "nombre": " Empresa "}]
    response = client.get(BASE + "/filters/companies", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == [{"id": 3, "nombre": "Empresa"}]
    assert "FROM tbEmpresas" in reader.calls[0][0].sql
