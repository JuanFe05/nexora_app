"""Autorizacion por permiso en el backend (S10)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient

from nexora.bootstrap.app import create_app
from nexora.bootstrap.settings import Settings
from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission
from tests.integration.conftest import ORIGIN, PASSWORD, Seeder

PROTECTED_URL = "/api/v1/demo/usuarios"


@pytest.fixture
async def protected_app(settings: Settings) -> AsyncIterator[FastAPI]:
    """App real mas una ruta de prueba que exige `identity.users.view`."""
    application = create_app(settings)

    @application.get(
        PROTECTED_URL, dependencies=[Depends(require_permission("identity.users.view"))]
    )
    async def listar_usuarios() -> dict[str, list[str]]:
        return {"usuarios": []}

    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def protected_client(protected_app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=protected_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


async def login(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "jperez", "contrasena": PASSWORD},
        headers={"origin": ORIGIN},
    )
    token: str = response.json()["access_token"]
    return token


async def test_usuario_con_el_permiso_accede(protected_client: AsyncClient, seeder: Seeder) -> None:
    user_id = await seeder.create_user()
    await seeder.grant_role(user_id, role_code="consulta", permissions=("identity.users.view",))
    token = await login(protected_client)

    response = await protected_client.get(
        PROTECTED_URL, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200


async def test_usuario_sin_el_permiso_recibe_403(
    protected_client: AsyncClient, seeder: Seeder
) -> None:
    user_id = await seeder.create_user()
    await seeder.grant_role(user_id, role_code="otro", permissions=("identity.roles.view",))
    token = await login(protected_client)

    response = await protected_client.get(
        PROTECTED_URL, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}


async def test_quitar_el_rol_corta_el_acceso_sin_reemitir_el_token(
    protected_client: AsyncClient, seeder: Seeder, db_session
) -> None:
    """Los permisos no viajan en el JWT: revocar el rol tiene efecto inmediato."""
    from sqlalchemy import text

    user_id = await seeder.create_user()
    await seeder.grant_role(user_id, role_code="consulta", permissions=("identity.users.view",))
    token = await login(protected_client)
    headers = {"Authorization": f"Bearer {token}"}
    assert (await protected_client.get(PROTECTED_URL, headers=headers)).status_code == 200

    await db_session.execute(
        text("DELETE FROM iam.asignacion_rol WHERE usuario_id = :id"), {"id": user_id}
    )
    await db_session.commit()

    assert (await protected_client.get(PROTECTED_URL, headers=headers)).status_code == 403


async def test_sin_token_la_ruta_protegida_devuelve_401(protected_client: AsyncClient) -> None:
    assert (await protected_client.get(PROTECTED_URL)).status_code == 401
