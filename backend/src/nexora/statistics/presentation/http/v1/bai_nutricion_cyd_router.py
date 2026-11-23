"""Acceso HTTP a BAI Nutrición CYD: un único permiso protege todo el módulo."""

from fastapi import APIRouter, Depends

from nexora.identity_access.presentation.http.v1.dependencies.auth import require_permission


def create_bai_nutricion_cyd_router(*, prefix: str, permission: str) -> APIRouter:
    # El guard a nivel de router cubre cualquier endpoint futuro del módulo.
    return APIRouter(
        prefix=prefix,
        tags=["estadistica"],
        dependencies=[Depends(require_permission(permission))],
    )
