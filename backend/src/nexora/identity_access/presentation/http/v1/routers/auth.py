"""Endpoints de autenticacion bajo /api/v1/auth."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from nexora.identity_access.application.dto.auth import LoginCommand, UserView
from nexora.identity_access.application.use_cases.authentication.login import LoginUseCase
from nexora.identity_access.application.use_cases.authentication.logout import LogoutUseCase
from nexora.identity_access.application.use_cases.authentication.logout_all import LogoutAllUseCase
from nexora.identity_access.application.use_cases.authentication.refresh import (
    RefreshCommand,
    RefreshSessionUseCase,
)
from nexora.identity_access.domain.exceptions.identity import InvalidToken
from nexora.identity_access.presentation.http.v1.cookies import (
    clear_auth_cookies,
    csrf_failure_reason,
    csrf_is_valid,
    issue_csrf_token,
    set_auth_cookies,
)
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    PrincipalDep,
    get_login_use_case,
    get_logout_all_use_case,
    get_logout_use_case,
    get_refresh_use_case,
)
from nexora.identity_access.presentation.http.v1.schemas.auth import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    TokenResponse,
    UsuarioResponse,
)

logger = logging.getLogger("nexora.auth")
router = APIRouter(prefix="/auth", tags=["autenticacion"])


def _usuario(user: UserView) -> UsuarioResponse:
    return UsuarioResponse(
        id=user.id,
        nombre_usuario=user.username,
        correo=user.email,
        nombre_completo=user.full_name,
    )


@router.post("/login", response_model=LoginResponse, summary="Autentica a un usuario")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    container: ContainerDep,
    use_case: Annotated[LoginUseCase, Depends(get_login_use_case)],
) -> LoginResponse:
    result = await use_case.execute(
        LoginCommand(
            identifier=payload.identificador,
            password=payload.contrasena.get_secret_value(),
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    )
    set_auth_cookies(
        response,
        container.settings,
        refresh_token=result.tokens.refresh_token,
        refresh_expires_at=result.tokens.refresh_expires_at,
        csrf_token=issue_csrf_token(),
    )
    return LoginResponse(
        access_token=result.tokens.access_token,
        token_type=result.tokens.token_type,
        expires_in=result.tokens.expires_in,
        idle_timeout_seconds=result.tokens.idle_timeout_seconds,
        warning_seconds=result.tokens.warning_seconds,
        session_expires_at=result.tokens.session_expires_at,
        usuario=_usuario(result.user),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Rota la sesion autenticada")
async def refresh(
    request: Request,
    response: Response,
    container: ContainerDep,
    use_case: Annotated[RefreshSessionUseCase, Depends(get_refresh_use_case)],
) -> TokenResponse:
    settings = container.settings
    reason = csrf_failure_reason(request, settings)
    if reason is not None:
        logger.warning("Refresh rechazado por CSRF: %s", reason)
        raise InvalidToken("Solicitud sin token CSRF valido")

    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        logger.warning("Refresh rechazado: falta la cookie de refresh")
        raise InvalidToken("Falta la cookie de refresh")

    tokens = await use_case.execute(RefreshCommand(refresh_token=refresh_token))
    set_auth_cookies(
        response,
        settings,
        refresh_token=tokens.refresh_token,
        refresh_expires_at=tokens.refresh_expires_at,
        csrf_token=issue_csrf_token(),
    )
    return TokenResponse(
        access_token=tokens.access_token,
        expires_in=tokens.expires_in,
        idle_timeout_seconds=tokens.idle_timeout_seconds,
        warning_seconds=tokens.warning_seconds,
        session_expires_at=tokens.session_expires_at,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoca la sesion actual",
)
async def logout(
    request: Request,
    response: Response,
    container: ContainerDep,
    use_case: Annotated[LogoutUseCase, Depends(get_logout_use_case)],
) -> Response:
    settings = container.settings
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if refresh_token:
        if not csrf_is_valid(request, settings):
            raise InvalidToken("Solicitud sin token CSRF valido")
        claims = container.tokens.decode_refresh_token(refresh_token)
        await use_case.execute(claims.session_id)

    empty = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(empty, settings)
    return empty


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoca todas las sesiones del usuario autenticado",
)
async def logout_all(
    principal: PrincipalDep,
    container: ContainerDep,
    use_case: Annotated[LogoutAllUseCase, Depends(get_logout_all_use_case)],
) -> Response:
    await use_case.execute(principal.user.id)
    empty = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(empty, container.settings)
    return empty


@router.get("/me", response_model=MeResponse, summary="Usuario autenticado y permisos efectivos")
async def me(principal: PrincipalDep) -> MeResponse:
    return MeResponse(
        usuario=_usuario(principal.user),
        roles=list(principal.roles),
        permisos=sorted(principal.permissions),
    )
