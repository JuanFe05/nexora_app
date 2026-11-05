"""Router version 1 del modulo identity_access."""

from __future__ import annotations

from fastapi import APIRouter

from nexora.identity_access.presentation.http.v1.routers.auth import router as auth_router

identity_access_router = APIRouter()
identity_access_router.include_router(auth_router)
