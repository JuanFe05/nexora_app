"""Administración de cuotas por HTTP con repositorio determinista."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from tests.unit.statistics.test_general_consumption import FILTER, Source, invoice

from nexora.bootstrap.app import _register_error_handlers
from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal, UserView
from nexora.identity_access.presentation.http.v1.dependencies.auth import get_current_principal
from nexora.statistics.application.general_consumption import GeneralConsumptionReport
from nexora.statistics.application.moderator_fees import FeeSchedule, ModeratorFeesAdministration
from nexora.statistics.presentation.http.v1.moderator_fees_router import (
    get_moderator_fees_administration,
    moderator_fees_router,
)

BASE = "/statistics/administrative/moderator-fees"
VIEW = "statistics.administrative.moderator_fees.view"
MANAGE = "statistics.administrative.moderator_fees.manage"
NOW = datetime(2026, 2, 1, tzinfo=UTC)
ACTOR = uuid4()


class Clock:
    def now(self) -> datetime:
        return NOW


class Repository:
    def __init__(self) -> None:
        self.rows: dict[int, FeeSchedule] = {}
        self.writes: list[Any] = []

    async def list(self) -> list[FeeSchedule]:
        return sorted(self.rows.values(), key=lambda row: row.vigencia, reverse=True)

    async def upsert(self, year: int, amounts: tuple[int, ...], actor: UUID,
                     changed_at: datetime) -> FeeSchedule:
        self.writes.append((year, amounts, actor, changed_at))
        row = FeeSchedule(year, amounts, "Usuario Prueba", changed_at)
        self.rows[year] = row
        return row

    async def delete(self, year: int) -> bool:
        self.writes.append(("delete", year))
        return self.rows.pop(year, None) is not None

    async def snapshot(self) -> dict[int, frozenset[int]]:
        return {year: frozenset(row.importes) for year, row in self.rows.items()}


class Transaction:
    commits = 0
    rollbacks = 0

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


@pytest.fixture
def http() -> Any:
    repository, transaction = Repository(), Transaction()
    service = ModeratorFeesAdministration(repository, transaction, Clock())
    app = FastAPI()
    _register_error_handlers(app)
    app.include_router(moderator_fees_router)
    app.dependency_overrides[get_moderator_fees_administration] = lambda: service
    principal = AuthenticatedPrincipal(
        UserView(ACTOR, "tester", "tester@example.test", "Usuario Prueba"),
        uuid4(), permissions=frozenset({VIEW, MANAGE}),
    )
    app.dependency_overrides[get_current_principal] = lambda: principal
    with TestClient(app) as client:
        yield client, repository, transaction, app


def test_upsert_list_delete_and_audit(http: Any) -> None:
    client, repository, transaction, _ = http
    for year, amounts in [(2000, [1]), (2100, [10_000_000]), (2026, [52800, 5000, 20100])]:
        response = client.put(f"{BASE}/{year}", json={"importes": amounts})
        assert response.status_code == 200
        assert response.json() == {
            "vigencia": year, "importes": sorted(amounts),
            "actualizado_por": "Usuario Prueba", "actualizado_en": "2026-02-01T00:00:00Z",
        }
        assert repository.writes[-1] == (year, tuple(sorted(amounts)), ACTOR, NOW)
    assert transaction.commits == 3
    response = client.get(BASE)
    assert response.status_code == 200
    assert [row["vigencia"] for row in response.json()] == [2100, 2026, 2000]
    response = client.put(BASE + "/2026", json={"importes": list(range(1, 11))})
    assert response.status_code == 200 and response.json()["importes"] == list(range(1, 11))
    deleted = client.delete(BASE + "/2026")
    assert deleted.status_code == 204 and deleted.content == b""
    assert [r["vigencia"] for r in client.get(BASE).json()] == [2100, 2000]
    missing = client.delete(BASE + "/2026")
    assert missing.status_code == 404
    assert missing.json() == {
        "detail": "Registro de cuotas moderadoras de la vigencia 2026 no encontrado"
    }
    assert transaction.commits == 5


@pytest.mark.parametrize(("year", "body", "message"), [
    ("1999", {"importes": [1]}, "La vigencia debe estar entre 2000 y 2100."),
    ("2101", {"importes": [1]}, "La vigencia debe estar entre 2000 y 2100."),
    ("abc", {"importes": [1]}, "La solicitud de cuotas moderadoras no es válida."),
    ("2026", {"importes": []}, "Debe indicar entre 1 y 10 importes."),
    ("2026", {"importes": list(range(1, 12))}, "Debe indicar entre 1 y 10 importes."),
    ("2026", {"importes": [1, 1]}, "Los importes deben ser únicos."),
    *[("2026", {"importes": [value]}, "Los importes deben ser enteros entre 1 y 10000000.")
      for value in (0, -1, 10_000_001)],
    *[("2026", {"importes": [value]}, "La solicitud de cuotas moderadoras no es válida.")
      for value in (True, 1.5, "5000", None)],
    ("2026", {}, "La solicitud de cuotas moderadoras no es válida."),
    ("2026", {"importes": [1], "extra": 1}, "La solicitud de cuotas moderadoras no es válida."),
])
def test_invalid_put_leaves_data_and_counters_unchanged(
    http: Any, year: str, body: Any, message: str,
) -> None:
    client, repository, transaction, _ = http
    assert client.put(BASE + "/2026", json={"importes": [5000]}).status_code == 200
    before = client.get(BASE).json()
    writes, commits = len(repository.writes), transaction.commits
    response = client.put(f"{BASE}/{year}", json=body)
    assert response.status_code == 422
    assert response.json() == {"detail": message}
    assert client.get(BASE).json() == before
    assert len(repository.writes) == writes and transaction.commits == commits


@pytest.mark.parametrize("year", [1999, 2101])
def test_invalid_delete_leaves_data_unchanged(http: Any, year: int) -> None:
    client, repository, transaction, _ = http
    response = client.delete(f"{BASE}/{year}")
    assert response.status_code == 422
    assert response.json() == {"detail": "La vigencia debe estar entre 2000 y 2100."}
    assert client.get(BASE).json() == []
    assert repository.writes == [] and transaction.commits == 0


@pytest.mark.parametrize(("method", "suffix", "permission"), [
    ("GET", "", VIEW), ("PUT", "/2026", MANAGE), ("DELETE", "/2026", MANAGE),
])
def test_auth_and_permission_independence(http: Any, method: str, suffix: str,
                                          permission: str) -> None:
    client, repository, transaction, app = http
    app.dependency_overrides.pop(get_current_principal)
    # Avoid opening any real database when the real authentication dependency is resolved.
    from tests.unit.statistics.test_router import FakeAuthentication

    from nexora.identity_access.presentation.http.v1.dependencies.auth import (
        get_authenticate_use_case,
    )

    auth = FakeAuthentication()
    auth.permissions = frozenset({VIEW if permission == MANAGE else MANAGE})
    app.dependency_overrides[get_authenticate_use_case] = lambda: auth
    response = client.request(method, BASE + suffix, json={"importes": [1]})
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    response = client.request(method, BASE + suffix, json={"importes": [1]},
                              headers={"Authorization": "Bearer test-token"})
    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert repository.writes == [] and transaction.commits == 0
    auth.permissions = frozenset({permission})
    response = client.request(method, BASE + suffix, json={"importes": [1]},
                              headers={"Authorization": "Bearer test-token"})
    assert response.status_code == (404 if method == "DELETE" else 200)


async def test_report_reads_current_snapshot_across_workers_and_after_delete() -> None:
    repository = Repository()
    await repository.upsert(2026, (5000,), ACTOR, NOW)
    source = Source([invoice(vlr_lqdd_pcnte=5000)])
    reports = [GeneralConsumptionReport(source, Source([]), fees=repository) for _ in range(2)]
    try:
        for report in reports:
            assert (await report.build(FILTER))["indicadores"][2]["valor"] == 5000
        await repository.upsert(2026, (20100,), ACTOR, NOW)
        for report in reports:
            indicators = (await report.build(FILTER))["indicadores"]
            assert indicators[2]["valor"] == 0 and indicators[1]["valor"] == 5000
        await repository.delete(2026)
        from nexora.statistics.domain.general_consumption import UnconfiguredFeeYear

        for report in reports:
            with pytest.raises(UnconfiguredFeeYear, match="vigencia 2026"):
                await report.build(FILTER)
    finally:
        for report in reports:
            await report.aclose()
