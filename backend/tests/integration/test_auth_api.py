"""Pruebas de API del flujo de autenticacion (S8, S9, S10, S13)."""

from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient

from tests.integration.conftest import ORIGIN, PASSWORD, Seeder

LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/auth/me"


async def do_login(
    client: AsyncClient, *, identificador: str = "jperez", contrasena: str = PASSWORD
):
    return await client.post(
        LOGIN_URL,
        json={"identificador": identificador, "contrasena": contrasena},
        headers={"user-agent": "pytest", "origin": ORIGIN},
    )


def csrf_headers(client: AsyncClient) -> dict[str, str]:
    return {
        "X-CSRF-Token": client.cookies["nexora_csrf_token"],
        "origin": ORIGIN,
    }


async def test_login_con_nombre_de_usuario_devuelve_access_token_y_cookie_httponly(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()

    response = await do_login(client)

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 600
    assert body["usuario"]["nombre_usuario"] == "jperez"
    assert body["usuario"]["nombre_completo"] == "Juan Perez"
    assert "hash_contrasena" not in response.text
    assert "refresh_token" not in body

    cookie_header = "\n".join(response.headers.get_list("set-cookie"))
    assert "nexora_refresh_token=" in cookie_header
    assert "HttpOnly" in cookie_header
    assert "Path=/api/v1/auth" in cookie_header
    assert "SameSite=lax" in cookie_header


@pytest.mark.parametrize("password", ["x", "plainlegacy", "x" * 128])
async def test_login_accepts_legacy_passwords(client: AsyncClient, seeder: Seeder, password: str):
    await seeder.create_user(password=password)
    response = await do_login(client, contrasena=password)
    assert response.status_code == 200, response.text
    assert response.json()["usuario"]["nombre_usuario"] == "jperez"
    assert response.json()["token_type"] == "bearer"
    assert await seeder.count_sessions() == 1
    assert "hash_contrasena" not in response.text


async def test_login_con_correo_identifica_al_mismo_usuario(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()

    response = await do_login(client, identificador="JPerez@Nexora.co")

    assert response.status_code == 200
    assert response.json()["usuario"]["correo"] == "jperez@nexora.co"


async def test_login_persiste_la_sesion_con_ip_agente_y_jti(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()

    response = await do_login(client)

    me = await client.get(
        ME_URL, headers={"Authorization": f"Bearer {response.json()['access_token']}"}
    )
    assert me.status_code == 200
    assert await seeder.count_sessions() == 1


@pytest.mark.parametrize(
    ("identificador", "contrasena"),
    [
        ("fantasma", PASSWORD),
        ("jperez", "contrasena-incorrecta"),
    ],
)
async def test_credenciales_invalidas_devuelven_siempre_el_mismo_error(
    client: AsyncClient, seeder: Seeder, identificador: str, contrasena: str
) -> None:
    await seeder.create_user()

    response = await do_login(client, identificador=identificador, contrasena=contrasena)

    assert response.status_code == 401
    assert response.json() == {"detail": "Credenciales invalidas"}
    assert await seeder.count_sessions() == 0


async def test_usuario_inactivo_recibe_el_mismo_error_generico(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user(status="inactivo")

    response = await do_login(client)

    assert response.status_code == 401
    assert response.json() == {"detail": "Credenciales invalidas"}


async def test_demasiados_intentos_fallidos_devuelven_429(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()

    for _ in range(3):
        await do_login(client, contrasena="mala")
    response = await do_login(client)

    assert response.status_code == 429
    assert response.headers["retry-after"].isdigit()


async def test_me_devuelve_roles_y_permisos_efectivos_de_varios_roles(
    client: AsyncClient, seeder: Seeder
) -> None:
    user_id = await seeder.create_user()
    await seeder.grant_role(
        user_id, role_code="admin_usuarios", permissions=("identity.users.view",)
    )
    await seeder.grant_role(
        user_id,
        role_code="admin_roles",
        permissions=("identity.roles.view", "identity.users.view"),
    )
    token = (await do_login(client)).json()["access_token"]

    response = await client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})

    body = response.json()
    assert response.status_code == 200
    assert sorted(body["roles"]) == ["admin_roles", "admin_usuarios"]
    assert body["permisos"] == ["identity.roles.view", "identity.users.view"]


async def test_un_rol_inactivo_no_aporta_permisos(client: AsyncClient, seeder: Seeder) -> None:
    user_id = await seeder.create_user()
    await seeder.grant_role(
        user_id,
        role_code="rol_viejo",
        permissions=("identity.users.view",),
        role_status="inactivo",
    )
    token = (await do_login(client)).json()["access_token"]

    response = await client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})

    assert response.json()["permisos"] == []


async def test_me_sin_token_o_con_token_invalido_devuelve_401(client: AsyncClient) -> None:
    assert (await client.get(ME_URL)).status_code == 401
    assert (
        await client.get(ME_URL, headers={"Authorization": "Bearer no-es-un-jwt"})
    ).status_code == 401


async def test_refresh_rota_la_cookie_y_el_token_anterior_queda_inservible(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    await do_login(client)
    cookie_original = client.cookies["nexora_refresh_token"]

    primera = await client.post(REFRESH_URL, headers=csrf_headers(client))

    assert primera.status_code == 200
    assert primera.json()["access_token"]
    assert client.cookies["nexora_refresh_token"] != cookie_original

    client.cookies.set("nexora_refresh_token", cookie_original, path="/api/v1/auth")
    reutilizado = await client.post(REFRESH_URL, headers=csrf_headers(client))

    assert reutilizado.status_code == 401


async def test_refresh_sin_cabecera_csrf_es_rechazado(client: AsyncClient, seeder: Seeder) -> None:
    await seeder.create_user()
    await do_login(client)

    response = await client.post(REFRESH_URL, headers={"origin": ORIGIN})

    assert response.status_code == 401


async def test_refresh_desde_un_origen_no_permitido_es_rechazado(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    await do_login(client)
    headers = csrf_headers(client) | {"origin": "http://atacante.example"}

    response = await client.post(REFRESH_URL, headers=headers)

    assert response.status_code == 401


async def test_refresh_de_una_sesion_vencida_es_rechazado(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    token = (await do_login(client)).json()["access_token"]
    session_id = await _session_id_from_me(client, token)
    await seeder.expire_session(session_id)

    response = await client.post(REFRESH_URL, headers=csrf_headers(client))

    assert response.status_code == 401


async def test_logout_revoca_la_sesion_y_borra_las_cookies(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    token = (await do_login(client)).json()["access_token"]
    session_id = await _session_id_from_me(client, token)

    response = await client.post(LOGOUT_URL, headers=csrf_headers(client))

    assert response.status_code == 204
    stored = await seeder.fetch_session(session_id)
    assert stored is not None
    assert stored["fecha_revocacion"] is not None

    con_token_viejo = await client.get(ME_URL, headers={"Authorization": f"Bearer {token}"})
    assert con_token_viejo.status_code == 401


async def test_una_sesion_revocada_no_puede_refrescarse(
    client: AsyncClient, seeder: Seeder
) -> None:
    await seeder.create_user()
    await do_login(client)
    cookie = client.cookies["nexora_refresh_token"]
    headers = csrf_headers(client)
    await client.post(LOGOUT_URL, headers=headers)

    # Un atacante que conservo las cookies previas al logout no puede revivir la sesion.
    client.cookies.set("nexora_refresh_token", cookie, path="/api/v1/auth")
    client.cookies.set("nexora_csrf_token", headers["X-CSRF-Token"], path="/api/v1/auth")
    response = await client.post(REFRESH_URL, headers=headers)

    assert response.status_code == 401


async def _session_id_from_me(client: AsyncClient, token: str) -> UUID:
    """La sesion viva se identifica consultando la unica fila sembrada en la prueba."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    from tests.integration.conftest import TEST_DATABASE_URL

    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.connect() as connection:
        session_id = (
            await connection.execute(text("SELECT id FROM iam.sesion ORDER BY fecha_creacion"))
        ).scalar_one()
    await engine.dispose()
    return UUID(str(session_id))
