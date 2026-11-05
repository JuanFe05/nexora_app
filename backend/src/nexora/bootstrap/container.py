"""Composicion de dependencias de larga vida."""

from __future__ import annotations

from dataclasses import dataclass

from nexora.bootstrap.database import Database
from nexora.bootstrap.settings import Settings
from nexora.identity_access.infrastructure.security.login_throttle import InMemoryLoginThrottle
from nexora.identity_access.infrastructure.security.password_hasher import Argon2PasswordHasher
from nexora.identity_access.infrastructure.security.token_service import JwtTokenService
from nexora.shared_kernel.clock import SystemClock


@dataclass(frozen=True, slots=True)
class Container:
    settings: Settings
    database: Database
    clock: SystemClock
    hasher: Argon2PasswordHasher
    tokens: JwtTokenService
    throttle: InMemoryLoginThrottle


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
    )
