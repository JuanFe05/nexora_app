import pytest
from starlette.requests import Request

from nexora.bootstrap.settings import Settings
from nexora.identity_access.presentation.http.v1.cookies import csrf_failure_reason, csrf_is_valid

SETTINGS = Settings(_env_file=None, allowed_origins=("http://localhost:5173",))


def make_request(cookie: str | None, header: str | None, origin: str | None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if cookie is not None:
        headers.append((b"cookie", f"{SETTINGS.csrf_cookie_name}={cookie}".encode()))
    if header is not None:
        headers.append((SETTINGS.csrf_header_name.lower().encode(), header.encode()))
    if origin is not None:
        headers.append((b"origin", origin.encode()))
    return Request({"type": "http", "method": "POST", "path": "/", "headers": headers})


@pytest.mark.parametrize(
    ("cookie", "header", "origin", "expected"),
    [
        (None, "secret-a", None, "falta la cookie CSRF"),
        ("secret-a", None, None, "falta la cabecera CSRF"),
        ("secret-a", "secret-b", None, "la cabecera CSRF no coincide con la cookie"),
        (
            "secret-a",
            "secret-a",
            "http://127.0.0.1:5173",
            "origen no permitido",
        ),
        ("secret-a", "secret-a", "http://localhost:5173", None),
        ("secret-a", "secret-a", None, None),
    ],
)
def test_csrf_failure_reason_is_descriptive_and_never_leaks_tokens(
    cookie: str | None, header: str | None, origin: str | None, expected: str | None
) -> None:
    request = make_request(cookie, header, origin)
    reason = csrf_failure_reason(request, SETTINGS)
    assert reason == expected
    assert csrf_is_valid(request, SETTINGS) is (expected is None)
    for secret in ("secret-a", "secret-b"):
        assert secret not in (reason or "")
