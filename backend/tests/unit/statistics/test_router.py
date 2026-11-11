"""HTTP permission, validation and error boundaries with a fake SQL reader."""

from collections.abc import Iterator
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.unit.statistics.test_detailed_invoices import FakeReader

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal, UserView
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_authenticate_use_case,
    get_container,
)
from nexora.integration_management.application.ports import (
    ExternalQueryFailed,
    ExternalSourceUnavailable,
)
from nexora.statistics.presentation.http.v1.router import statistics_router

BASE = "/statistics/reports/detailed-invoices"
DATES = {"fecha_inicial": "2026-01-01", "fecha_final": "2026-01-31"}
PERMISSION = "statistics.reports.detailed_invoices.view"


class FakeAuthentication:
    permissions: frozenset[str] = frozenset({PERMISSION})

    async def execute(self, token: str) -> AuthenticatedPrincipal:
        assert token == "test-token"
        return AuthenticatedPrincipal(
            user=UserView(uuid4(), "reporter", "reporter@example.test", "Report User"),
            session_id=uuid4(),
            roles=(),
            permissions=self.permissions,
        )


@pytest.fixture
def http() -> Iterator[tuple[TestClient, FakeReader, FakeAuthentication]]:
    reader = FakeReader([{"nmro_dcto": "A-1", "total_registros": 7}])
    authentication = FakeAuthentication()
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(statistics_router)
    app.dependency_overrides[get_container] = lambda: SimpleNamespace(sqlserver=reader)
    app.dependency_overrides[get_authenticate_use_case] = lambda: authentication
    with TestClient(app) as client:
        yield client, reader, authentication


@pytest.mark.parametrize("suffix", ["", "/filters/sites", "/filters/companies"])
def test_all_routes_require_token_and_permission(
    http: tuple[TestClient, FakeReader, FakeAuthentication], suffix: str
) -> None:
    client, reader, authentication = http
    response = client.get(BASE + suffix, params=DATES)
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    assert "X-Total-Count" not in response.headers
    assert reader.calls == []
    authentication.permissions = frozenset()
    response = client.get(
        BASE + suffix, params=DATES, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert "X-Total-Count" not in response.headers
    assert reader.calls == []


def test_page_preserves_rows_count_and_repeatable_filters(
    http: tuple[TestClient, FakeReader, FakeAuthentication],
) -> None:
    client, reader, _ = http
    response = client.get(
        BASE,
        params={**DATES, "sedes": [3, 1, 3], "empresas": [9, 2], "offset": 4},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 200
    assert response.json() == [{"nmro_dcto": "A-1"}]
    assert response.headers["X-Total-Count"] == "7"
    assert len(reader.calls) == 1
    assert reader.calls[0][1]["sedes"] == [3, 1]
    assert reader.calls[0][1]["empresas"] == [9, 2]
    assert reader.calls[0][1]["limit"] == 50
    assert reader.calls[0][1]["offset"] == 4


@pytest.mark.parametrize("suffix", ["/filters/sites", "/filters/companies"])
def test_catalog_routes(
    http: tuple[TestClient, FakeReader, FakeAuthentication], suffix: str
) -> None:
    client, reader, _ = http
    reader.rows = [{"id": 8, "nombre": "Central"}]
    response = client.get(BASE + suffix, headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 200
    assert response.json() == [{"id": 8, "nombre": "Central"}]
    assert "X-Total-Count" not in response.headers
    assert len(reader.calls) == 1


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"fecha_inicial": "2026-01-01"},
        {"fecha_final": "2026-01-31"},
        {**DATES, "limit": 0},
        {**DATES, "limit": 101},
        {**DATES, "offset": -1},
        {**DATES, "sedes": "not-an-id"},
    ],
)
def test_invalid_query_does_not_read_source(
    http: tuple[TestClient, FakeReader, FakeAuthentication], params: dict[str, object]
) -> None:
    client, reader, _ = http
    response = client.get(BASE, params=params, headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert "X-Total-Count" not in response.headers
    assert reader.calls == []


def test_reversed_dates(http: tuple[TestClient, FakeReader, FakeAuthentication]) -> None:
    client, reader, _ = http
    response = client.get(
        BASE,
        params={"fecha_inicial": "2026-02-01", "fecha_final": "2026-01-01"},
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "La fecha inicial no puede ser posterior a la final."}
    assert "X-Total-Count" not in response.headers
    assert reader.calls == []


@pytest.mark.parametrize("suffix", ["", "/filters/sites", "/filters/companies"])
@pytest.mark.parametrize(
    ("error_type", "code", "message"),
    [
        (ExternalSourceUnavailable, 503, "Fuente de datos externa no disponible"),
        (ExternalQueryFailed, 502, "No se pudo consultar la fuente de datos externa"),
    ],
)
def test_external_errors_are_sanitized(
    http: tuple[TestClient, FakeReader, FakeAuthentication],
    suffix: str,
    error_type: type[Exception],
    code: int,
    message: str,
) -> None:
    client, reader, _ = http
    reader.error = error_type("private query details")
    response = client.get(
        BASE + suffix, params=DATES, headers={"Authorization": "Bearer test-token"}
    )
    assert response.status_code == code
    assert response.json() == {"detail": message}
    assert "X-Total-Count" not in response.headers
    assert len(reader.calls) == 1


def test_openapi_documents_filter_and_pagination_contract(
    http: tuple[TestClient, FakeReader, FakeAuthentication],
) -> None:
    client, _, _ = http
    operation = client.get("/openapi.json").json()["paths"][BASE]["get"]
    parameters = {param["name"]: param for param in operation["parameters"]}
    assert parameters["fecha_inicial"]["required"] is True
    assert parameters["fecha_final"]["required"] is True
    assert parameters["limit"]["schema"]["default"] == 50
    assert parameters["limit"]["schema"]["maximum"] == 100
    assert parameters["offset"]["schema"]["minimum"] == 0
    assert "X-Total-Count" in operation["responses"]["200"]["headers"]
