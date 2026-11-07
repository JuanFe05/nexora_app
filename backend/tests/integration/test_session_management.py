"""Sesion deslizante, rotacion concurrente y logout global a traves de HTTP real."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from tests.integration.conftest import ORIGIN, Seeder
from tests.integration.test_auth_api import ME_URL, REFRESH_URL, csrf_headers, do_login
from tests.support.fakes import FixedClock

LOGOUT_ALL_URL = "/api/v1/auth/logout-all"


def sid_from_access(token: str):
    from uuid import UUID

    return UUID(jwt.decode(token, options={"verify_signature": False})["sid"])


def cookie_snapshot(client: AsyncClient) -> dict[str, str]:
    return {
        "nexora_refresh_token": client.cookies["nexora_refresh_token"],
        "nexora_csrf_token": client.cookies["nexora_csrf_token"],
    }


async def refresh_with_snapshot(app: FastAPI, cookies: dict[str, str]):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver", cookies=cookies
    ) as client:
        return await client.post(
            REFRESH_URL,
            headers={"origin": ORIGIN, "X-CSRF-Token": cookies["nexora_csrf_token"]},
        )


@pytest.mark.parametrize("concurrent", [False, True])
async def test_duplicate_refresh_and_lost_response_keep_session_alive(
    app: FastAPI, client: AsyncClient, seeder: Seeder, concurrent: bool
) -> None:
    await seeder.create_user()
    login = await do_login(client)
    access = login.json()["access_token"]
    snapshot = cookie_snapshot(client)
    sid = sid_from_access(access)
    before = await seeder.fetch_session(sid)
    if concurrent:
        first, retry = await asyncio.gather(
            refresh_with_snapshot(app, snapshot), refresh_with_snapshot(app, snapshot)
        )
    else:
        first = await refresh_with_snapshot(app, snapshot)
        retry = await refresh_with_snapshot(app, snapshot)
    assert [first.status_code, retry.status_code] == [200, 200]
    for response in (first, retry):
        assert set(response.json()) == {"access_token", "token_type", "expires_in"}
        assert response.json()["expires_in"] == 600
        assert response.json()["token_type"] == "bearer"
        assert len(response.headers.get_list("set-cookie")) == 2
        assert (await client.get(
            ME_URL, headers={"Authorization": f"Bearer {response.json()['access_token']}"}
        )).status_code == 200
    after = await seeder.fetch_session(sid)
    assert after["fecha_revocacion"] is None
    assert after["fecha_vencimiento"] == before["fecha_vencimiento"]
    assert await seeder.count_sessions() == 1


async def test_previous_refresh_beyond_grace_revokes_and_rejects_access(
    app: FastAPI, client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    access = (await do_login(client)).json()["access_token"]
    original = cookie_snapshot(client)
    sid = sid_from_access(access)
    assert (await client.post(REFRESH_URL, headers=csrf_headers(client))).status_code == 200
    before = await seeder.fetch_session(sid)
    clock = FixedClock(datetime.now(UTC) + timedelta(seconds=31))
    app.state.container = replace(app.state.container, clock=clock)
    reused = await refresh_with_snapshot(app, original)
    assert reused.status_code == 401
    assert reused.json() == {"detail": "Refresh token reutilizado"}
    assert reused.headers.get_list("set-cookie") == []
    after = await seeder.fetch_session(sid)
    assert after["fecha_revocacion"] == clock.now()
    assert after["refresh_token_jti"] == before["refresh_token_jti"]
    assert after["fecha_vencimiento"] == before["fecha_vencimiento"]
    denied = await client.get(ME_URL, headers={"Authorization": f"Bearer {access}"})
    assert denied.status_code == 401
    assert await seeder.count_sessions() == 1


@pytest.mark.parametrize("endpoint", [ME_URL, REFRESH_URL])
@pytest.mark.parametrize("limit", ["idle", "absolute"])
async def test_expired_session_is_persistently_revoked(
    app: FastAPI, client: AsyncClient, seeder: Seeder, endpoint: str, limit: str
) -> None:
    await seeder.create_user()
    access = (await do_login(client)).json()["access_token"]
    sid = sid_from_access(access)
    clock = FixedClock(datetime.now(UTC))
    before = await seeder.fetch_session(sid)
    if limit == "idle":
        clock.advance(timedelta(minutes=30))
    else:
        # Esta rama tambien cruza exp del JWT refresh: aun asi se persiste la revocacion.
        clock.advance(timedelta(hours=12))
    app.state.container = replace(app.state.container, clock=clock)
    if endpoint == ME_URL:
        response = await client.get(endpoint, headers={"Authorization": f"Bearer {access}"})
    else:
        response = await client.post(endpoint, headers=csrf_headers(client))
    assert response.status_code == 401
    assert response.json() == {"detail": "Sesion no activa"}
    assert response.headers.get_list("set-cookie") == []
    after = await seeder.fetch_session(sid)
    assert after["fecha_revocacion"] == clock.now()
    assert after["refresh_token_jti"] == before["refresh_token_jti"]
    assert after["fecha_vencimiento"] == before["fecha_vencimiento"]
    assert await seeder.count_sessions() == 1


@pytest.mark.parametrize("seconds", [59, 60])
async def test_http_activity_touch_threshold(
    app: FastAPI, client: AsyncClient, seeder: Seeder, seconds: int
) -> None:
    await seeder.create_user()
    access = (await do_login(client)).json()["access_token"]
    sid = sid_from_access(access)
    before = await seeder.fetch_session(sid)
    clock = FixedClock(before["fecha_ultima_actividad"] + timedelta(seconds=seconds))
    app.state.container = replace(app.state.container, clock=clock)
    response = await client.get(ME_URL, headers={"Authorization": f"Bearer {access}"})
    assert response.status_code == 200
    after = await seeder.fetch_session(sid)
    assert after["fecha_ultima_actividad"] == (
        clock.now() if seconds == 60 else before["fecha_ultima_actividad"]
    )
    assert after["fecha_vencimiento"] == before["fecha_vencimiento"]
    assert after["fecha_revocacion"] is None


async def test_logout_all_revokes_every_own_session_and_clears_cookies(
    app: FastAPI, client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    await seeder.create_user(username="otro", email="otro@nexora.co")
    other_access = (await do_login(client, identificador="otro")).json()["access_token"]
    other_before = await seeder.fetch_session(sid_from_access(other_access))
    first_access = (await do_login(client)).json()["access_token"]
    first_snapshot = cookie_snapshot(client)
    second_access = (await do_login(client)).json()["access_token"]
    second_snapshot = cookie_snapshot(client)
    response = await client.post(
        LOGOUT_ALL_URL, headers={"Authorization": f"Bearer {second_access}"}
    )
    assert response.status_code == 204
    assert response.content == b""
    assert len(response.headers.get_list("set-cookie")) == 2
    assert all("Max-Age=0" in value for value in response.headers.get_list("set-cookie"))
    assert "nexora_refresh_token" not in client.cookies
    assert "nexora_csrf_token" not in client.cookies
    for access, snapshot in ((first_access, first_snapshot), (second_access, second_snapshot)):
        assert (await seeder.fetch_session(sid_from_access(access)))["fecha_revocacion"] is not None
        rejected = await client.get(ME_URL, headers={"Authorization": f"Bearer {access}"})
        assert rejected.status_code == 401
        assert rejected.json() == {"detail": "Sesion no activa"}
        rejected = await refresh_with_snapshot(app, snapshot)
        assert rejected.status_code == 401
        assert rejected.json() == {"detail": "Sesion no activa"}
    assert await seeder.fetch_session(sid_from_access(other_access)) == other_before
    allowed = await client.get(ME_URL, headers={"Authorization": f"Bearer {other_access}"})
    assert allowed.status_code == 200
    assert await seeder.count_sessions() == 3


async def test_logout_all_without_bearer_is_401_without_mutating_sessions(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    access = (await do_login(client)).json()["access_token"]
    before = await seeder.fetch_session(sid_from_access(access))
    response = await client.post(LOGOUT_ALL_URL)
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    assert response.headers.get_list("set-cookie") == []
    assert await seeder.fetch_session(sid_from_access(access)) == before
    assert await seeder.count_sessions() == 1
