"""Router version 1 del modulo identity_access."""

from __future__ import annotations

from fastapi import APIRouter

from nexora.identity_access.presentation.http.v1.routers.auth import router as auth_router
from nexora.identity_access.presentation.http.v1.routers.permissions import (
    router as permissions_router,
)
from nexora.identity_access.presentation.http.v1.routers.roles import router as roles_router
from nexora.identity_access.presentation.http.v1.routers.users import router as users_router

identity_access_router = APIRouter()
identity_access_router.include_router(auth_router)
identity_access_router.include_router(users_router)
identity_access_router.include_router(roles_router)
identity_access_router.include_router(permissions_router)
