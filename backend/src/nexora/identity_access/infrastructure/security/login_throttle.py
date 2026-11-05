"""Freno a la fuerza bruta en memoria del proceso.

Suficiente para un despliegue de un solo proceso. Con varios workers cada uno lleva su propio
contador; si el despliegue crece, este puerto se reimplementa con un almacen compartido sin
tocar el caso de uso.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta

from nexora.identity_access.application.ports.security import Clock
from nexora.identity_access.domain.exceptions.identity import AuthenticationThrottled


class InMemoryLoginThrottle:
    def __init__(
        self,
        *,
        clock: Clock,
        max_attempts: int,
        window_seconds: int,
        block_seconds: int,
    ) -> None:
        self._max_attempts = max_attempts
        self._window = timedelta(seconds=window_seconds)
        self._block = timedelta(seconds=block_seconds)
        self._clock = clock
        self._failures: dict[str, deque[datetime]] = {}
        self._blocked_until: dict[str, datetime] = {}

    def _now(self) -> datetime:
        return self._clock.now()

    def ensure_allowed(self, key: str) -> None:
        now = self._now()
        blocked_until = self._blocked_until.get(key)
        if blocked_until is None:
            return
        if blocked_until > now:
            raise AuthenticationThrottled(int((blocked_until - now).total_seconds()) + 1)
        self.reset(key)

    def register_failure(self, key: str) -> None:
        now = self._now()
        attempts = self._failures.setdefault(key, deque())
        attempts.append(now)
        while attempts and attempts[0] < now - self._window:
            attempts.popleft()
        if len(attempts) >= self._max_attempts:
            self._blocked_until[key] = now + self._block
            attempts.clear()

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)
        self._blocked_until.pop(key, None)
