"""Lector de solo lectura para SQL Server (pyodbc + SQLAlchemy sincrono en un hilo)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Engine, bindparam, create_engine, event, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError

from nexora.integration_management.application.ports import (
    ExternalQueryFailed,
    ExternalSourceUnavailable,
    ReadOnlyQuery,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SqlServerConfig:
    host: str
    port: int
    database: str
    user: str
    password: str = field(repr=False)
    driver: str = "ODBC Driver 18 for SQL Server"
    trust_server_certificate: bool = False
    connect_timeout_seconds: int = 10
    query_timeout_seconds: int = 120


def _odbc_value(value: str) -> str:
    """Escapa un valor para la cadena ODBC: `{...}` con `}` duplicado."""
    return "{" + value.replace("}", "}}") + "}"


def build_odbc_connection_string(config: SqlServerConfig) -> str:
    trust = "yes" if config.trust_server_certificate else "no"
    return ";".join(
        [
            f"DRIVER={_odbc_value(config.driver)}",
            f"SERVER={config.host},{config.port}",
            f"DATABASE={_odbc_value(config.database)}",
            f"UID={_odbc_value(config.user)}",
            f"PWD={_odbc_value(config.password)}",
            "Encrypt=yes",
            f"TrustServerCertificate={trust}",
            "ApplicationIntent=ReadOnly",
        ]
    )


def create_sqlserver_engine(config: SqlServerConfig) -> Engine:
    url = URL.create("mssql+pyodbc", query={"odbc_connect": build_odbc_connection_string(config)})
    engine = create_engine(
        url,
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=2,
        isolation_level="AUTOCOMMIT",  # solo lectura: sin transacciones largas
        connect_args={"timeout": config.connect_timeout_seconds},
    )

    @event.listens_for(engine, "connect")
    def _set_query_timeout(dbapi_connection: Any, _: Any) -> None:
        dbapi_connection.timeout = config.query_timeout_seconds

    return engine


class SqlServerReadOnlyReader:
    """Ejecuta consultas nombradas con parametros enlazados. No expone SQL libre."""

    def __init__(self, config: SqlServerConfig | None, *, engine: Engine | None = None) -> None:
        self._config = config
        self._engine = engine

    @property
    def configured(self) -> bool:
        return self._engine is not None or self._config is not None

    def _get_engine(self) -> Engine:
        if self._engine is None:
            if self._config is None:
                raise ExternalSourceUnavailable("SQL Server no esta configurado")
            self._engine = create_sqlserver_engine(self._config)
        return self._engine

    async def fetch_all(
        self, query: ReadOnlyQuery, params: Mapping[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        engine = self._get_engine()
        return await asyncio.to_thread(self._run, engine, query, dict(params or {}))

    @staticmethod
    def _run(engine: Engine, query: ReadOnlyQuery, params: dict[str, Any]) -> list[dict[str, Any]]:
        statement = text(query.sql)
        if query.list_params:
            statement = statement.bindparams(
                *(bindparam(name, expanding=True) for name in sorted(query.list_params))
            )
        try:
            with engine.connect() as connection:
                return [dict(row) for row in connection.execute(statement, params).mappings()]
        except SQLAlchemyError as exc:
            # Nunca se registran parametros ni cadena de conexion: pueden contener secretos.
            logger.error("Fallo la consulta externa '%s': %s", query.name, type(exc).__name__)
            raise ExternalQueryFailed(query.name) from exc

    def dispose(self) -> None:
        if self._engine is not None:
            self._engine.dispose()
