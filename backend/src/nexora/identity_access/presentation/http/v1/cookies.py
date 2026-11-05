"""Cookies de autenticacion y proteccion CSRF (S5).

El refresh token viaja en una cookie HttpOnly que el navegador solo envia a `/api/v1/auth`.
Como la autenticacion depende de una cookie, cada operacion que la consume exige ademas el
token CSRF por cabecera (double submit) y valida el `Origin` cuando el navegador lo envia.
"""

from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import Request, Response

from nexora.bootstrap.settings import Settings


def issue_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_auth_cookies(
    response: Response,
    settings: Settings,
    *,
    refresh_token: str,
    refresh_expires_at: datetime,
    csrf_token: str,
) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        refresh_token,
        expires=refresh_expires_at,
        path=settings.cookie_path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )
    # El front necesita leer el token CSRF para reenviarlo por cabecera: no puede ser HttpOnly.
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        expires=refresh_expires_at,
        path=settings.cookie_path,
        domain=settings.cookie_domain,
        secure=settings.cookie_secure,
        httponly=False,
        samesite=settings.cookie_samesite,
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    for name in (settings.refresh_cookie_name, settings.csrf_cookie_name):
        response.delete_cookie(
            name,
            domain=settings.cookie_domain,
            path=settings.cookie_path,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
        )


def csrf_is_valid(request: Request, settings: Settings) -> bool:
    cookie_token = request.cookies.get(settings.csrf_cookie_name)
    header_token = request.headers.get(settings.csrf_header_name)
    if not cookie_token or not header_token:
        return False
    if not secrets.compare_digest(cookie_token, header_token):
        return False
    origin = request.headers.get("origin")
    return origin is None or origin in settings.allowed_origins
