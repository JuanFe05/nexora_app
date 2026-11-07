"""Gestion propia de sesiones por HTTP, sin permisos ni exposicion de secretos."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import event, text
from sqlalchemy.engine import Engine

from tests.integration.test_auth_api import ME_URL, do_login
from tests.integration.test_session_management import (
    cookie_snapshot,
    refresh_with_snapshot,
    sid_from_access,
)
from tests.support.fakes import FixedClock

PATH = "/api/v1/profile/sessions"


async def login_session(client, **kwargs):
    response = await do_login(client, **kwargs)
    assert response.status_code == 200, response.text
    access = response.json()["access_token"]
    return sid_from_access(access), {"Authorization": f"Bearer {access}"}, cookie_snapshot(client)


@pytest.mark.parametrize("idle_minutes", [15, 30])
async def test_list_filters_orders_projects_and_has_constant_query_count(
    app, client, seeder, db_session, idle_minutes
):
    await seeder.create_user()
    await seeder.create_user(username="otro", email="otro@example.test")
    foreign, _, _ = await login_session(client, identificador="otro")
    older, _, _ = await login_session(client)
    newer, _, _ = await login_session(client)
    revoked, _, _ = await login_session(client)
    absolute, _, _ = await login_session(client)
    idle, _, _ = await login_session(client)
    current, headers, _ = await login_session(client)
    now = datetime.now(UTC)
    app.state.container = replace(
        app.state.container,
        clock=FixedClock(now),
        settings=app.state.container.settings.model_copy(
            update={"session_idle_timeout_minutes": idle_minutes}
        ),
    )
    for sid, changes in (
        (older, "fecha_ultima_actividad = :older, direccion_ip = NULL, agente_usuario = NULL"),
        (newer, "fecha_ultima_actividad = :newer"),
        (current, "fecha_ultima_actividad = :current"),
        (revoked, "fecha_revocacion = :now"),
        (absolute, "fecha_vencimiento = :now"),
        (idle, "fecha_ultima_actividad = :idle"),
    ):
        await db_session.execute(
            # Clausulas literales de la tabla de casos anterior; ningun input externo.
            text(f"UPDATE iam.sesion SET {changes} WHERE id = :id"),  # noqa: S608
            {
                "id": sid,
                "now": now,
                "older": now - timedelta(seconds=40),
                "newer": now - timedelta(seconds=10),
                "current": now - timedelta(seconds=50),
                "idle": now - timedelta(minutes=idle_minutes),
            },
        )
    await db_session.commit()
    statements = []

    def count_statement(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    # Solo se cuenta SQL mientras se ejecuta la peticion, nunca la siembra.
    event.listen(Engine, "before_cursor_execute", count_statement)
    try:
        response = await client.get(PATH, headers=headers)
        first_count = len(statements)
        statements.clear()
    finally:
        event.remove(Engine, "before_cursor_execute", count_statement)
    assert response.status_code == 200, response.text
    assert first_count == 4  # Sesion, usuario, acceso efectivo y una proyeccion del listado.
    items = response.json()["items"]
    assert [item["id"] for item in items] == [str(current), str(newer), str(older)]
    assert [item["actual"] for item in items] == [True, False, False]
    for item in items:
        assert set(item) == {
            "id",
            "direccion_ip",
            "agente_usuario",
            "fecha_creacion",
            "fecha_ultima_actividad",
            "fecha_vencimiento",
            "actual",
        }
        for key in ("fecha_creacion", "fecha_ultima_actividad", "fecha_vencimiento"):
            assert datetime.fromisoformat(item[key]).utcoffset() == timedelta(0)
        stored = await seeder.fetch_session(UUID(item["id"]))
        ip = stored["direccion_ip"]
        assert item["direccion_ip"] == (str(ip) if ip is not None else None)
        created_at = (
            await db_session.execute(
                text("SELECT fecha_creacion FROM iam.sesion WHERE id = :id"),
                {"id": UUID(item["id"])},
            )
        ).scalar_one()
        assert datetime.fromisoformat(item["fecha_creacion"]) == created_at
        assert item["agente_usuario"] == stored["agente_usuario"]
        assert (
            datetime.fromisoformat(item["fecha_ultima_actividad"])
            == stored["fecha_ultima_actividad"]
        )
        assert datetime.fromisoformat(item["fecha_vencimiento"]) == stored["fecha_vencimiento"]
    assert items[-1]["direccion_ip"] is None and items[-1]["agente_usuario"] is None
    assert str(foreign) not in response.text
    for forbidden in ("jti", "hash", "token", "usuario_id", "fecha_revocacion"):
        assert forbidden not in response.text
    # Add sessions via the same real login path; the list must not cause N+1 queries.
    for _ in range(8):
        await login_session(client)
    event.listen(Engine, "before_cursor_execute", count_statement)
    try:
        larger = await client.get(PATH, headers=headers)
        assert larger.status_code == 200
        assert len(larger.json()["items"]) == 11
        assert len(statements) == first_count
        list_selects = [s for s in statements if "iam.sesion" in s and "ORDER BY" in s]
        assert len(list_selects) == 1
    finally:
        event.remove(Engine, "before_cursor_execute", count_statement)


async def test_delete_other_session_rejects_its_access_and_refresh_only(app, client, seeder):
    await seeder.create_user()
    await seeder.create_user(username="otro", email="otro@example.test")
    foreign, foreign_headers, foreign_cookies = await login_session(client, identificador="otro")
    target, target_headers, target_cookies = await login_session(client)
    current, headers, current_cookies = await login_session(client)
    foreign_before = await seeder.fetch_session(foreign)
    response = await client.delete(f"{PATH}/{target}", headers=headers)
    assert response.status_code == 204, response.text
    assert response.content == b""
    assert response.headers.get_list("set-cookie") == []
    for response in (
        await client.get(ME_URL, headers=target_headers),
        await refresh_with_snapshot(app, target_cookies),
    ):
        assert response.status_code == 401
        assert response.json() == {"detail": "Sesion no activa"}
    assert (await client.get(ME_URL, headers=headers)).status_code == 200
    assert (await refresh_with_snapshot(app, current_cookies)).status_code == 200
    assert await seeder.fetch_session(foreign) == foreign_before
    assert (await client.get(ME_URL, headers=foreign_headers)).status_code == 200
    assert (await refresh_with_snapshot(app, foreign_cookies)).status_code == 200
    assert await seeder.count_sessions() == 3
    assert [i["id"] for i in (await client.get(PATH, headers=headers)).json()["items"]] == [
        str(current)
    ]


@pytest.mark.parametrize("kind", ["missing", "foreign", "revoked", "absolute", "idle", "current"])
async def test_delete_rejection_does_not_change_sessions(app, client, seeder, db_session, kind):
    await seeder.create_user()
    await seeder.create_user(username="otro", email="otro@example.test")
    foreign, _, _ = await login_session(client, identificador="otro")
    target, _, _ = await login_session(client)
    current, headers, cookies = await login_session(client)
    now = datetime.now(UTC)
    app.state.container = replace(app.state.container, clock=FixedClock(now))
    if kind in ("revoked", "absolute", "idle"):
        column = {
            "revoked": "fecha_revocacion",
            "absolute": "fecha_vencimiento",
            "idle": "fecha_ultima_actividad",
        }[kind]
        await db_session.execute(
            # Columna de la lista cerrada anterior; los valores siempre van parametrizados.
            text(f"UPDATE iam.sesion SET {column} = :moment WHERE id = :id"),  # noqa: S608
            {"id": target, "moment": now - timedelta(minutes=30) if kind == "idle" else now},
        )
        await db_session.commit()
    target = {"missing": uuid4(), "foreign": foreign, "current": current}.get(kind, target)
    before = [await seeder.fetch_session(sid) for sid in (foreign, target, current)]
    response = await client.delete(f"{PATH}/{target}", headers=headers)
    assert response.status_code == (409 if kind == "current" else 404), response.text
    assert response.json() == {
        "detail": "Para cerrar la sesion actual, use «Cerrar sesión»"
        if kind == "current"
        else "Recurso no encontrado"
    }
    assert response.headers.get_list("set-cookie") == []
    assert [await seeder.fetch_session(sid) for sid in (foreign, target, current)] == before
    assert await seeder.count_sessions() == 3
    assert (await client.get(ME_URL, headers=headers)).status_code == 200
    assert (await refresh_with_snapshot(app, cookies)).status_code == 200


@pytest.mark.parametrize("method", ["GET", "DELETE"])
async def test_sessions_require_auth_without_mutation(client, seeder, method):
    await seeder.create_user()
    sid, _, _ = await login_session(client)
    before = await seeder.fetch_session(sid)
    response = await client.request(method, PATH if method == "GET" else f"{PATH}/{sid}")
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    assert await seeder.fetch_session(sid) == before
    assert await seeder.count_sessions() == 1


async def test_revoking_a_foreign_session_never_waits_on_its_row_lock(client, seeder, db_session):
    """El filtro por propietario va en la consulta bloqueante: una fila ajena no se espera."""
    import asyncio
    import time

    await seeder.create_user()
    await seeder.create_user(username="otro", email="otro@example.test")
    foreign, _, _ = await login_session(client, identificador="otro")
    _, headers, _ = await login_session(client)

    # Otra conexion retiene el bloqueo de la fila ajena durante toda la solicitud.
    await db_session.execute(
        text("SELECT 1 FROM iam.sesion WHERE id = :id FOR UPDATE"), {"id": foreign}
    )
    try:
        started = time.monotonic()
        response = await asyncio.wait_for(
            client.delete(f"{PATH}/{foreign}", headers=headers), timeout=5
        )
        elapsed = time.monotonic() - started
    finally:
        await db_session.rollback()

    assert response.status_code == 404
    assert response.json() == {"detail": "Recurso no encontrado"}
    assert elapsed < 1.5
