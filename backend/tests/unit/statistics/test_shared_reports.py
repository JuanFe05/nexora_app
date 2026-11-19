"""Shared report contracts, using synthetic records and no external database."""

import io
import re
import zipfile
from datetime import date
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from tests.unit.statistics.test_detailed_invoices import FakeReader
from tests.unit.statistics.test_router import DATES, FakeAuthentication

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.domain.value_objects.access_catalog import PERMISSION_CATALOG
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_authenticate_use_case,
    get_container,
)
from nexora.statistics.domain.filters import DetailedInvoicesFilter, InvalidReportFilter

REPORTS = ["detailed_invoices", "vital_signs", "admissions"]
HEADER = [
    "sede",
    "linea_servicio",
    "tipo_documento",
    "nmro_idntfccn",
    "empresa",
    "emprsa_rgmen",
    "rgmen",
    "gener",
    "prmr_nmbre",
    "sgndo_nmbre",
    "prmr_aplldo",
    "sgndo_aplldo",
    "fcha_ncmnto",
    "fcha_atncn",
    "edad",
    "tipo_edad",
    "direccion",
    "mncpo_rsdncia",
    "teléfono",
    "tnsn_artrl_alta",
    "tnsn_artrl_bja",
    "frcnca_crdca",
    "frcnca_rsprtra",
    "tmprtra",
    "pso",
    "tlla",
    "imc",
    "prmtro_crnl",
    "cdgo_dgnstco",
    "diagnostico",
    "cdgo_dgnstco_rl_1",
    "diagnostico_rl_1",
    "cdgo_dgnstco_rl_2",
    "diagnostico_rl_2",
    "profesional_salud",
    "especialidad",
]


def source_for(name, reader):
    module = import_module(f"nexora.statistics.infrastructure.{name}_source")
    class_name = "SqlServer" + "".join(part.title() for part in name.split("_")) + "Source"
    return getattr(module, class_name)(reader)


def test_lineas_filter_deduplicates_and_keeps_compatibility() -> None:
    module = import_module("nexora.statistics.domain.filters")
    filters = module.ReportFilter(date(2026, 1, 1), date(2026, 1, 1), (), (), (7, 2, 7))
    assert DetailedInvoicesFilter is module.ReportFilter
    assert filters.lineas == (7, 2)
    assert DetailedInvoicesFilter(filters.fecha_inicial, filters.fecha_final, (), ()).lineas == ()


@pytest.mark.parametrize("name", REPORTS)
@pytest.mark.parametrize("lineas", [(), (7, 2, 7)])
async def test_reader_binds_all_page_and_export_parameters(name, lineas) -> None:
    reader = FakeReader([{"sede": "Synthetic", "total_registros": 3}])
    source = source_for(name, reader)
    filters = DetailedInvoicesFilter(date(2026, 1, 1), date(2026, 1, 31), (3,), (9,), lineas)
    page = await source.page(filters, 2, 4)
    assert page.items == [{"sede": "Synthetic"}] and page.total == 3
    reader.rows = [{"sede": "Synthetic"}]
    assert [chunk async for chunk in source.stream(filters)] == [[{"sede": "Synthetic"}]]
    common = {
        "fecha_inicial": filters.fecha_inicial,
        "fecha_final": filters.fecha_final,
        "filtrar_sedes": 1,
        "filtrar_empresas": 1,
        "filtrar_lineas": int(bool(lineas)),
        "sedes": [3],
        "empresas": [9],
        "lineas": list(dict.fromkeys(lineas)) or [-1],
    }
    for index, (query, params) in enumerate(reader.calls):
        assert query.name == f"statistics.{name}" + ("_export" if index else "")
        assert params == (common if index else {**common, "limit": 2, "offset": 4})
        assert set(text(query.sql).compile().params) == set(params)
        assert query.list_params == frozenset({"sedes", "empresas", "lineas"})


