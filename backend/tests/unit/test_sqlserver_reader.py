"""Pruebas del lector SQL Server: se usa SQLite como motor de reemplazo, sin red."""

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from nexora.integration_management.application.ports import (
    ExternalQueryFailed,
    ExternalSourceUnavailable,
    ReadOnlyQuery,
)
from nexora.integration_management.infrastructure.sqlserver import (
    SqlServerConfig,
    SqlServerReadOnlyReader,
    build_odbc_connection_string,
)


def _engine():
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE sede (unco INTEGER, dscrpcn TEXT)"))
        connection.execute(text("INSERT INTO sede VALUES (1,'A'),(2,'B'),(3,'C')"))
    return engine


def test_connection_string_escapes_secrets_and_is_read_only() -> None:
    config = SqlServerConfig("srv", 1433, "db", "user", "p}w;d", trust_server_certificate=True)

    result = build_odbc_connection_string(config)

    assert "PWD={p}}w;d}" in result
    assert "SERVER=srv,1433" in result
    assert "TrustServerCertificate=yes" in result
    assert "ApplicationIntent=ReadOnly" in result


async def test_unconfigured_reader_reports_unavailable() -> None:
    reader = SqlServerReadOnlyReader(None)

    with pytest.raises(ExternalSourceUnavailable):
        await reader.fetch_all(ReadOnlyQuery("x", "SELECT 1"))


async def test_list_params_are_bound_not_concatenated() -> None:
    reader = SqlServerReadOnlyReader(None, engine=_engine())
    query = ReadOnlyQuery(
        "sedes",
        "SELECT unco, dscrpcn FROM sede WHERE unco IN :ids ORDER BY unco",
        frozenset({"ids"}),
    )

    rows = await reader.fetch_all(query, {"ids": [1, 3]})

    assert rows == [{"unco": 1, "dscrpcn": "A"}, {"unco": 3, "dscrpcn": "C"}]


async def test_injection_text_in_list_param_is_inert() -> None:
    reader = SqlServerReadOnlyReader(None, engine=_engine())
    query = ReadOnlyQuery("x", "SELECT unco FROM sede WHERE dscrpcn IN :v", frozenset({"v"}))

    rows = await reader.fetch_all(query, {"v": ["A'; DROP TABLE sede;--"]})

    assert rows == []
    assert len(await reader.fetch_all(ReadOnlyQuery("n", "SELECT unco FROM sede"))) == 3


async def test_driver_error_is_translated_without_leaking_detail() -> None:
    reader = SqlServerReadOnlyReader(None, engine=_engine())

    with pytest.raises(ExternalQueryFailed) as error:
        await reader.fetch_all(ReadOnlyQuery("rota", "SELECT * FROM no_existe"))

    assert "no_existe" not in str(error.value)
