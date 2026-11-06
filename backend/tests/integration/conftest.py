"""Infraestructura de pruebas de integracion y de API contra PostgreSQL real.

La base de pruebas se levanta con `docker compose up -d postgres-test` (puerto 45337).
Las migraciones de Alembic son el unico mecanismo que crea el esquema, igual que en produccion.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexora.bootstrap.app import create_app
from nexora.bootstrap.settings import Settings
from nexora.identity_access.infrastructure.security.password_hasher import Argon2PasswordHasher

#: El .env de la raiz es la fuente de configuracion local; la variable de entorno lo sobreescribe
#: (es lo que usa CI). El valor por defecto solo cubre un arranque sin configurar.
_ROOT_ENV = Path(__file__).resolve().parents[2].parent / ".env"
_DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://nexora:nexora@localhost:45337/nexora_test"


def _test_database_url() -> str:
    from_environment = os.getenv("NEXORA_TEST_DATABASE_URL")
    if from_environment:
        return from_environment
    if _ROOT_ENV.exists():
        from_file = dotenv_values(_ROOT_ENV).get("NEXORA_TEST_DATABASE_URL")
        if from_file:
            return from_file
    return _DEFAULT_TEST_DATABASE_URL


TEST_DATABASE_URL = _test_database_url()
PASSWORD = "Secreta123*"
ORIGIN = "http://localhost:5173"


@pytest.fixture(scope="session")
def settings() -> Settings:
    # `_env_file=None`: las pruebas no dependen del .env del desarrollador (por ejemplo, su
    # administrador inicial); cada prueba declara explicitamente lo que necesita.
    return Settings(
        _env_file=None,
        environment="testing",
        database_url=TEST_DATABASE_URL,
        jwt_secret=SecretStr("secreto-de-pruebas-de-al-menos-32-caracteres"),
        allowed_origins=(ORIGIN,),
        login_max_attempts=3,
        login_attempt_window_seconds=60,
        login_block_seconds=60,
    )


@pytest.fixture(scope="session", autouse=True)
def migrated_database(settings: Settings) -> Iterator[None]:
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", settings.database_url)
    config.cmd_opts = None
    os.environ["NEXORA_DATABASE_URL"] = settings.database_url
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield


@pytest.fixture
async def db_session(settings: Settings) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables(settings: Settings) -> AsyncIterator[None]:
    yield
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as connection:
        await connection.execute(
            text("TRUNCATE iam.sesion, iam.asignacion_rol, iam.rol_permiso, iam.rol, iam.usuario")
        )
    await engine.dispose()


@pytest.fixture
async def app(settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(settings)
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as http_client:
        yield http_client


class Seeder:
    """Siembra usuarios, roles y permisos directamente en la base de pruebas."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._hasher = Argon2PasswordHasher()

    async def create_user(
        self,
        *,
        username: str = "jperez",
        email: str = "jperez@nexora.co",
        password: str = PASSWORD,
        status: str = "activo",
    ) -> UUID:
        user_id = uuid4()
        await self._session.execute(
            text(
                "INSERT INTO iam.usuario (id, primer_nombre, primer_apellido, nombre_usuario,"
                " correo, hash_contrasena, estado)"
                " VALUES (:id, 'Juan', 'Perez', :username, :email, :hash, :status)"
            ),
            {
                "id": user_id,
                "username": username,
                "email": email,
                "hash": self._hasher.hash(password),
                "status": status,
            },
        )
        await self._session.commit()
        return user_id

    async def grant_role(
        self,
        user_id: UUID,
        *,
        role_code: str,
        permissions: tuple[str, ...] = (),
        role_status: str = "activo",
    ) -> UUID:
        role_id = uuid4()
        await self._session.execute(
            text(
                "INSERT INTO iam.rol (id, codigo, nombre, estado)"
                " VALUES (:id, :code, :code, :status)"
            ),
            {"id": role_id, "code": role_code, "status": role_status},
        )
        await self._session.execute(
            text("INSERT INTO iam.asignacion_rol (usuario_id, rol_id) VALUES (:user_id, :role_id)"),
            {"user_id": user_id, "role_id": role_id},
        )
        for code in permissions:
            await self._session.execute(
                text(
                    "INSERT INTO iam.rol_permiso (rol_id, permiso_id)"
                    " SELECT :role_id, id FROM iam.permiso WHERE codigo = :code"
                ),
                {"role_id": role_id, "code": code},
            )
        await self._session.commit()
        return role_id

    async def expire_session(self, session_id: UUID) -> None:
        await self._session.execute(
            text("UPDATE iam.sesion SET fecha_vencimiento = :moment WHERE id = :id"),
            {"id": session_id, "moment": datetime.now(UTC) - timedelta(minutes=1)},
        )
        await self._session.commit()

    async def fetch_session(self, session_id: UUID) -> dict[str, object] | None:
        row = (
            (
                await self._session.execute(
                    text(
                        "SELECT id, usuario_id, refresh_token_jti, direccion_ip, agente_usuario,"
                        " fecha_revocacion, fecha_vencimiento FROM iam.sesion WHERE id = :id"
                    ),
                    {"id": session_id},
                )
            )
            .mappings()
            .first()
        )
        return dict(row) if row else None

    async def count_sessions(self) -> int:
        return int(
            (await self._session.execute(text("SELECT count(*) FROM iam.sesion"))).scalar_one()
        )


@pytest.fixture
async def seeder(db_session: AsyncSession) -> Seeder:
    return Seeder(db_session)
