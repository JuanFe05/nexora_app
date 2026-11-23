"""Verificaciones sin conexión: DDL reversible y sesiones independientes por instantánea."""

import importlib
import io
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.dialects import postgresql

from nexora.statistics.infrastructure.persistence.mappers import fee_to_read
from nexora.statistics.infrastructure.persistence.models import ModeratorFeeModel
from nexora.statistics.infrastructure.persistence.repositories import DatabaseModeratorFeeSnapshot


def test_migration_upgrade_and_downgrade_offline() -> None:
    migration = importlib.import_module("nexora.migrations.versions.0004_moderator_fees")
    assert migration.down_revision == "0003_fix_statistics_perms"
    output = io.StringIO()
    context = MigrationContext.configure(
        dialect=postgresql.dialect(), opts={"as_sql": True, "output_buffer": output,
                                          "literal_binds": True},
    )
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE SCHEMA statistics" in sql
    assert "CREATE TABLE statistics.cuota_moderadora" in sql
    assert "REFERENCES iam.usuario (id) ON DELETE SET NULL" in sql
    assert "TIMESTAMP WITH TIME ZONE" in sql
    assert "5000, 20100, 52800" in sql and "2026" in sql
    for name in ("vigencia_valida", "importes_validos", "importes_unicos"):
        assert f"ck_cuota_moderadora_{name}" in sql
    assert sql.index("DROP TABLE") < sql.index("DROP FUNCTION") < sql.index("DROP SCHEMA")


async def test_application_adapter_opens_closes_each_session_even_on_error() -> None:
    sessions: list[Any] = []
    closed: list[Any] = []

    async def factory() -> Any:
        session = AsyncMock()
        result = session.execute.return_value
        result.all = lambda: [(2026, [len(sessions) + 1])]
        sessions.append(session)
        try:
            yield session
        finally:
            closed.append(session)

    adapter = DatabaseModeratorFeeSnapshot(factory)
    assert await adapter.snapshot() == {2026: frozenset({2})}
    assert await adapter.snapshot() == {2026: frozenset({3})}
    assert len(sessions) == 2 and closed == sessions and sessions[0] is not sessions[1]

    @asynccontextmanager
    async def failure() -> Any:
        session = AsyncMock()
        session.execute.side_effect = RuntimeError("fallo sintético")
        try:
            yield session
        finally:
            closed.append(session)

    import pytest

    with pytest.raises(RuntimeError, match="fallo sintético"):
        await DatabaseModeratorFeeSnapshot(failure.__wrapped__).snapshot()
    assert len(closed) == 3


def test_fee_mapper_preserves_seed_null_audit_and_readable_user_name() -> None:
    model = ModeratorFeeModel(year=2026, amounts=[52800, 5000],
                              updated_by=None, updated_at=datetime(2026, 1, 1, tzinfo=UTC))
    row = fee_to_read(model, None)
    assert row.actualizado_por is None and row.importes == (5000, 52800)
    assert row.actualizado_en.tzinfo is UTC
    assert fee_to_read(model, "Ana María Pérez Díaz").actualizado_por == "Ana María Pérez Díaz"
