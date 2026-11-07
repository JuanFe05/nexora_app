"""Administracion IAM: consistencia y limites anti-escalada en la capa de aplicacion.

HTTP exige el permiso de cada accion; los casos de uso limitan lo que el actor puede delegar
y protegen administradores y recursos de sistema, antes de cualquier escritura.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from uuid import UUID, uuid4

from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal
from nexora.identity_access.application.dto.page import Page
from nexora.identity_access.application.ports.administration import AdministrationRepository
from nexora.identity_access.application.ports.security import Clock, PasswordHasher
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.domain.entities.role import Permission, Role
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.exceptions.identity import (
    ConflictError,
    PermissionDenied,
    ResourceNotFound,
)
from nexora.identity_access.domain.value_objects.access_catalog import (
    PERMISSION_CATALOG,
    SystemRole,
)
from nexora.identity_access.domain.value_objects.enums import RoleStatus, UserStatus

_SYSTEM_ROLE_CODES = frozenset(role.value for role in SystemRole)
_CATALOG_PERMISSION_CODES = frozenset(spec.code for spec in PERMISSION_CATALOG)
LAST_ADMIN_MESSAGE = "No se puede dejar al sistema sin un administrador activo"


@dataclass(frozen=True, slots=True)
class NewUser:
    username: str
    email: str
    password: str = field(repr=False)
    first_name: str
    last_name: str
    middle_name: str | None = None
    second_last_name: str | None = None
    phone_number: str | None = None


@dataclass(frozen=True, slots=True)
class UserChanges:
    """Campos a editar; `None` significa 'sin cambio'."""

    username: str | None = None
    email: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    second_last_name: str | None = None
    phone_number: str | None = None
    status: UserStatus | None = None

    def as_replacements(self) -> dict[str, object]:
        fields = (
            "username",
            "email",
            "first_name",
            "middle_name",
            "last_name",
            "second_last_name",
            "phone_number",
            "status",
        )
        return {name: getattr(self, name) for name in fields if getattr(self, name) is not None}


@dataclass(frozen=True, slots=True)
class UserDetail:
    user: User
    roles: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RoleDetail:
    role: Role
    permissions: tuple[str, ...]
    assigned_users: int


class _Base:
    def __init__(self, *, repository: AdministrationRepository, transaction: Transaction) -> None:
        self._repo = repository
        self._tx = transaction

    async def _user(self, user_id: UUID) -> User:
        user = await self._repo.get_user(user_id)
        if user is None:
            raise ResourceNotFound("Usuario")
        return user

    async def _role(self, role_id: UUID) -> Role:
        role = await self._repo.get_role(role_id)
        if role is None:
            raise ResourceNotFound("Rol")
        return role

    async def _permission(self, permission_id: UUID) -> Permission:
        permission = await self._repo.get_permission(permission_id)
        if permission is None:
            raise ResourceNotFound("Permiso")
        return permission


class UserAdministration(_Base):
    def __init__(
        self,
        *,
        repository: AdministrationRepository,
        transaction: Transaction,
        hasher: PasswordHasher,
        clock: Clock,
    ) -> None:
        super().__init__(repository=repository, transaction=transaction)
        self._hasher = hasher
        self._clock = clock

    async def create(self, command: NewUser) -> UserDetail:
        await self._repo.lock_access_changes()
        await self._ensure_unique(command.username, command.email, exclude=None)
        user = User(
            id=uuid4(),
            username=command.username,
            email=command.email,
            password_hash=self._hasher.hash(command.password),
            status=UserStatus.ACTIVE,
            first_name=command.first_name,
            last_name=command.last_name,
            middle_name=command.middle_name,
            second_last_name=command.second_last_name,
            phone_number=command.phone_number,
            password_changed_at=self._clock.now(),
        )
        await self._repo.add_user(user)
        await self._tx.commit()
        return UserDetail(user, ())

    async def list(self, *, limit: int, offset: int, query: str | None = None) -> Page[UserDetail]:
        query = query.strip() or None if query is not None else None
        users = await self._repo.list_users(limit=limit, offset=offset, query=query)
        roles = await self._repo.role_codes_by_user([user.id for user in users])
        return Page(
            items=tuple(UserDetail(user, roles.get(user.id, ())) for user in users),
            total=await self._repo.count_users(query=query),
        )

    async def get(self, user_id: UUID) -> UserDetail:
        user = await self._user(user_id)
        roles = await self._repo.role_codes_by_user([user.id])
        return UserDetail(user, roles.get(user.id, ()))

    async def update(
        self, user_id: UUID, changes: UserChanges, *, actor: AuthenticatedPrincipal
    ) -> UserDetail:
        await self._repo.lock_access_changes()
        user = await self._user(user_id)
        await self._ensure_can_manage_user(user_id, actor)
        if changes.status is UserStatus.INACTIVE and user.is_active:
            await self._ensure_not_last_administrator(user.id)
        await self._ensure_unique(
            changes.username or user.username, changes.email or user.email, exclude=user.id
        )
        await self._repo.update_user(replace(user, **changes.as_replacements()))  # type: ignore[arg-type]
        await self._tx.commit()
        return await self.get(user_id)

    async def delete(self, user_id: UUID, *, actor: AuthenticatedPrincipal) -> None:
        await self._repo.lock_access_changes()
        user = await self._user(user_id)
        await self._ensure_can_manage_user(user_id, actor)
        if user.id == actor.user.id:
            raise ConflictError("No puede eliminar su propia cuenta")
        await self._ensure_not_last_administrator(user.id)
        await self._repo.delete_user(user.id)
        await self._tx.commit()

    async def assign_role(
        self, user_id: UUID, role_id: UUID, *, actor: AuthenticatedPrincipal
    ) -> UserDetail:
        await self._repo.lock_access_changes()
        await self._user(user_id)
        role = await self._role(role_id)
        if SystemRole.ADMINISTRADOR not in actor.roles:
            if role.code == SystemRole.ADMINISTRADOR:
                raise PermissionDenied("identity.users.assign_roles")
            permissions = await self._repo.permission_codes_by_role([role_id])
            if not set(permissions.get(role_id, ())) <= actor.permissions:
                raise PermissionDenied("identity.users.assign_roles")
        await self._repo.assign_role(user_id, role_id, actor.user.id)
        await self._tx.commit()
        return await self.get(user_id)

    async def revoke_role(
        self, user_id: UUID, role_id: UUID, *, actor: AuthenticatedPrincipal
    ) -> UserDetail:
        await self._repo.lock_access_changes()
        await self._user(user_id)
        role = await self._role(role_id)
        if role.code == SystemRole.ADMINISTRADOR:
            if SystemRole.ADMINISTRADOR not in actor.roles:
                raise PermissionDenied("identity.users.assign_roles")
            await self._ensure_not_last_administrator(user_id)
        if not await self._repo.revoke_role(user_id, role_id):
            raise ResourceNotFound("Asignacion de rol")
        await self._tx.commit()
        return await self.get(user_id)

    async def _ensure_can_manage_user(self, user_id: UUID, actor: AuthenticatedPrincipal) -> None:
        if SystemRole.ADMINISTRADOR not in actor.roles:
            roles = await self._repo.role_codes_by_user([user_id])
            # Include inactive users: their administrator role remains protected.
            if SystemRole.ADMINISTRADOR in roles.get(user_id, ()):
                raise PermissionDenied(SystemRole.ADMINISTRADOR)

    async def _ensure_unique(self, username: str, email: str, *, exclude: UUID | None) -> None:
        for other in await self._repo.find_user(username=username, email=email):
            if other.id != exclude:
                raise ConflictError("El nombre de usuario o el correo ya estan registrados")

    async def _ensure_not_last_administrator(self, user_id: UUID) -> None:
        if (
            await self._repo.is_active_administrator(user_id)
            and await self._repo.count_active_administrators() <= 1
        ):
            raise ConflictError(LAST_ADMIN_MESSAGE)


class RoleAdministration(_Base):
    async def create(self, *, code: str, name: str, description: str | None) -> RoleDetail:
        if await self._repo.get_role_by_code(code) is not None:
            raise ConflictError("Ya existe un rol con ese codigo")
        role = Role(
            id=uuid4(), code=code, name=name, status=RoleStatus.ACTIVE, description=description
        )
        await self._repo.add_role(role)
        await self._tx.commit()
        return await self.get(role.id)

    async def list(self, *, limit: int, offset: int, query: str | None = None) -> Page[RoleDetail]:
        query = query.strip() or None if query is not None else None
        roles = await self._repo.list_roles(limit=limit, offset=offset, query=query)
        permissions = await self._repo.permission_codes_by_role([item.role.id for item in roles])
        return Page(
            items=tuple(
                RoleDetail(item.role, permissions.get(item.role.id, ()), item.assigned_users)
                for item in roles
            ),
            total=await self._repo.count_roles(query=query),
        )

    async def get(self, role_id: UUID) -> RoleDetail:
        item = await self._repo.get_role_read(role_id)
        if item is None:
            raise ResourceNotFound("Rol")
        permissions = await self._repo.permission_codes_by_role([item.role.id])
        return RoleDetail(item.role, permissions.get(item.role.id, ()), item.assigned_users)

    async def update(
        self,
        role_id: UUID,
        *,
        name: str | None,
        description: str | None,
        status: RoleStatus | None,
    ) -> RoleDetail:
        role = await self._role(role_id)
        if status is RoleStatus.INACTIVE and role.code == SystemRole.ADMINISTRADOR:
            raise ConflictError("El rol ADMINISTRADOR no puede desactivarse")
        updated = replace(
            role,
            name=name if name is not None else role.name,
            description=description if description is not None else role.description,
            status=status if status is not None else role.status,
        )
        await self._repo.update_role(updated)
        await self._tx.commit()
        return await self.get(role_id)

    async def delete(self, role_id: UUID) -> None:
        await self._repo.lock_access_changes()
        role = await self._role(role_id)
        if role.code in _SYSTEM_ROLE_CODES:
            raise ConflictError("Los roles de sistema no pueden eliminarse")
        if await self._repo.count_role_assignments(role.id) > 0:
            raise ConflictError("El rol tiene usuarios asignados: revoque las asignaciones primero")
        await self._repo.delete_role(role.id)
        await self._tx.commit()

    async def assign_permission(
        self, role_id: UUID, permission_id: UUID, *, actor: AuthenticatedPrincipal
    ) -> RoleDetail:
        await self._repo.lock_access_changes()
        await self._role(role_id)
        permission = await self._permission(permission_id)
        if SystemRole.ADMINISTRADOR not in actor.roles and not actor.has_permission(
            permission.code
        ):
            raise PermissionDenied(permission.code)
        await self._repo.assign_permission(role_id, permission_id)
        await self._tx.commit()
        return await self.get(role_id)

    async def revoke_permission(self, role_id: UUID, permission_id: UUID) -> RoleDetail:
        role = await self._role(role_id)
        permission = await self._permission(permission_id)
        if role.code == SystemRole.ADMINISTRADOR and permission.code in _CATALOG_PERMISSION_CODES:
            raise ConflictError("Los permisos del catalogo no pueden revocarse a ADMINISTRADOR")
        if not await self._repo.revoke_permission(role_id, permission_id):
            raise ResourceNotFound("Asignacion de permiso")
        await self._tx.commit()
        return await self.get(role_id)


class PermissionAdministration(_Base):
    async def create(
        self, *, code: str, name: str, module: str, description: str | None
    ) -> Permission:
        if await self._repo.get_permission_by_code(code) is not None:
            raise ConflictError("Ya existe un permiso con ese codigo")
        permission = Permission(
            id=uuid4(), code=code, name=name, module=module, description=description
        )
        await self._repo.add_permission(permission)
        await self._tx.commit()
        return permission

    async def list(self, *, limit: int, offset: int, query: str | None = None) -> Page[Permission]:
        query = query.strip() or None if query is not None else None
        permissions = await self._repo.list_permissions(limit=limit, offset=offset, query=query)
        return Page(items=tuple(permissions), total=await self._repo.count_permissions(query=query))

    async def get(self, permission_id: UUID) -> Permission:
        return await self._permission(permission_id)

    async def update(
        self,
        permission_id: UUID,
        *,
        name: str | None,
        module: str | None,
        description: str | None,
    ) -> Permission:
        permission = await self._permission(permission_id)
        updated = replace(
            permission,
            name=name if name is not None else permission.name,
            module=module if module is not None else permission.module,
            description=description if description is not None else permission.description,
        )
        await self._repo.update_permission(updated)
        await self._tx.commit()
        return updated

    async def delete(self, permission_id: UUID) -> None:
        await self._repo.lock_access_changes()
        permission = await self._permission(permission_id)
        if permission.code in _CATALOG_PERMISSION_CODES:
            raise ConflictError("Los permisos del catalogo del sistema no pueden eliminarse")
        if await self._repo.count_permission_roles(permission.id) > 0:
            raise ConflictError("El permiso esta asignado a roles: revoquelo primero")
        await self._repo.delete_permission(permission.id)
        await self._tx.commit()
