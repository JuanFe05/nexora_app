"""Autoservicio del perfil del principal, sin privilegios administrativos."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import timedelta
from uuid import UUID

from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal
from nexora.identity_access.application.dto.session import SessionRead
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
    ResourceNotFound,
    SessionNotActive,
)
from nexora.identity_access.domain.value_objects.personal_data import normalize_personal_data


@dataclass(frozen=True, slots=True)
class ProfileChanges:
    """Lista cerrada: None significa omitido, nunca permite editar identidad ni acceso."""

    email: str | None = None
    first_name: str | None = None
    middle_name: str | None = None
    last_name: str | None = None
    second_last_name: str | None = None
    phone_number: str | None = None

    def __post_init__(self) -> None:
        normalize_personal_data(self)


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
        idle_timeout: timedelta = timedelta(minutes=30),
    ) -> None:
        self._users = users
        self._sessions = sessions
        self._access = access
        self._administration = administration
        self._hasher = hasher
        self._throttle = throttle
        self._clock = clock
        self._tx = transaction
        self._idle_timeout = idle_timeout

    async def get(self, principal: AuthenticatedPrincipal) -> UserDetail:
        user = await self._users.get_by_id(principal.user.id)
        if user is None or not user.is_active:
            raise SessionNotActive
        roles, _ = await self._access.effective_access(user.id)
        return UserDetail(user, roles)

    async def list_sessions(self, principal: AuthenticatedPrincipal) -> list[SessionRead]:
        items = await self._sessions.list_usable(
            principal.user.id, self._clock.now(), self._idle_timeout
        )
        # Orden estable: preserva actividad descendente y adelanta solo la sesion del principal.
        return sorted(
            (replace(item, current=item.id == principal.session_id) for item in items),
            key=lambda item: not item.current,
        )

    async def revoke_session(self, principal: AuthenticatedPrincipal, session_id: UUID) -> None:
        try:
            await self._administration.lock_access_changes()
            user = await self._locked_user(principal)
            # Como en cambio de clave, revalida al actor despues de esperar el lock del usuario.
            current = await self._sessions.get(principal.session_id)
            now = self._clock.now()
            if (
                current is None
                or current.user_id != user.id
                or not current.is_usable(now, self._idle_timeout)
            ):
                raise SessionNotActive
            target = await self._sessions.get_owned_for_update(session_id, user.id)
            # La espera del lock de refresh/revocacion no debe prolongar la ventana usable.
            now = self._clock.now()
            if (
                target is None
                or target.user_id != user.id
                or not target.is_usable(now, self._idle_timeout)
            ):
                raise ResourceNotFound("Recurso")
            if target.id == principal.session_id:
                raise ConflictError("Para cerrar la sesion actual, use «Cerrar sesión»")
            await self._sessions.revoke(target.id, now)
            await self._tx.commit()
        except Exception:
            await self._tx.rollback()
            raise

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
            if (
                session is None
                or session.user_id != user.id
                or not session.is_usable(now, self._idle_timeout)
            ):
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
