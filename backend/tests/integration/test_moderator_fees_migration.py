"""Ida/vuelta de 0004 exclusivamente con el fixture PostgreSQL de pruebas."""

from argparse import Namespace

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexora.bootstrap.settings import Settings


def test_moderator_fees_migration_upgrade_downgrade_upgrade(settings: Settings) -> None:
    config = Config("alembic.ini")
    config.cmd_opts = Namespace(x=[f"url={settings.database_url}"])
    engine = create_engine(settings.database_url)
    try:
        command.downgrade(config, "0003_fix_statistics_perms")
        assert not inspect(engine).has_table("cuota_moderadora", schema="statistics")
        command.upgrade(config, "head")
        columns = {c["name"]: c for c in inspect(engine).get_columns(
            "cuota_moderadora", schema="statistics"
        )}
        assert columns["actualizado_por"]["nullable"] is True
        assert columns["actualizado_en"]["type"].timezone is True
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT vigencia, importes, actualizado_por, actualizado_en "
                "FROM statistics.cuota_moderadora"
            )).one()
        assert row[:3] == (2026, [5000, 20100, 52800], None)
        assert row[3].tzinfo is not None
        for year, amounts in [(1999, [1]), (2101, [1]), (2027, []), (2027, [1, 1]),
                              (2027, [0]), (2027, [10_000_001]), (2027, [None]),
                              (2027, list(range(1, 12)))]:
            with pytest.raises(DBAPIError), engine.begin() as connection:
                connection.execute(text(
                    "INSERT INTO statistics.cuota_moderadora (vigencia, importes) "
                    "VALUES (:year, :amounts)"
                ), {"year": year, "amounts": amounts})
        command.downgrade(config, "0003_fix_statistics_perms")
        assert "statistics" not in inspect(engine).get_schema_names()
        command.upgrade(config, "head")
    finally:
        engine.dispose()
