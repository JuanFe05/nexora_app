"""Contrato real HTTP/PostgreSQL: bootstrap ADMINISTRADOR, auditoría y snapshot."""

from datetime import datetime

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.statistics.infrastructure.persistence.repositories import DatabaseModeratorFeeSnapshot
from tests.integration.conftest import ORIGIN, PASSWORD, Seeder

BASE = "/api/v1/statistics/administrative/moderator-fees"


async def test_admin_permissions_persistence_audit_and_fresh_snapshot(
    client: AsyncClient, app: FastAPI, seeder: Seeder, db_session: AsyncSession,
) -> None:
    actor = await seeder.create_user()
    await db_session.execute(text(
        "INSERT INTO iam.asignacion_rol (usuario_id, rol_id) "
        "SELECT :actor, id FROM iam.rol WHERE codigo = 'ADMINISTRADOR'"
    ), {"actor": actor})
    await db_session.commit()
    login = await client.post("/api/v1/auth/login", headers={"origin": ORIGIN},
                              json={"identificador": "jperez", "contrasena": PASSWORD})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    snapshot = DatabaseModeratorFeeSnapshot(app.state.container.database.session)
    listed = await client.get(BASE, headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["actualizado_por"] is None
    assert (await snapshot.snapshot())[2026] == frozenset({5000, 20100, 52800})
    for amounts in ([20100, 5000], [1]):
        response = await client.put(BASE + "/2026", headers=headers, json={"importes": amounts})
        assert response.status_code == 200, response.text
        row = response.json()
        assert row["importes"] == sorted(amounts) and row["actualizado_por"] == "Juan Perez"
        assert datetime.fromisoformat(row["actualizado_en"]).tzinfo is not None
        assert (await snapshot.snapshot())[2026] == frozenset(amounts)
        stored_actor = (await db_session.execute(text(
            "SELECT actualizado_por FROM statistics.cuota_moderadora WHERE vigencia = 2026"
        ))).scalar_one()
        assert stored_actor == actor
    deleted = await client.delete(BASE + "/2026", headers=headers)
    assert deleted.status_code == 204 and deleted.content == b""
    assert await snapshot.snapshot() == {}
    assert (await client.get(BASE, headers=headers)).json() == []
