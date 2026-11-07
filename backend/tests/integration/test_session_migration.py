"""Ida/vuelta de 0002 sobre la base de pruebas, sin modificar filas existentes."""

from __future__ import annotations

from argparse import Namespace
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.infrastructure.persistence.repositories import (
    SqlAlchemySessionRepository,
)
from tests.integration.conftest import Seeder


@pytest.fixture
async def existing_session(seeder: Seeder, db_session: AsyncSession) -> Session:
    uid = await seeder.create_user(username="migration", email="migration@nexora.co")
    now = datetime.now(UTC)
    session = Session(
        id=uuid4(), user_id=uid, refresh_token_jti=uuid4(),
        created_at=now, last_activity_at=now, expires_at=now + timedelta(days=7),
    )
    await SqlAlchemySessionRepository(db_session).add(session)
    await db_session.commit()
    return session


def test_session_migration_upgrade_downgrade_upgrade(
    settings: Settings, existing_session: Session
) -> None:
    config = Config("alembic.ini")
    config.cmd_opts = Namespace(x=[f"url={settings.database_url}"])
    engine = create_engine(settings.database_url)
    expected_columns = {"refresh_token_jti_anterior", "fecha_rotacion_refresh"}
    try:
        command.upgrade(config, "head")
        command.downgrade(config, "-1")
        columns = {column["name"] for column in inspect(engine).get_columns("sesion", schema="iam")}
        assert not expected_columns & columns
        command.upgrade(config, "head")
        columns = {
            column["name"]: column for column in inspect(engine).get_columns("sesion", schema="iam")
        }
        assert expected_columns <= columns.keys()
        assert all(columns[name]["nullable"] for name in expected_columns)
        assert str(columns["refresh_token_jti_anterior"]["type"]) == "UUID"
        assert columns["fecha_rotacion_refresh"]["type"].timezone is True
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT refresh_token_jti, fecha_vencimiento, refresh_token_jti_anterior,"
                " fecha_rotacion_refresh FROM iam.sesion WHERE id = :sid"
            ), {"sid": existing_session.id}).one()
        assert row == (
            existing_session.refresh_token_jti, existing_session.expires_at, None, None
        )
    finally:
        engine.dispose()