@pytest.mark.parametrize("name", REPORTS)
async def test_shared_catalog_and_page_validation(name) -> None:
    reader = FakeReader([{"id": 7, "nombre": "  Consulta  "}, {"id": 8, "nombre": None}])
    report_module = import_module("nexora.statistics.application.report")
    report = report_module.Report(source_for(name, reader))
    options = await report.product_lines()
    assert [(item.id, item.nombre) for item in options] == [(7, "Consulta"), (8, "8")]
    catalog = import_module("nexora.statistics.infrastructure.queries.catalogs").PRODUCT_LINES
    assert reader.calls == [(catalog, None)]
    assert "tbLineasProductos lp WITH (NOLOCK)" in catalog.sql
    assert "lp.unco AS id, LTRIM(RTRIM(lp.dscrpcn)) AS nombre" in catalog.sql
    assert "ORDER BY nombre" in catalog.sql and "WHERE" not in catalog.sql
    reader.calls.clear()
    filters = DetailedInvoicesFilter(date(2026, 1, 1), date(2026, 1, 1), (), ())
    for limit, offset, message in [
        (0, 0, "El límite debe estar entre 1 y 100."),
        (101, 0, "El límite debe estar entre 1 y 100."),
        (1, -1, "El desplazamiento no puede ser negativo."),
    ]:
        with pytest.raises(InvalidReportFilter) as error:
            await report.page(filters, limit, offset)
        assert str(error.value) == message
    assert reader.calls == []


@pytest.mark.parametrize("name", REPORTS)
async def test_out_of_range_and_empty_filter_sentinels(name) -> None:
    from tests.unit.statistics.test_out_of_range_page import OffsetAwareReader

    reader = OffsetAwareReader()
    source = source_for(name, reader)
    day = date(2026, 1, 1)
    page = await source.page(DetailedInvoicesFilter(day, day, (), ()), 100, 100)
    assert page.items == [] and page.total == 3
    assert [call["offset"] for call in reader.calls] == [100, 0]
    for call in reader.calls:
        for field in ("sedes", "empresas", "lineas"):
            assert call[field] == [-1] and call[f"filtrar_{field}"] == 0


@pytest.fixture(params=REPORTS)
def http(request):
    module = import_module("nexora.statistics.presentation.http.v1.router")
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(module.statistics_router)
    app.include_router(module.vital_signs_router)
    app.include_router(module.admissions_router)
    reader = FakeReader([{"sede": "Synthetic", "total_registros": 7}])
    authentication = FakeAuthentication()
    permission = f"statistics.reports.{request.param}.view"
    authentication.permissions = frozenset({permission})
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        yield client, reader, authentication, request.param


def test_both_routers_page_catalog_and_openapi(http) -> None:
    client, reader, _, name = http
    base = f"/statistics/reports/{name.replace('_', '-')}"
    headers = {"Authorization": "Bearer test-token"}
    response = client.get(base, params={**DATES, "lineas": [7, 2, 7]}, headers=headers)
    assert response.status_code == 200
    assert response.json() == [{"sede": "Synthetic"}]
    assert response.headers["X-Total-Count"] == "7"
    assert reader.calls[0][1]["lineas"] == [7, 2]
    reader.rows = [{"id": 7, "nombre": " Consulta "}]
    response = client.get(base + "/filters/product-lines", headers=headers)
    assert response.status_code == 200
    assert response.json() == [{"id": 7, "nombre": "Consulta"}]
    assert "X-Total-Count" not in response.headers
    operation = client.get("/openapi.json").json()["paths"][base]["get"]
    assert "lineas" in {parameter["name"] for parameter in operation["parameters"]}


