"""Contrato aditivo de aviso: politica configurada y tope absoluto, sin secretos."""

import logging
from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from nexora.identity_access.infrastructure.security.token_service import JwtTokenService
from tests.integration.conftest import PASSWORD, Seeder
from tests.integration.test_auth_api import REFRESH_URL, csrf_headers, do_login
from tests.integration.test_session_management import sid_from_access
from tests.support.fakes import FixedClock


@pytest.mark.parametrize("custom_policy", [False, True])
async def test_login_and_refresh_expose_warning_policy_and_unchanged_absolute_cap(
    app: FastAPI,
    client: AsyncClient,
    seeder: Seeder,
    caplog: pytest.LogCaptureFixture,
    custom_policy: bool,
) -> None:
    settings = app.state.container.settings
    if custom_policy:
        settings = settings.model_copy(
            update={
                "session_idle_timeout_minutes": 15,
                "session_warning_seconds": 90,
                "session_absolute_timeout_hours": 48,
                "refresh_token_ttl_days": 1,
            }
        )
        app.state.container = replace(
            app.state.container, settings=settings, tokens=JwtTokenService(settings)
        )
    # Ambos instantes quedan en el pasado para respetar la validacion JWT de iat real.
    clock = FixedClock(datetime.now(UTC) - timedelta(minutes=2))
    app.state.container = replace(app.state.container, clock=clock)
    await seeder.create_user()
    with caplog.at_level(logging.INFO, logger="nexora.auth"):
        login = await do_login(client)
        assert login.status_code == 200
        sid = sid_from_access(login.json()["access_token"])
        clock.advance(timedelta(minutes=1))
        refresh = await client.post(REFRESH_URL, headers=csrf_headers(client))
    assert refresh.status_code == 200
    for response in (login, refresh):
        body = response.json()
        assert type(body["idle_timeout_seconds"]) is int
        assert body["idle_timeout_seconds"] == settings.session_idle_timeout_minutes * 60
        assert type(body["warning_seconds"]) is int
        assert body["warning_seconds"] == (90 if custom_policy else 120)
        assert body["token_type"] == "bearer"
        assert body["expires_in"] == 600
        absolute = datetime.fromisoformat(body["session_expires_at"])
        assert absolute.tzinfo is not None
        assert absolute.utcoffset() == timedelta(0)
        assert absolute == clock.now() - timedelta(minutes=1) + timedelta(
            hours=settings.session_absolute_timeout_hours
        )
        assert "refresh_token" not in body
        assert "refresh_token_jti" not in body
        assert "hash_contrasena" not in response.text
        assert body["access_token"] not in caplog.text
        assert len(response.headers.get_list("set-cookie")) == 2
    assert login.json()["session_expires_at"] == refresh.json()["session_expires_at"]
    stored = await seeder.fetch_session(sid)
    assert datetime.fromisoformat(login.json()["session_expires_at"]) == stored["fecha_vencimiento"]
    if custom_policy:
        claims = app.state.container.tokens.decode_refresh_token(
            client.cookies[settings.refresh_cookie_name]
        )
        assert claims.expires_at < datetime.fromisoformat(refresh.json()["session_expires_at"])
    assert client.cookies[settings.refresh_cookie_name] not in caplog.text
    assert client.cookies[settings.csrf_cookie_name] not in caplog.text
    assert PASSWORD not in caplog.text
    assert await seeder.count_sessions() == 1
