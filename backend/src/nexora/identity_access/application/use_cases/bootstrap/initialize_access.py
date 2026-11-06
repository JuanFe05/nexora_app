"""Siembra idempotente de roles, permisos y primer administrador al arrancar."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import uuid4

from nexora.identity_access.application.ports.security import Clock, PasswordHasher
from nexora.identity_access.application.ports.seeding import AccessSeedRepository
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.exceptions.identity import AdministratorNotConfigured
from nexora.identity_access.domain.value_objects.access_catalog import (
    PERMISSION_CATALOG,
    SYSTEM_ROLES,
    SystemRole,
)
from nexora.identity_access.domain.value_objects.enums import UserStatus

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AdminCredentials:
    username: str
    email: str
    password: str = ""
    first_name: str = "Administrador"
    last_name: str = "NEXORA"

    def __repr__(self) -> str:  # nunca exponer la contrasena en logs
        return f"AdminCredentials(username={self.username!r}, email={self.email!r})"


@dataclass(frozen=True, slots=True)
class InitializationResult:
    admin_created: bool
    admin_present: bool


class InitializeAccessUseCase:
    def __init__(
        self,
        *,
        seed: AccessSeedRepository,
        hasher: PasswordHasher,
        clock: Clock,
        transaction: Transaction,
        admin: AdminCredentials | None,
        require_admin: bool,
    ) -> None:
        self._seed = seed
        self._hasher = hasher
        self._clock = clock
        self._transaction = transaction
        self._admin = admin
        self._require_admin = require_admin

    async def execute(self) -> InitializationResult:
        try:
            result = await self._run()
        except Exception:
            await self._transaction.rollback()
            raise
        await self._transaction.commit()
        return result

    async def _run(self) -> InitializationResult:
        await self._seed.acquire_seed_lock()
        role_ids = {spec.code: await self._seed.ensure_role(spec) for spec in SYSTEM_ROLES}
        admin_role_id = role_ids[SystemRole.ADMINISTRADOR]
        for permission in PERMISSION_CATALOG:
            permission_id = await self._seed.ensure_permission(permission)
            await self._seed.ensure_role_permission(admin_role_id, permission_id)

        if await self._seed.count_active_users_with_role(admin_role_id) > 0:
            return InitializationResult(admin_created=False, admin_present=True)
        if self._admin is None:
            if self._require_admin:
                raise AdministratorNotConfigured
            logger.warning(
                "No hay administrador activo y no se configuraron credenciales iniciales"
            )
            return InitializationResult(admin_created=False, admin_present=False)

        user = await self._seed.find_user(username=self._admin.username, email=self._admin.email)
        created = user is None
        if user is None:
            user = User(
                id=uuid4(),
                username=self._admin.username,
                email=self._admin.email,
                password_hash=self._hasher.hash(self._admin.password),
                status=UserStatus.ACTIVE,
                first_name=self._admin.first_name,
                last_name=self._admin.last_name,
                password_changed_at=self._clock.now(),
            )
            await self._seed.add_user(user)
        await self._seed.ensure_assignment(user.id, admin_role_id)
        admin_present = await self._seed.count_active_users_with_role(admin_role_id) > 0
        if not admin_present:
            if self._require_admin:
                raise AdministratorNotConfigured
            logger.warning("No hay administrador activo despues de la inicializacion")
        return InitializationResult(admin_created=created, admin_present=admin_present)