@pytest.mark.parametrize(
    "suffix", ["", "/filters/sites", "/filters/companies", "/filters/product-lines", "/export"]
)
def test_report_permissions_are_independent_on_every_route(http, suffix) -> None:
    client, reader, _, name = http
    other = next(report for report in REPORTS if report != name)
    params = {**DATES, "formato": "csv", "columnas": "sede:text"}
    base = f"/statistics/reports/{other.replace('_', '-')}"
    response = client.get(
        base + suffix, params=params, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert "X-Total-Count" not in response.headers
    assert reader.calls == []
    response = client.get(base + suffix, params=params)
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    assert reader.calls == []


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_both_reports_export_exactly_one_format_and_bind_lineas(http, formato) -> None:
    client, reader, _, name = http
    reader.rows = [{"sede": "Synthetic"}, {"sede": "Other"}]
    response = client.get(
        f"/statistics/reports/{name.replace('_', '-')}/export",
        params={**DATES, "formato": formato, "columnas": "sede:text", "lineas": [7, 7]},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 200
    filename = {
        "detailed_invoices": "facturas-detalladas",
        "vital_signs": "signos-vitales",
        "admissions": "admisiones",
    }[name]
    assert f"{filename}_2026-01-01_2026-01-31.{formato}" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"
    if formato == "csv":
        assert response.headers["content-type"].startswith("text/csv")
        assert response.content.decode("utf-8-sig") == "sede\r\nSynthetic\r\nOther\r\n"
    else:
        assert "spreadsheetml.sheet" in response.headers["content-type"]
        with zipfile.ZipFile(io.BytesIO(response.content)) as book:
            sheet = book.read("xl/worksheets/sheet1.xml").decode()
            assert book.testzip() is None
        assert sheet.count("<row ") == 3 and "Synthetic" in sheet and "Other" in sheet
    assert len(reader.calls) == 1
    assert reader.calls[0][1]["lineas"] == [7]
    assert "limit" not in reader.calls[0][1] and "offset" not in reader.calls[0][1]


@pytest.mark.parametrize(
    "extra", [{"formato": "both"}, {"lineas": "bad"}, {"columnas": "missing:text"}]
)
def test_rejected_export_preserves_reader_data(http, extra) -> None:
    client, reader, _, name = http
    reader.rows = [{"sede": "Synthetic"}]
    response = client.get(
        f"/statistics/reports/{name.replace('_', '-')}/export",
        params={**DATES, "formato": "csv", "columnas": "sede:text", **extra},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422
    if "columnas" in extra:
        assert response.json() == {"detail": "Columnas desconocidas: missing."}
        assert len(reader.calls) == 1
    else:
        assert isinstance(response.json()["detail"], list)
        assert reader.calls == []
    assert reader.rows == [{"sede": "Synthetic"}]
    assert "content-disposition" not in response.headers


def test_vital_signs_sql_columns_bindings_read_only_and_derivation() -> None:
    module = import_module("nexora.statistics.infrastructure.queries.vital_signs")
    sql = module.VITAL_SIGNS_SQL
    select = sql.split("SELECT\n    LTRIM(RTRIM(s.dscrpcn))", 1)[1].split(
        "FROM tbHistoriasClinicas thc", 1
    )[0]
    assert re.findall(r"\bAS (\w+)\s*(?:,|--|$)", select, re.MULTILINE) == [
        *HEADER,
        "total_registros",
    ]
    uncommented = re.sub(r"--[^\n]*", "", sql)
    assert not re.search(r"\b(CREATE|DROP|UPDATE|DELETE)\b", uncommented, re.IGNORECASE)
    assert re.findall(r"\bINSERT\s+INTO\s+(\S+)", uncommented, re.IGNORECASE) == [
        "@cerrado",
        "@def",
        "@esp",
    ]
    assert sql.lstrip().startswith(
        "SET NOCOUNT ON;\nSET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;"
    )
    assert "ORDER BY thc.fcha_atncn, t.unco, thc.unco\nOFFSET :offset" in sql
    for field, alias in [
        ("sedes", "s.unco"),
        ("empresas", "ae.unco_emprsa"),
        ("lineas", "lp.unco"),
    ]:
        assert f"AND (:filtrar_{field} = 0 OR {alias} IN :{field})" in sql
    assert "ON lp.unco = COALESCE(cdr.unco_lna_prdcto, thc.unco_lna_prdcto)" in sql
    expected = re.sub(r",\s*COUNT\(\*\) OVER \(\)\s+AS total_registros", "", sql).replace(
        "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY\n", ""
    )
    assert expected == module.VITAL_SIGNS_EXPORT_SQL
    assert "total_registros" not in expected and "OFFSET" not in expected
    assert set(text(expected).compile().params) == {
        "fecha_inicial",
        "fecha_final",
        "filtrar_sedes",
        "sedes",
        "filtrar_empresas",
        "empresas",
        "filtrar_lineas",
        "lineas",
    }


@pytest.mark.parametrize("suffix", ["", "/filters/sites", "/filters/companies", "/export"])
def test_legacy_routes_preserve_behavior_when_lineas_is_omitted(http, suffix) -> None:
    client, reader, _, name = http
    base = f"/statistics/reports/{name.replace('_', '-')}"
    if suffix.startswith("/filters"):
        reader.rows = [{"id": 3, "nombre": " Central "}]
    elif suffix == "/export":
        reader.rows = [{"sede": "Synthetic"}]
    response = client.get(
        base + suffix,
        params={**DATES, "formato": "csv", "columnas": "sede:text"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 200
    assert len(reader.calls) == 1
    if suffix.startswith("/filters"):
        assert response.json() == [{"id": 3, "nombre": "Central"}]
        assert reader.calls[0][1] is None
        assert "X-Total-Count" not in response.headers
    else:
        assert reader.calls[0][1]["lineas"] == [-1]
        assert reader.calls[0][1]["filtrar_lineas"] == 0
        if suffix == "/export":
            assert response.content.decode("utf-8-sig") == "sede\r\nSynthetic\r\n"
            assert "limit" not in reader.calls[0][1] and "offset" not in reader.calls[0][1]
        else:
            assert response.json() == [{"sede": "Synthetic"}]
            assert response.headers["X-Total-Count"] == "7"
            assert reader.calls[0][1]["limit"] == 50 and reader.calls[0][1]["offset"] == 0


def test_vital_signs_permission_catalog() -> None:
    specs = {spec.code: spec for spec in PERMISSION_CATALOG}
    permission = specs["statistics.reports.vital_signs.view"]
    assert permission.module == "statistics"
    assert permission.name == "Consultar informe Signos Vitales"


ADMISSIONS_HEADER = [
    "cnsctvo_trgge",
    "cnsctvo_admsn",
    "sede",
    "emprsa",
    "tpo_idntfccn",
    "nmro_idntfccn",
    "prmr_nmbre",
    "sgndo_nmbre",
    "prmr_aplldo",
    "sgndo_aplldo",
    "edd",
    "tlfno",
    "fcha_ncmnto",
    "sexo",
    "rza",
    "drccn",
    "mncpo_rsdncia",
    "tpo_idntfccn_prfsnl_ordna",
    "nmro_idntfccn_prfsnl_ordna",
    "prfsnl_ordna",
    "prfsnl_rlza",
    "cd_dx",
    "dx",
    "cd_dx_rlcndo1",
    "dx_rlcndo1",
    "cd_dx_rlcndo2",
    "dx_rlcndo2",
    "fcha_admsn",
    "fcha_slda_admsn",
    "fcha_ordn",
    "fcha_atncn2",
    "cnsctvo_dcto",
    "fcha_dcto",
    "cnsctvo_ordn_smntro_admsn",
    "cdgo_prcdmnto",
    "rslcn",
    "prcdmnto",
    "lna_prdcto",
    "cntdd",
    "vlr_srvco",
    "vlr_ttl",
    "vlr_srvcs",
    "vlr_smnstrs",
    "vlr_hnrrio",
    "fcha_atrzcn_eps",
    "nmro_atrzcn_eps",
    "estdo_admsn",
    "estdo_trnsccn",
    "estdo_srvcs",
    "usro_rlza",
    "usro_mdfccn",
    "tnsn_artrl_alta",
    "tnsn_artrl_bja",
    "frcnca_crdca",
    "frcnca_rsprtra",
    "tmprtra",
    "pso",
    "tlla",
    "imc",
]


def test_admissions_sql_columns_bindings_read_only_and_derivation() -> None:
    module = import_module("nexora.statistics.infrastructure.queries.admissions")
    sql = module.ADMISSIONS_SQL
    select = sql.split("SELECT\n    ISNULL(pra.cnsctvo_trgge, 0)", 1)[1].split(
        "FROM tbAdmisiones adm", 1
    )[0]
    assert re.findall(r"\bAS (\w+)\s*(?:,|--|$)", select, re.MULTILINE) == [
        *ADMISSIONS_HEADER,
        "total_registros",
    ]
    assert len(ADMISSIONS_HEADER) == 59
    uncommented = re.sub(r"--[^\n]*", "", sql)
    assert not re.search(r"\b(CREATE|DROP|UPDATE|DELETE)\b", uncommented, re.IGNORECASE)
    assert re.findall(r"\bINSERT\s+INTO\s+(\S+)", uncommented, re.IGNORECASE) == ["@def"]
    assert sql.lstrip().startswith(
        "SET NOCOUNT ON;\nSET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;"
    )
    assert (
        "ORDER BY adm.fcha_admsn, adm.cnsctvo_admsns, det.tpo_dtlle, det.unco_dtlle\nOFFSET" in sql
    )
    for field, alias in [
        ("sedes", "s.unco"),
        ("empresas", "ae.unco_emprsa"),
        ("lineas", "lp.unco"),
    ]:
        assert f"AND (:filtrar_{field} = 0 OR {alias} IN :{field})" in sql
    expected = re.sub(r",\s*COUNT\(\*\) OVER \(\)\s+AS total_registros", "", sql).replace(
        "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY\n", ""
    )
    assert expected == module.ADMISSIONS_EXPORT_SQL
    assert "total_registros" not in expected and "OFFSET" not in expected
    assert set(text(expected).compile().params) == {
        "fecha_inicial",
        "fecha_final",
        "filtrar_sedes",
        "sedes",
        "filtrar_empresas",
        "empresas",
        "filtrar_lineas",
        "lineas",
    }


def test_admissions_header_matches_csv_when_available() -> None:
    csv_path = Path(__file__).resolve().parents[4] / "data_ips" / "Admisiones.csv"
    if not csv_path.exists():  # data_ips is git-ignored
        pytest.skip("data_ips/Admisiones.csv no disponible")
    first_line = csv_path.read_text(encoding="utf-8-sig").splitlines()[0]
    assert first_line.split(",") == ADMISSIONS_HEADER


def test_admissions_permission_catalog() -> None:
    specs = {spec.code: spec for spec in PERMISSION_CATALOG}
    permission = specs["statistics.reports.admissions.view"]
    assert permission.module == "statistics"
    assert permission.name == "Consultar informe Admisiones"


TRIAGE_HEADER = [
    "sede",
    "cnsctvo_trgge",
    "cnsctvo_admsns",
    "estdo_admsn",
    "cdgo_tpo_dcmnto",
    "nmro_idntfccn",
    "prmr_nmbre",
    "sgndo_nmbre",
    "prmr_aplldo",
    "sgndo_aplldo",
    "edd",
    "tipo_edd",
    "fcha_ncmnto",
    "sexo",
    "empresa",
    "tpo_empresa",
    "tpo_idntfccn_profesional",
    "nmro_idntfccn_profesional",
    "profesional_salud",
    "cdgo",
    "estdo_rgstro",
    "fcha_ingrso",
    "fcha_trge",
    "fcha_admsn",
    "fcha_atncn",
    "t_prdmsn_trgge",
    "t_trgge_admsn",
    "t_admsn_prdmsn",
    "t_prdmsn_atncn",
    "tnsn_artrl_alta",
    "tnsn_artrl_bja",
    "frcnca_crdca",
    "frcnca_rsprtra",
    "tmprtra",
    "pso",
    "tlla",
    "imc",
    "prmtro_brql",
]
TRIAGE_PARAMS = {
    "fecha_inicial",
    "fecha_final",
    "filtrar_sedes",
    "sedes",
    "filtrar_empresas",
    "empresas",
}


def test_triage_sql_columns_bindings_read_only_and_derivation() -> None:
    module = import_module("nexora.statistics.infrastructure.queries.triage")
    sql = module.TRIAGE_SQL
    select = sql.split("\nSELECT\n", 1)[1].split("FROM tbPreadmision pa", 1)[0]
    assert re.findall(r"\bAS (\w+)\s*(?:,|--|$)", select, re.MULTILINE) == [
        *TRIAGE_HEADER,
        "total_registros",
    ]
    assert len(TRIAGE_HEADER) == 38
    uncommented = re.sub(r"--[^\n]*", "", sql)
    assert not re.search(r"\b(CREATE|DROP|INSERT|UPDATE|DELETE)\b", uncommented, re.IGNORECASE)
    assert sql.lstrip().startswith(
        "SET NOCOUNT ON;\nSET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;"
    )
    assert "CAST(:fecha_inicial AS DATE)" in sql and "CAST(:fecha_final AS DATE)" in sql
    assert "pa.fcha_ingrso >= @FechaInicio" in sql
    assert "pa.fcha_ingrso <  @FechaFinExc" in sql
    assert "DATEADD(DAY, 1, @FechaFin)" in sql
    assert "ORDER BY pa.cnsctvo_trgge, pa.unco, thc_trge.unco, thc_atncn.unco\nOFFSET" in sql
    for field, alias in [("sedes", "s.unco"), ("empresas", "emp.unco")]:
        assert f"AND (:filtrar_{field} = 0 OR {alias} IN :{field})" in sql
    assert "ON emp.unco = ISNULL(ae_actv.unco_emprsa, ae.unco_emprsa)" in sql
    expected = re.sub(r",\s*COUNT\(\*\) OVER \(\)\s+AS total_registros", "", sql).replace(
        "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY\n", ""
    )
    assert expected == module.TRIAGE_EXPORT_SQL
    assert "OFFSET" not in expected and "total_registros" not in expected
    assert set(text(expected).compile().params) == TRIAGE_PARAMS
    for query, suffix in [(module.TRIAGE_QUERY, ""), (module.TRIAGE_EXPORT_QUERY, "_export")]:
        assert query.name == f"statistics.triage{suffix}"
        assert query.list_params == frozenset({"sedes", "empresas"})


def test_triage_header_matches_csv_when_available() -> None:
    csv_path = Path(__file__).resolve().parents[4] / "data_ips" / "TRIAJE.csv"
    if not csv_path.exists():
        pytest.skip("data_ips/TRIAJE.csv no disponible")
    with csv_path.open(encoding="utf-8-sig") as csv_file:
        assert csv_file.readline().strip().split(",") == TRIAGE_HEADER


@pytest.mark.parametrize("ids", [(), (3, 9)])
async def test_triage_source_binds_only_its_filters(ids) -> None:
    reader = FakeReader([{"sede": "Synthetic", "total_registros": 7}])
    source = source_for("triage", reader)
    filters = DetailedInvoicesFilter(date(2026, 1, 1), date(2026, 1, 31), ids, ids, (2,))
    page = await source.page(filters, 2, 4)
    assert page.items == [{"sede": "Synthetic"}] and page.total == 7
    reader.rows = [{"sede": "Synthetic"}]
    assert [chunk async for chunk in source.stream(filters)] == [[{"sede": "Synthetic"}]]
    expected = {
        "fecha_inicial": filters.fecha_inicial,
        "fecha_final": filters.fecha_final,
        "filtrar_sedes": int(bool(ids)),
        "sedes": list(ids) or [-1],
        "filtrar_empresas": int(bool(ids)),
        "empresas": list(ids) or [-1],
    }
    for index, (query, params) in enumerate(reader.calls):
        assert params == (expected if index else {**expected, "limit": 2, "offset": 4})
        assert "lineas" not in params and "filtrar_lineas" not in params
        assert set(text(query.sql).compile().params) == set(params)
    assert set(text(reader.calls[1][0].sql).compile().params) == TRIAGE_PARAMS


def test_triage_permission_catalog() -> None:
    permission = next(p for p in PERMISSION_CATALOG if p.code == "statistics.reports.triage.view")
    assert permission.module == "statistics"
    assert permission.name == "Consultar informe Triaje"


@pytest.mark.parametrize(
    "suffix", ["", "/filters/sites", "/filters/companies", "/filters/product-lines", "/export"]
)
def test_triage_permission_guards_every_route(suffix) -> None:
    module = import_module("nexora.statistics.presentation.http.v1.router")
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(module.triage_router)
    reader = FakeReader([])
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({"statistics.reports.admissions.view"})
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        params = {**DATES, "formato": "csv", "columnas": "sede:text"}
        response = client.get(
            "/statistics/reports/triage" + suffix,
            params=params,
            headers={"Authorization": "Bearer test-token"},
        )
        assert response.status_code == 403
        assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
        assert reader.calls == [] and reader.rows == []
        response = client.get("/statistics/reports/triage" + suffix, params=params)
        assert response.status_code == 401
        assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
        assert reader.calls == [] and reader.rows == []


@pytest.mark.parametrize("formato", ["csv", "xlsx"])
def test_triage_http_page_catalogs_and_export(formato) -> None:
    module = import_module("nexora.statistics.presentation.http.v1.router")
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(module.triage_router)
    reader = FakeReader([{"sede": "Synthetic", "total_registros": 7}])
    authentication = FakeAuthentication()
    authentication.permissions = frozenset({"statistics.reports.triage.view"})
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer test-token"}
        base = "/statistics/reports/triage"
        response = client.get(base, params=DATES, headers=headers)
        assert response.status_code == 200 and response.json() == [{"sede": "Synthetic"}]
        assert response.headers["X-Total-Count"] == "7"
        for catalog in ["sites", "companies"]:
            reader.rows = [{"id": 3, "nombre": " Central "}]
            response = client.get(base + "/filters/" + catalog, headers=headers)
            assert response.status_code == 200
            assert response.json() == [{"id": 3, "nombre": "Central"}]
        reader.rows = [{"sede": "Synthetic"}]
        response = client.get(
            base + "/export",
            params={**DATES, "formato": formato, "columnas": "sede:text"},
            headers=headers,
        )
        assert response.status_code == 200
        assert f"triaje_2026-01-01_2026-01-31.{formato}" in response.headers["content-disposition"]
        assert response.headers["cache-control"] == "no-store"
        if formato == "csv":
            assert response.content.decode("utf-8-sig") == "sede\r\nSynthetic\r\n"
        else:
            with zipfile.ZipFile(io.BytesIO(response.content)) as book:
                assert book.testzip() is None
                assert "Synthetic" in book.read("xl/worksheets/sheet1.xml").decode()
        assert set(reader.calls[-1][1]) == TRIAGE_PARAMS
