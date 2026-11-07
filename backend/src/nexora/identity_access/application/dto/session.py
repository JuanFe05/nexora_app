"""Proyeccion publica de sesiones; no contiene identificadores de tokens."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class SessionRead:
    id: UUID
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_activity_at: datetime
    expires_at: datetime
    current: bool = False
