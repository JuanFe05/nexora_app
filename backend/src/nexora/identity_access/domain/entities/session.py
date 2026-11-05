"""Sesion autenticada: ciclo de vida, rotacion y revocacion."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class Session:
    id: UUID
    user_id: UUID
    refresh_token_jti: UUID
    created_at: datetime
    last_activity_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    ip_address: str | None = None
    user_agent: str | None = None

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def is_expired(self, now: datetime) -> bool:
        return self.expires_at <= now

    def is_usable(self, now: datetime) -> bool:
        """Una sesion sirve mientras no este revocada ni vencida."""
        return not self.is_revoked and not self.is_expired(now)
