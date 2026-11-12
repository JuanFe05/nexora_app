"""Fabrica de la aplicacion FastAPI y traduccion de errores de dominio a HTTP."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from nexora.bootstrap.access_initialization import initialize_access
from nexora.bootstrap.container import Container, build_container
from nexora.bootstrap.settings import Settings, get_settings
from nexora.identity_access.domain.exceptions.identity import (
    AuthenticationThrottled,
    ConflictError,
    IncorrectCurrentPassword,
    InvalidCredentials,
    InvalidToken,
    PermissionDenied,
    RefreshTokenReused,
    ResourceNotFound,
    SessionNotActive,
)
from nexora.identity_access.presentation.http.v1.router import identity_access_router
from nexora.integration_management.application.ports import (
    ExternalQueryFailed,
    ExternalSourceUnavailable,
)
from nexora.statistics.domain.filters import InvalidReportFilter
from nexora.statistics.presentation.http.v1.router import statistics_router, vital_signs_router

#: Mensaje unico para cualquier fallo de credenciales: no revela si el usuario existe.
GENERIC_CREDENTIALS_MESSAGE = "Credenciales invalidas"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    container: Container = app.state.container
    try:
        await initialize_access(container)
        yield
    finally:
        container.sqlserver.dispose()
        await container.database.dispose()


def _register_error_handlers(app: FastAPI) -> None:
    async def validation_handler(_: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)  # noqa: S101
        detail = [
            {key: value for key, value in error.items() if key not in {"input", "ctx"}}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": detail}
        )

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

    async def current_password_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": str(exc)})

    async def external_unavailable_handler(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Fuente de datos externa no disponible"},
        )

    async def external_query_handler(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "No se pudo consultar la fuente de datos externa"},
        )

    async def report_filter_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"detail": str(exc)},
        )

    app.add_exception_handler(ExternalSourceUnavailable, external_unavailable_handler)
    app.add_exception_handler(ExternalQueryFailed, external_query_handler)
    app.add_exception_handler(InvalidReportFilter, report_filter_handler)
    app.add_exception_handler(IncorrectCurrentPassword, current_password_handler)
    app.add_exception_handler(RequestValidationError, validation_handler)
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
        expose_headers=["X-Total-Count"],
    )
    _register_error_handlers(app)
    app.include_router(identity_access_router, prefix=settings.api_prefix)
    app.include_router(statistics_router, prefix=settings.api_prefix)
    app.include_router(vital_signs_router, prefix=settings.api_prefix)

    @app.get("/health", tags=["operacion"], summary="Estado del servicio")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
