"""Sesion autenticada: ciclo de vida, rotacion y revocacion."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID


@dataclass(frozen=True, slots=True)
class SessionUsabilityWindow:
    """Limites estrictos compartidos por la entidad y las consultas de sesiones."""

    now: datetime
    idle_timeout: timedelta

    @property
    def activity_cutoff(self) -> datetime:
        return self.now - self.idle_timeout

    def is_expired(self, expires_at: datetime, last_activity_at: datetime) -> bool:
        return expires_at <= self.now or last_activity_at <= self.activity_cutoff


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
    previous_refresh_token_jti: UUID | None = None
    refresh_rotated_at: datetime | None = None

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    def is_expired(self, now: datetime, idle_timeout: timedelta = timedelta(minutes=30)) -> bool:
        """El instante viene del reloj inyectado; ninguno de los limites es inclusivo."""
        return SessionUsabilityWindow(now, idle_timeout).is_expired(
            self.expires_at, self.last_activity_at
        )

    def is_usable(self, now: datetime, idle_timeout: timedelta = timedelta(minutes=30)) -> bool:
        """La actividad desliza la inactividad, nunca el vencimiento absoluto."""
        return not self.is_revoked and not self.is_expired(now, idle_timeout)

    def accepts_refresh_jti(self, jti: UUID, now: datetime, grace: timedelta) -> bool:
        return jti == self.refresh_token_jti or (
            jti == self.previous_refresh_token_jti
            and self.refresh_rotated_at is not None
            # Otra solicitud puede haber tomado su reloj antes de esperar el UPDATE.
            and now - self.refresh_rotated_at <= grace
        )
