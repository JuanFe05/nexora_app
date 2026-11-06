"""Swagger debe poder autenticarse: el OpenAPI declara el esquema Bearer en las rutas protegidas."""

from __future__ import annotations

from fastapi import FastAPI

PUBLIC = {
    ("post", "/api/v1/auth/login"),
    ("post", "/api/v1/auth/refresh"),
    ("post", "/api/v1/auth/logout"),
    ("get", "/health"),
}


def test_las_rutas_protegidas_declaran_bearer_y_las_publicas_no(app: FastAPI) -> None:
    schema = app.openapi()

    assert "HTTPBearer" in schema["components"]["securitySchemes"]
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == "bearer"
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            declares_security = bool(operation.get("security"))
            assert declares_security is ((method, path) not in PUBLIC), f"{method} {path}"
