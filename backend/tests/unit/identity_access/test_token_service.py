"""Validacion estricta de JWT (S6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
import pytest
from pydantic import SecretStr

from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.exceptions.identity import InvalidToken
from nexora.identity_access.infrastructure.security.token_service import JwtTokenService


def build_service(**overrides: object) -> JwtTokenService:
    values: dict[str, object] = {
        "_env_file": None,  # No importar credenciales bootstrap del entorno local.
        "jwt_secret": SecretStr("secreto-de-pruebas-de-al-menos-32-caracteres"),
        "jwt_issuer": "nexora",
        "jwt_audience": "nexora-app",
        "access_token_ttl_minutes": 10,
        "refresh_token_ttl_days": 7,
    }
    values.update(overrides)
    return JwtTokenService(Settings(**values))


def test_access_token_lleva_sub_sid_jti_y_vence_en_diez_minutos() -> None:
    service = build_service()
    user_id, session_id = uuid4(), uuid4()
    now = datetime.now(UTC)

    issued = service.issue_access_token(user_id=user_id, session_id=session_id, now=now)
    claims = service.decode_access_token(issued.value)

    assert claims.user_id == user_id
    assert claims.session_id == session_id
    assert claims.token_id == issued.token_id
    assert issued.expires_at == now + timedelta(minutes=10)


def test_refresh_token_vence_en_siete_dias() -> None:
    service = build_service()
    now = datetime.now(UTC)

    issued = service.issue_refresh_token(user_id=uuid4(), session_id=uuid4(), now=now)

    assert issued.expires_at == now + timedelta(days=7)
    assert service.decode_refresh_token(issued.value).token_id == issued.token_id


def test_un_access_token_no_sirve_como_refresh_token() -> None:
    service = build_service()
    issued = service.issue_access_token(user_id=uuid4(), session_id=uuid4(), now=datetime.now(UTC))

    with pytest.raises(InvalidToken):
        service.decode_refresh_token(issued.value)


def test_token_vencido_es_rechazado() -> None:
    service = build_service()
    expired = service.issue_access_token(
        user_id=uuid4(), session_id=uuid4(), now=datetime.now(UTC) - timedelta(hours=2)
    )

    with pytest.raises(InvalidToken):
        service.decode_access_token(expired.value)


def test_token_con_otro_emisor_o_audiencia_es_rechazado() -> None:
    issued = build_service(jwt_issuer="otro", jwt_audience="otra-app").issue_access_token(
        user_id=uuid4(), session_id=uuid4(), now=datetime.now(UTC)
    )

    with pytest.raises(InvalidToken):
        build_service().decode_access_token(issued.value)


def test_token_firmado_con_otro_secreto_es_rechazado() -> None:
    service = build_service()
    forged = jwt.encode(
        {
            "sub": str(uuid4()),
            "sid": str(uuid4()),
            "jti": str(uuid4()),
            "token_type": "access",
            "iss": "nexora",
            "aud": "nexora-app",
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(minutes=10)).timestamp()),
        },
        "otro-secreto-de-al-menos-32-caracteres-aqui",
        algorithm="HS256",
    )

    with pytest.raises(InvalidToken):
        service.decode_access_token(forged)


def test_token_sin_firma_alg_none_es_rechazado() -> None:
    service = build_service()
    unsigned = jwt.encode(
        {
            "sub": str(uuid4()),
            "sid": str(uuid4()),
            "jti": str(uuid4()),
            "token_type": "access",
            "iss": "nexora",
            "aud": "nexora-app",
            "iat": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(minutes=10)).timestamp()),
        },
        key=None,
        algorithm="none",
    )

    with pytest.raises(InvalidToken):
        service.decode_access_token(unsigned)
