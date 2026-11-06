"""Gestion de permisos exclusiva de ADMINISTRADOR."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from nexora.identity_access.application.use_cases.administration import PermissionAdministration
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_permission_administration,
    require_administrator,
)
from nexora.identity_access.presentation.http.v1.schemas.administration import (
    PermissionCreate,
    PermissionResponse,
    PermissionUpdate,
)

router = APIRouter(
    prefix="/permissions", tags=["permisos"], dependencies=[Depends(require_administrator)]
)
UseCase = Annotated[PermissionAdministration, Depends(get_permission_administration)]


@router.post("", response_model=PermissionResponse, status_code=201, summary="Crea un permiso")
async def create_permission(payload: PermissionCreate, use_case: UseCase) -> PermissionResponse:
    return PermissionResponse.from_permission(
        await use_case.create(
            code=payload.codigo,
            name=payload.nombre,
            module=payload.modulo,
            description=payload.descripcion,
        )
    )


@router.get("", response_model=list[PermissionResponse], summary="Lista permisos")
async def list_permissions(
    use_case: UseCase,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PermissionResponse]:
    return [
        PermissionResponse.from_permission(permission)
        for permission in await use_case.list(limit=limit, offset=offset)
    ]


@router.get("/{id}", response_model=PermissionResponse, summary="Consulta un permiso")
async def get_permission(id: UUID, use_case: UseCase) -> PermissionResponse:
    return PermissionResponse.from_permission(await use_case.get(id))


@router.patch(
    "/{id}", response_model=PermissionResponse, summary="Edita un permiso sin cambiar su codigo"
)
async def update_permission(
    id: UUID, payload: PermissionUpdate, use_case: UseCase
) -> PermissionResponse:
    return PermissionResponse.from_permission(
        await use_case.update(
            id, name=payload.nombre, module=payload.modulo, description=payload.descripcion
        )
    )


@router.delete("/{id}", status_code=204, summary="Elimina un permiso sin asignaciones")
async def delete_permission(id: UUID, use_case: UseCase) -> Response:
    await use_case.delete(id)
    return Response(status_code=204)
