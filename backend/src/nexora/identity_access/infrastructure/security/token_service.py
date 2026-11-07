"""Emision y validacion de JWT (access y refresh).

El algoritmo se toma siempre de la configuracion, nunca del encabezado del token.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt

from nexora.bootstrap.settings import Settings
from nexora.identity_access.application.ports.security import (
    AccessTokenClaims,
    IssuedToken,
    RefreshTokenClaims,
)
from nexora.identity_access.domain.exceptions.identity import InvalidToken

ACCESS_TOKEN_TYPE = "access"  # noqa: S105  (tipo de token, no un secreto)
REFRESH_TOKEN_TYPE = "refresh"  # noqa: S105  (tipo de token, no un secreto)


class JwtTokenService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def issue_access_token(self, *, user_id: UUID, session_id: UUID, now: datetime) -> IssuedToken:
        ttl = timedelta(minutes=self._settings.access_token_ttl_minutes)
        return self._issue(ACCESS_TOKEN_TYPE, user_id, session_id, now, ttl)

    def issue_refresh_token(
        self, *, user_id: UUID, session_id: UUID, now: datetime,
        absolute_expires_at: datetime | None = None,
    ) -> IssuedToken:
        ttl = timedelta(days=self._settings.refresh_token_ttl_days)
        if absolute_expires_at is not None:
            ttl = min(ttl, absolute_expires_at - now)
        return self._issue(REFRESH_TOKEN_TYPE, user_id, session_id, now, ttl)

    def decode_access_token(self, token: str) -> AccessTokenClaims:
        payload = self._decode(token, ACCESS_TOKEN_TYPE)
        user_id, session_id, token_id, expires_at = self._read_claims(payload)
        return AccessTokenClaims(
            user_id=user_id, session_id=session_id, token_id=token_id, expires_at=expires_at
        )

    def decode_refresh_token(
        self, token: str, *, allow_expired: bool = False
    ) -> RefreshTokenClaims:
        payload = self._decode(token, REFRESH_TOKEN_TYPE, allow_expired=allow_expired)
        user_id, session_id, token_id, expires_at = self._read_claims(payload)
        return RefreshTokenClaims(
            user_id=user_id, session_id=session_id, token_id=token_id, expires_at=expires_at
        )

    def _issue(
        self,
        token_type: str,
        user_id: UUID,
        session_id: UUID,
        now: datetime,
        ttl: timedelta,
    ) -> IssuedToken:
        token_id = uuid4()
        expires_at = now + ttl
        payload = {
            "sub": str(user_id),
            "sid": str(session_id),
            "jti": str(token_id),
            "token_type": token_type,
            "iss": self._settings.jwt_issuer,
            "aud": self._settings.jwt_audience,
            "iat": int(now.timestamp()),
            "exp": int(expires_at.timestamp()),
        }
        value = jwt.encode(
            payload,
            self._settings.jwt_secret.get_secret_value(),
            algorithm=self._settings.jwt_algorithm,
        )
        return IssuedToken(value=value, token_id=token_id, expires_at=expires_at)

    def _decode(
        self, token: str, expected_type: str, *, allow_expired: bool = False
    ) -> dict[str, Any]:
        try:
            payload = jwt.decode(
                token,
                self._settings.jwt_secret.get_secret_value(),
                algorithms=[self._settings.jwt_algorithm],
                issuer=self._settings.jwt_issuer,
                audience=self._settings.jwt_audience,
                options={
                    "require": ["exp", "iat", "sub", "sid", "jti", "iss", "aud"],
                    "verify_exp": not allow_expired,
                },
            )
        except jwt.PyJWTError as error:
            raise InvalidToken from error

        if payload.get("token_type") != expected_type:
            raise InvalidToken("Tipo de token inesperado")
        return dict(payload)

    @staticmethod
    def _read_claims(payload: dict[str, Any]) -> tuple[UUID, UUID, UUID, datetime]:
        """Un claim ausente o malformado es un token invalido, no un error interno."""
        try:
            return (
                UUID(str(payload["sub"])),
                UUID(str(payload["sid"])),
                UUID(str(payload["jti"])),
                datetime.fromtimestamp(float(payload["exp"]), tz=UTC),
            )
        except (KeyError, TypeError, ValueError, OverflowError) as error:
            raise InvalidToken("Claims invalidos") from error
