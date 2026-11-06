"""Autoservicio del perfil del principal, sin privilegios administrativos."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal
from nexora.identity_access.application.ports.administration import AdministrationRepository
from nexora.identity_access.application.ports.repositories import (
    AccessRepository,
    SessionRepository,
    UserRepository,
)
from nexora.identity_access.application.ports.security import Clock, LoginThrottle, PasswordHasher
from nexora.identity_access.application.ports.transaction import Transaction
from nexora.identity_access.application.use_cases.administration import UserDetail
from nexora.identity_access.domain.entities.user import User
from nexora.identity_access.domain.exceptions.identity import (
    ConflictError,
    IncorrectCurrentPassword,
    SessionNotActive,
)


@dataclass(frozen=True, slots=True)
class ProfileChanges:
    """Lista cerrada: None significa omitido, nunca permite editar identidad ni acceso."""

    email: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    second_last_name: str | None = None
    phone_number: str | None = None


@dataclass(frozen=True, slots=True)
class PasswordChange:
    current_password: str = field(repr=False)
    new_password: str = field(repr=False)


class ProfileService:
    def __init__(
        self,
        *,
        users: UserRepository,
        sessions: SessionRepository,
        access: AccessRepository,
        administration: AdministrationRepository,
        hasher: PasswordHasher,
        throttle: LoginThrottle,
        clock: Clock,
        transaction: Transaction,
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._access = access
        self._administration = administration
        self._hasher = hasher
        self._throttle = throttle
        self._clock = clock
        self._tx = transaction

    async def get(self, principal: AuthenticatedPrincipal) -> UserDetail:
        user = await self._users.get_by_id(principal.user.id)
        if user is None or not user.is_active:
            raise SessionNotActive
        roles, _ = await self._access.effective_access(user.id)
        return UserDetail(user, roles)

    async def _locked_user(self, principal: AuthenticatedPrincipal) -> User:
        # Serializa cambios de credenciales para que dos solicitudes no verifiquen el hash viejo.
        user = await self._users.get_for_update(principal.user.id)
        if user is None or not user.is_active:
            raise SessionNotActive
        return user

    async def update(
        self, principal: AuthenticatedPrincipal, changes: ProfileChanges
    ) -> UserDetail:
        # Reutiliza el bloqueo, la unicidad y la escritura existentes de administracion.
        # El usuario se relee bajo bloqueo y solo se reemplazan los seis campos del perfil.
        await self._administration.lock_access_changes()
        user = await self._locked_user(principal)
        email = changes.email if changes.email is not None else user.email
        for other in await self._administration.find_user(username=user.username, email=email):
            if other.id != user.id:
                raise ConflictError("El nombre de usuario o el correo ya estan registrados")
        updated = replace(
            user,
            email=email,
            first_name=changes.first_name if changes.first_name is not None else user.first_name,
            middle_name=(
                changes.middle_name if changes.middle_name is not None else user.middle_name
            ),
            last_name=changes.last_name if changes.last_name is not None else user.last_name,
            second_last_name=(
                changes.second_last_name
                if changes.second_last_name is not None
                else user.second_last_name
            ),
            phone_number=(
                changes.phone_number if changes.phone_number is not None else user.phone_number
            ),
        )
        await self._administration.update_user(updated)
        await self._tx.commit()
        return await self.get(principal)

    async def change_password(
        self, principal: AuthenticatedPrincipal, command: PasswordChange
    ) -> None:
        key = f"password:{principal.user.id}"
        self._throttle.ensure_allowed(key)
        try:
            user = await self._locked_user(principal)
            # Las solicitudes en espera deben observar los fallos de quien obtuvo antes el lock.
            self._throttle.ensure_allowed(key)
            now = self._clock.now()
            # Una sesion revocada mientras esperaba el bloqueo no puede cambiar la clave.
            session = await self._sessions.get(principal.session_id)
            if session is None or session.user_id != user.id or not session.is_usable(now):
                raise SessionNotActive
            if not self._hasher.verify(user.password_hash, command.current_password):
                self._throttle.register_failure(key)
                raise IncorrectCurrentPassword
            password_hash = self._hasher.hash(command.new_password)
            await self._users.update_password(user.id, password_hash, now)
            await self._sessions.revoke_all_except(user.id, principal.session_id, now)
            await self._tx.commit()
        except Exception:
            await self._tx.rollback()
            raise
        self._throttle.reset(key)
