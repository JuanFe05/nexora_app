"""Dependencias HTTP: sesion de base de datos, casos de uso y autorizacion."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.bootstrap.container import Container
from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal
from nexora.identity_access.application.use_cases.administration import (
    PermissionAdministration,
    RoleAdministration,
    UserAdministration,
)
from nexora.identity_access.application.use_cases.authentication.authenticate_request import (
    AuthenticateRequestUseCase,
)
from nexora.identity_access.application.use_cases.authentication.login import LoginUseCase
from nexora.identity_access.application.use_cases.authentication.logout import LogoutUseCase
from nexora.identity_access.application.use_cases.authentication.refresh import (
    RefreshSessionUseCase,
)
from nexora.identity_access.application.use_cases.profile import ProfileService
from nexora.identity_access.domain.exceptions.identity import InvalidToken, PermissionDenied
from nexora.identity_access.domain.value_objects.access_catalog import SystemRole
from nexora.identity_access.infrastructure.persistence.administration_repository import (
    SqlAlchemyAdministrationRepository,
)
from nexora.identity_access.infrastructure.persistence.repositories import (
    SqlAlchemyAccessRepository,
    SqlAlchemySessionRepository,
    SqlAlchemyUserRepository,
)
from nexora.identity_access.infrastructure.persistence.transaction import SqlAlchemyTransaction


def get_container(request: Request) -> Container:
    container: Container = request.app.state.container
    return container


ContainerDep = Annotated[Container, Depends(get_container)]


async def get_db_session(container: ContainerDep) -> AsyncIterator[AsyncSession]:
    async for session in container.database.session():
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


def get_login_use_case(container: ContainerDep, session: SessionDep) -> LoginUseCase:
    return LoginUseCase(
        users=SqlAlchemyUserRepository(session),
        sessions=SqlAlchemySessionRepository(session),
        hasher=container.hasher,
        tokens=container.tokens,
        throttle=container.throttle,
        clock=container.clock,
        transaction=SqlAlchemyTransaction(session),
    )


def get_refresh_use_case(container: ContainerDep, session: SessionDep) -> RefreshSessionUseCase:
    return RefreshSessionUseCase(
        sessions=SqlAlchemySessionRepository(session),
        tokens=container.tokens,
        clock=container.clock,
        transaction=SqlAlchemyTransaction(session),
    )


def get_logout_use_case(container: ContainerDep, session: SessionDep) -> LogoutUseCase:
    return LogoutUseCase(
        sessions=SqlAlchemySessionRepository(session),
        clock=container.clock,
        transaction=SqlAlchemyTransaction(session),
    )


def get_authenticate_use_case(
    container: ContainerDep, session: SessionDep
) -> AuthenticateRequestUseCase:
    return AuthenticateRequestUseCase(
        users=SqlAlchemyUserRepository(session),
        sessions=SqlAlchemySessionRepository(session),
        access=SqlAlchemyAccessRepository(session),
        tokens=container.tokens,
        clock=container.clock,
        transaction=SqlAlchemyTransaction(session),
    )


#: Solo declara el esquema en OpenAPI (boton Authorize de Swagger); la validacion real la hace
#: `_bearer_token`, que conserva el mensaje y el 401 existentes.
bearer_scheme = HTTPBearer(auto_error=False, description="Access token del login")


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise InvalidToken("Falta el encabezado Authorization: Bearer")
    return token.strip()


async def get_current_principal(
    request: Request,
    use_case: Annotated[AuthenticateRequestUseCase, Depends(get_authenticate_use_case)],
    _: Annotated[object, Depends(bearer_scheme)] = None,
) -> AuthenticatedPrincipal:
    """Identifica al usuario, valida la sesion viva y carga sus permisos efectivos."""
    return await use_case.execute(_bearer_token(request))


PrincipalDep = Annotated[AuthenticatedPrincipal, Depends(get_current_principal)]


async def require_administrator(principal: PrincipalDep) -> AuthenticatedPrincipal:
    """La gestion IAM no se delega mediante permisos: requiere el rol de sistema activo."""
    if SystemRole.ADMINISTRADOR.value not in principal.roles:
        raise PermissionDenied(SystemRole.ADMINISTRADOR.value)
    return principal


AdministratorDep = Annotated[AuthenticatedPrincipal, Depends(require_administrator)]


def get_user_administration(container: ContainerDep, session: SessionDep) -> UserAdministration:
    return UserAdministration(
        repository=SqlAlchemyAdministrationRepository(session),
        transaction=SqlAlchemyTransaction(session),
        hasher=container.hasher,
        clock=container.clock,
    )


def get_role_administration(session: SessionDep) -> RoleAdministration:
    return RoleAdministration(
        repository=SqlAlchemyAdministrationRepository(session),
        transaction=SqlAlchemyTransaction(session),
    )


def get_permission_administration(session: SessionDep) -> PermissionAdministration:
    return PermissionAdministration(
        repository=SqlAlchemyAdministrationRepository(session),
        transaction=SqlAlchemyTransaction(session),
    )


def get_profile_service(container: ContainerDep, session: SessionDep) -> ProfileService:
    return ProfileService(
        users=SqlAlchemyUserRepository(session),
        sessions=SqlAlchemySessionRepository(session),
        access=SqlAlchemyAccessRepository(session),
        administration=SqlAlchemyAdministrationRepository(session),
        hasher=container.hasher,
        throttle=container.throttle,
        clock=container.clock,
        transaction=SqlAlchemyTransaction(session),
    )


def require_permission(
    code: str,
) -> Callable[[AuthenticatedPrincipal], Coroutine[Any, Any, AuthenticatedPrincipal]]:
    """Dependencia reutilizable: `Depends(require_permission("identity.users.view"))`."""

    async def dependency(principal: PrincipalDep) -> AuthenticatedPrincipal:
        if not principal.has_permission(code):
            raise PermissionDenied(code)
        return principal

    return dependency
