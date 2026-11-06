"""Siembra idempotente de roles, permisos y primer administrador (S1, S3, S4)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.bootstrap.access_initialization import initialize_access
from nexora.bootstrap.container import build_container
from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.exceptions.identity import AdministratorNotConfigured
from nexora.identity_access.domain.value_objects.access_catalog import (
    PERMISSION_CATALOG,
    SYSTEM_ROLES,
)
from tests.integration.conftest import ORIGIN

ADMIN_PASSWORD = "Clave-Admin-Inicial-9"


@pytest.fixture
def admin_settings(settings: Settings) -> Settings:
    return settings.model_copy(
        update={
            "bootstrap_admin_username": "admin",
            "bootstrap_admin_email": "admin@nexora.co",
            "bootstrap_admin_password": SecretStr(ADMIN_PASSWORD),
        }
    )


async def run_initialization(settings: Settings):  # type: ignore[no-untyped-def]
    container = build_container(settings)
    try:
        return await initialize_access(container)
    finally:
        await container.database.dispose()


async def count(session: AsyncSession, table: str) -> int:
    query = text(f"SELECT count(*) FROM iam.{table}")  # noqa: S608
    return int((await session.execute(query)).scalar_one())


async def test_la_siembra_puebla_roles_permisos_y_administrador(
    admin_settings: Settings, db_session: AsyncSession
) -> None:
    result = await run_initialization(admin_settings)

    assert result.admin_created is True
    roles = (await db_session.execute(text("SELECT codigo FROM iam.rol ORDER BY codigo"))).scalars()
    assert list(roles) == sorted(spec.code for spec in SYSTEM_ROLES)
    catalog = {spec.code for spec in PERMISSION_CATALOG}
    stored = set((await db_session.execute(text("SELECT codigo FROM iam.permiso"))).scalars())
    assert catalog <= stored
    granted = set(
        (
            await db_session.execute(
                text(
                    "SELECT p.codigo FROM iam.rol_permiso rp"
                    " JOIN iam.rol r ON r.id = rp.rol_id JOIN iam.permiso p ON p.id = rp.permiso_id"
                    " WHERE r.codigo = 'ADMINISTRADOR'"
                )
            )
        ).scalars()
    )
    assert catalog <= granted
    row = (
        await db_session.execute(
            text(
                "SELECT u.hash_contrasena, u.estado, r.codigo FROM iam.usuario u"
                " JOIN iam.asignacion_rol a ON a.usuario_id = u.id"
                " JOIN iam.rol r ON r.id = a.rol_id WHERE u.nombre_usuario = 'admin'"
            )
        )
    ).one()
    assert row.hash_contrasena.startswith("$argon2id$")
    assert ADMIN_PASSWORD not in row.hash_contrasena
    assert (row.estado, row.codigo) == ("activo", "ADMINISTRADOR")


async def test_la_siembra_es_idempotente(
    admin_settings: Settings, db_session: AsyncSession
) -> None:
    await run_initialization(admin_settings)
    tables = ("rol", "permiso", "rol_permiso", "usuario", "asignacion_rol")
    before = {table: await count(db_session, table) for table in tables}

    second = await run_initialization(admin_settings)

    assert second.admin_created is False
    assert {table: await count(db_session, table) for table in tables} == before


async def test_el_administrador_inicial_puede_iniciar_sesion(
    admin_settings: Settings, client: AsyncClient
) -> None:
    await run_initialization(admin_settings)

    response = await client.post(
        "/api/v1/auth/login",
        json={"identificador": "admin", "contrasena": ADMIN_PASSWORD},
        headers={"origin": ORIGIN},
    )

    assert response.status_code == 200


async def test_sin_credenciales_siembra_roles_pero_no_crea_administrador(
    settings: Settings, db_session: AsyncSession
) -> None:
    result = await run_initialization(settings)

    assert (result.admin_created, result.admin_present) == (False, False)
    assert await count(db_session, "rol") == len(SYSTEM_ROLES)
    assert await count(db_session, "usuario") == 0


async def test_produccion_sin_administrador_ni_credenciales_falla_y_no_siembra(
    settings: Settings, db_session: AsyncSession
) -> None:
    production = settings.model_copy(update={"environment": "production"})

    with pytest.raises(AdministratorNotConfigured):
        await run_initialization(production)

    assert await count(db_session, "rol") == 0


async def test_con_un_administrador_activo_no_crea_otro(
    admin_settings: Settings, db_session: AsyncSession
) -> None:
    await run_initialization(admin_settings)
    other = admin_settings.model_copy(
        update={"bootstrap_admin_username": "otro", "bootstrap_admin_email": "otro@nexora.co"}
    )

    await run_initialization(other)

    assert await count(db_session, "usuario") == 1


def test_credenciales_parciales_se_rechazan() -> None:
    with pytest.raises(ValidationError, match="exige NEXORA_BOOTSTRAP_ADMIN_USERNAME"):
        Settings(_env_file=None, bootstrap_admin_username="admin")  # type: ignore[call-arg]


def test_contrasena_inicial_corta_se_rechaza() -> None:
    with pytest.raises(ValidationError, match="al menos 12 caracteres"):
        Settings(  # type: ignore[call-arg]
            _env_file=None,
            bootstrap_admin_username="admin",
            bootstrap_admin_email="admin@nexora.co",
            bootstrap_admin_password=SecretStr("corta"),
        )
