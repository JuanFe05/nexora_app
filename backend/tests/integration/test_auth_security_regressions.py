"""Regresiones de seguridad detectadas en la verificacion independiente (S5, S6, S8, S9).

Cada prueba fija un defecto concreto para que no vuelva:
1. la cookie CSRF tenia el mismo \`Path\` restringido que la de refresh y el front no podia leerla;
2. un identificador de solo espacios escapaba como error 500;
3. un claim obligatorio ausente o malformado escapaba como \`KeyError\`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import jwt
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Request

from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.exceptions.identity import InvalidToken
from nexora.identity_access.infrastructure.security.token_service import JwtTokenService
from tests.integration.conftest import ORIGIN, Seeder
from tests.integration.test_auth_api import LOGIN_URL, csrf_headers, do_login

SPA_ROOT = "http://testserver/"


async def test_el_front_puede_leer_la_cookie_csrf_desde_la_raiz(
    client: AsyncClient, seeder: Seeder
) -> None:
    """La cookie CSRF debe ser legible fuera de /api/v1/auth; la de refresh, no."""
    await seeder.create_user()
    assert (await do_login(client)).status_code == 200

    en_la_raiz = Request("GET", SPA_ROOT)
    client.cookies.set_cookie_header(en_la_raiz)
    cookies_en_la_raiz = en_la_raiz.headers.get("cookie", "")

    assert "nexora_csrf_token=" in cookies_en_la_raiz
    assert "nexora_refresh_token=" not in cookies_en_la_raiz


async def test_logout_borra_la_cookie_csrf_en_su_propia_ruta(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    await do_login(client)

    response = await client.post("/api/v1/auth/logout", headers=csrf_headers(client))

    assert response.status_code == 204
    en_la_raiz = Request("GET", SPA_ROOT)
    client.cookies.set_cookie_header(en_la_raiz)
    assert "nexora_csrf_token=" not in en_la_raiz.headers.get("cookie", "")


@pytest.mark.parametrize("identificador", ["   ", "\t", ""])
async def test_un_identificador_vacio_se_rechaza_sin_error_500(
    app: FastAPI, seeder: Seeder, identificador: str
) -> None:
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            LOGIN_URL,
            json={"identificador": identificador, "contrasena": "lo-que-sea"},
            headers={"origin": ORIGIN},
        )

    assert response.status_code == 422
    assert await seeder.count_sessions() == 0


@pytest.mark.parametrize("claim", ["sid", "sub", "jti"])
def test_un_claim_obligatorio_ausente_es_token_invalido(settings: Settings, claim: str) -> None:
    service = JwtTokenService(settings)
    issued = service.issue_access_token(user_id=uuid4(), session_id=uuid4(), now=datetime.now(UTC))
    payload = jwt.decode(issued.value, options={"verify_signature": False})
    del payload[claim]
    manipulado = jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )

    with pytest.raises(InvalidToken):
        service.decode_access_token(manipulado)


def test_un_claim_malformado_es_token_invalido(settings: Settings) -> None:
    service = JwtTokenService(settings)
    issued = service.issue_access_token(user_id=uuid4(), session_id=uuid4(), now=datetime.now(UTC))
    payload = jwt.decode(issued.value, options={"verify_signature": False})
    payload["sid"] = "no-es-un-uuid"
    manipulado = jwt.encode(
        payload, settings.jwt_secret.get_secret_value(), algorithm=settings.jwt_algorithm
    )

    with pytest.raises(InvalidToken):
        service.decode_access_token(manipulado)


def test_produccion_rechaza_el_secreto_de_desarrollo() -> None:
    with pytest.raises(ValueError, match="secreto de desarrollo"):
        Settings(environment="production", _env_file=None)


def test_produccion_rechaza_un_secreto_corto() -> None:
    with pytest.raises(ValueError, match="32 caracteres"):
        Settings(environment="production", jwt_secret="corto", _env_file=None)
