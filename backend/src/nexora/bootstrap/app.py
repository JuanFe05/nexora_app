"""Fabrica de la aplicacion FastAPI y traduccion de errores de dominio a HTTP."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from nexora.bootstrap.access_initialization import initialize_access
from nexora.bootstrap.container import Container, build_container
from nexora.bootstrap.settings import Settings, get_settings
from nexora.identity_access.domain.exceptions.identity import (
    AuthenticationThrottled,
    ConflictError,
    InvalidCredentials,
    InvalidToken,
    PermissionDenied,
    RefreshTokenReused,
    ResourceNotFound,
    SessionNotActive,
)
from nexora.identity_access.presentation.http.v1.router import identity_access_router

#: Mensaje unico para cualquier fallo de credenciales: no revela si el usuario existe.
GENERIC_CREDENTIALS_MESSAGE = "Credenciales invalidas"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    container: Container = app.state.container
    try:
        await initialize_access(container)
        yield
    finally:
        await container.database.dispose()


def _register_error_handlers(app: FastAPI) -> None:
    async def credentials_handler(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": GENERIC_CREDENTIALS_MESSAGE},
        )

    async def throttled_handler(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AuthenticationThrottled)  # noqa: S101
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": str(exc)},
            headers={"Retry-After": str(exc.retry_after_seconds)},
        )

    async def unauthenticated_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": str(exc)})

    async def forbidden_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": str(exc)})

    async def not_found_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})

    async def conflict_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})

    app.add_exception_handler(ResourceNotFound, not_found_handler)
    app.add_exception_handler(ConflictError, conflict_handler)
    app.add_exception_handler(InvalidCredentials, credentials_handler)
    app.add_exception_handler(AuthenticationThrottled, throttled_handler)
    app.add_exception_handler(InvalidToken, unauthenticated_handler)
    app.add_exception_handler(SessionNotActive, unauthenticated_handler)
    app.add_exception_handler(RefreshTokenReused, unauthenticated_handler)
    app.add_exception_handler(PermissionDenied, forbidden_handler)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        docs_url=None if settings.is_production else "/docs",
        openapi_url=None if settings.is_production else "/openapi.json",
        lifespan=_lifespan,
    )
    app.state.container = build_container(settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    _register_error_handlers(app)
    app.include_router(identity_access_router, prefix=settings.api_prefix)

    @app.get("/health", tags=["operacion"], summary="Estado del servicio")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
