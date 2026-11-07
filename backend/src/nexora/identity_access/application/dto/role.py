"""Read projection of a role and its current user assignments."""

from dataclasses import dataclass

from nexora.identity_access.domain.entities.role import Role


@dataclass(frozen=True, slots=True)
class RoleRead:
    role: Role
    assigned_users: int
