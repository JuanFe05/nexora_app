"""Composicion de dependencias de larga vida."""

from __future__ import annotations

from dataclasses import dataclass

from nexora.bootstrap.database import Database
from nexora.bootstrap.settings import Settings
from nexora.identity_access.infrastructure.security.login_throttle import InMemoryLoginThrottle
from nexora.identity_access.infrastructure.security.password_hasher import Argon2PasswordHasher
from nexora.identity_access.infrastructure.security.token_service import JwtTokenService
from nexora.integration_management.infrastructure.sqlserver import (
    SqlServerConfig,
    SqlServerReadOnlyReader,
)
from nexora.shared_kernel.clock import SystemClock


@dataclass(frozen=True, slots=True)
class Container:
    settings: Settings
    database: Database
    clock: SystemClock
    hasher: Argon2PasswordHasher
    tokens: JwtTokenService
    throttle: InMemoryLoginThrottle
    sqlserver: SqlServerReadOnlyReader


def _sqlserver_config(settings: Settings) -> SqlServerConfig | None:
    if not settings.mssql_configured:
        return None
    assert settings.mssql_host and settings.mssql_database and settings.mssql_user  # noqa: S101
    assert settings.mssql_password is not None  # noqa: S101
    return SqlServerConfig(
        host=settings.mssql_host,
        port=settings.mssql_port,
        database=settings.mssql_database,
        user=settings.mssql_user,
        password=settings.mssql_password.get_secret_value(),
        driver=settings.mssql_driver,
        trust_server_certificate=settings.mssql_trust_server_certificate,
        connect_timeout_seconds=settings.mssql_connect_timeout_seconds,
        query_timeout_seconds=settings.mssql_query_timeout_seconds,
    )


def build_container(settings: Settings) -> Container:
    clock = SystemClock()
    return Container(
        settings=settings,
        database=Database(settings.database_url, echo=settings.database_echo),
        clock=clock,
        hasher=Argon2PasswordHasher(),
        tokens=JwtTokenService(settings),
        throttle=InMemoryLoginThrottle(
            clock=clock,
            max_attempts=settings.login_max_attempts,
            window_seconds=settings.login_attempt_window_seconds,
            block_seconds=settings.login_block_seconds,
        ),
        sqlserver=SqlServerReadOnlyReader(_sqlserver_config(settings)),
    )
