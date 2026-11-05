"""Entidad de usuario. No hereda de ningun modelo ORM."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from nexora.identity_access.domain.value_objects.enums import UserStatus


@dataclass(frozen=True, slots=True)
class User:
    id: UUID
    username: str
    email: str
    password_hash: str
    status: UserStatus
    first_name: str
    last_name: str
    middle_name: str | None = None
    second_last_name: str | None = None
    phone_number: str | None = None
    password_changed_at: datetime | None = None

    @property
    def is_active(self) -> bool:
        return self.status is UserStatus.ACTIVE

    @property
    def full_name(self) -> str:
        parts = (self.first_name, self.middle_name, self.last_name, self.second_last_name)
        return " ".join(part for part in parts if part)
