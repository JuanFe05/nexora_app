"""Dependencias HTTP: sesion de base de datos, casos de uso y autorizacion."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.bootstrap.container import Container
from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal
from nexora.identity_access.application.use_cases.authentication.authenticate_request import (
    AuthenticateRequestUseCase,
)
from nexora.identity_access.application.use_cases.authentication.login import LoginUseCase
from nexora.identity_access.application.use_cases.authentication.logout import LogoutUseCase
from nexora.identity_access.application.use_cases.authentication.refresh import (
    RefreshSessionUseCase,
)
from nexora.identity_access.domain.exceptions.identity import InvalidToken, PermissionDenied
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


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise InvalidToken("Falta el encabezado Authorization: Bearer")
    return token.strip()


async def get_current_principal(
    request: Request,
    use_case: Annotated[AuthenticateRequestUseCase, Depends(get_authenticate_use_case)],
) -> AuthenticatedPrincipal:
    """Identifica al usuario, valida la sesion viva y carga sus permisos efectivos."""
    return await use_case.execute(_bearer_token(request))


PrincipalDep = Annotated[AuthenticatedPrincipal, Depends(get_current_principal)]


def require_permission(
    code: str,
) -> Callable[[AuthenticatedPrincipal], Coroutine[Any, Any, AuthenticatedPrincipal]]:
    """Dependencia reutilizable: `Depends(require_permission("identity.users.view"))`."""

    async def dependency(principal: PrincipalDep) -> AuthenticatedPrincipal:
        if not principal.has_permission(code):
            raise PermissionDenied(code)
        return principal

    return dependency
