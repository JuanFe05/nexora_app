"""Lector de solo lectura para SQL Server (pyodbc + SQLAlchemy sincrono en un hilo)."""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import AsyncIterator, Iterator, Mapping
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Engine, bindparam, create_engine, event, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool

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
        # Sin pool: cada operacion abre su conexion al iniciar y la cierra al terminar.
        poolclass=NullPool,
        isolation_level="AUTOCOMMIT",  # solo lectura: sin transacciones largas
        connect_args={"timeout": config.connect_timeout_seconds},
    )

    @event.listens_for(engine, "connect")
    def _set_query_timeout(dbapi_connection: Any, _: Any) -> None:
        dbapi_connection.timeout = config.query_timeout_seconds

    return engine


DEFAULT_CHUNK_SIZE = 2000


def _statement(query: ReadOnlyQuery) -> Any:
    statement = text(query.sql)
    if query.list_params:
        statement = statement.bindparams(
            *(bindparam(name, expanding=True) for name in sorted(query.list_params))
        )
    return statement


def _log_failure(query: ReadOnlyQuery, exc: SQLAlchemyError) -> None:
    # Nunca se registran parametros ni cadena de conexion: pueden contener secretos.
    logger.error("Fallo la consulta externa '%s': %s", query.name, type(exc).__name__)


class _ChunkCursor:
    """Lectura por bloques con cierre seguro; `close` espera a un bloque en curso."""

    def __init__(
        self, engine: Engine, query: ReadOnlyQuery, params: dict[str, Any], size: int
    ) -> None:
        self._engine = engine
        self._query = query
        self._params = params
        self._size = size
        self._lock = threading.Lock()
        self._connection: Any = None
        self._partitions: Iterator[Any] | None = None
        self._closed = False

    def next_chunk(self) -> list[dict[str, Any]]:
        with self._lock:
            if self._closed:
                return []
            try:
                if self._partitions is None:
                    self._connection = self._engine.connect()
                    result = self._connection.execution_options(
                        stream_results=True, max_row_buffer=self._size
                    ).execute(_statement(self._query), self._params)
                    self._partitions = iter(result.mappings().partitions(self._size))
                chunk = next(self._partitions, None)
            except SQLAlchemyError as exc:
                _log_failure(self._query, exc)
                self._release()
                raise ExternalQueryFailed(self._query.name) from exc
            if chunk is None:
                self._release()
                return []
            return [dict(row) for row in chunk]

    def close(self) -> None:
        with self._lock:
            self._release()

    def _release(self) -> None:
        self._closed = True
        self._partitions = None
        connection, self._connection = self._connection, None
        if connection is not None:
            connection.close()


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

    async def stream(
        self,
        query: ReadOnlyQuery,
        params: Mapping[str, Any] | None = None,
        *,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
    ) -> AsyncIterator[list[dict[str, Any]]]:
        """Entrega el resultado por bloques (`fetchmany`) sin materializarlo completo.

        La conexion se abre al primer bloque y se cierra siempre al agotar, fallar o cancelar.
        """
        if chunk_size < 1:
            raise ValueError("chunk_size debe ser positivo")
        cursor = _ChunkCursor(self._get_engine(), query, dict(params or {}), chunk_size)
        try:
            while chunk := await asyncio.to_thread(cursor.next_chunk):
                yield chunk
        finally:
            await asyncio.shield(asyncio.to_thread(cursor.close))

    @staticmethod
    def _run(engine: Engine, query: ReadOnlyQuery, params: dict[str, Any]) -> list[dict[str, Any]]:
        try:
            with engine.connect() as connection:
                return [
                    dict(row) for row in connection.execute(_statement(query), params).mappings()
                ]
        except SQLAlchemyError as exc:
            _log_failure(query, exc)
            raise ExternalQueryFailed(query.name) from exc

    def dispose(self) -> None:
        if self._engine is not None:
            self._engine.dispose()
