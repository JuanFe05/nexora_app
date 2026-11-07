import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from starlette.requests import Request
from starlette.responses import Response

from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.exceptions.identity import InvalidToken
from nexora.identity_access.presentation.http.v1.routers import auth


@pytest.mark.asyncio
async def test_refresh_rejection_never_logs_secret_embedded_in_origin(
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = Settings(_env_file=None, allowed_origins=("http://localhost:5173",))
    secret = "synthetic-csrf-secret"
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/refresh",
            "headers": [
                (
                    b"cookie",
                    (
                        f"{settings.csrf_cookie_name}={secret}; "
                        f"{settings.refresh_cookie_name}=refresh-secret"
                    ).encode(),
                ),
                (settings.csrf_header_name.lower().encode(), secret.encode()),
                (b"origin", f"https://{secret}.example".encode()),
            ],
        }
    )
    use_case = AsyncMock()

    with (
        caplog.at_level(logging.WARNING, logger="nexora.auth"),
        pytest.raises(InvalidToken, match="^Solicitud sin token CSRF valido$"),
    ):
        await auth.refresh(request, Response(), SimpleNamespace(settings=settings), use_case)  # type: ignore[arg-type]

    use_case.execute.assert_not_called()
    assert "origen no permitido" in caplog.text
    assert secret not in caplog.text
    assert "refresh-secret" not in caplog.text
