"""Gestion de roles y sus permisos con autorizacion granular."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from nexora.identity_access.application.use_cases.administration import RoleAdministration
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    PrincipalDep,
    get_role_administration,
    require_permission,
)
from nexora.identity_access.presentation.http.v1.schemas.administration import (
    RoleCreate,
    RoleResponse,
    RoleUpdate,
)

router = APIRouter(prefix="/roles", tags=["roles"])
UseCase = Annotated[RoleAdministration, Depends(get_role_administration)]


@router.post(
    "",
    response_model=RoleResponse,
    status_code=201,
    summary="Crea un rol",
    dependencies=[Depends(require_permission("identity.roles.create"))],
)
async def create_role(payload: RoleCreate, use_case: UseCase) -> RoleResponse:
    return RoleResponse.from_detail(
        await use_case.create(
            code=payload.codigo, name=payload.nombre, description=payload.descripcion
        )
    )


@router.get(
    "",
    response_model=list[RoleResponse],
    summary="Lista roles",
    dependencies=[Depends(require_permission("identity.roles.view"))],
)
async def list_roles(
    use_case: UseCase,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    q: Annotated[
        str | None,
        Query(
            max_length=100,
            description="Busqueda literal sin distinguir mayusculas; se recortan espacios",
        ),
    ] = None,
) -> list[RoleResponse]:
    page = await use_case.list(limit=limit, offset=offset, query=q)
    response.headers["X-Total-Count"] = str(page.total)
    return [RoleResponse.from_detail(detail) for detail in page.items]


@router.get(
    "/{id}",
    response_model=RoleResponse,
    summary="Consulta un rol",
    dependencies=[Depends(require_permission("identity.roles.view"))],
)
async def get_role(id: UUID, use_case: UseCase) -> RoleResponse:
    return RoleResponse.from_detail(await use_case.get(id))


@router.patch(
    "/{id}",
    response_model=RoleResponse,
    summary="Edita un rol sin cambiar su codigo",
    dependencies=[Depends(require_permission("identity.roles.update"))],
)
async def update_role(id: UUID, payload: RoleUpdate, use_case: UseCase) -> RoleResponse:
    return RoleResponse.from_detail(
        await use_case.update(
            id, name=payload.nombre, description=payload.descripcion, status=payload.estado
        )
    )


@router.delete(
    "/{id}",
    status_code=204,
    summary="Elimina un rol sin asignaciones",
    dependencies=[Depends(require_permission("identity.roles.delete"))],
)
async def delete_role(id: UUID, use_case: UseCase) -> Response:
    await use_case.delete(id)
    return Response(status_code=204)


@router.put(
    "/{id}/permissions/{permission_id}",
    response_model=RoleResponse,
    summary="Asigna un permiso",
    dependencies=[Depends(require_permission("identity.roles.assign_permissions"))],
)
async def assign_permission(
    id: UUID, permission_id: UUID, principal: PrincipalDep, use_case: UseCase
) -> RoleResponse:
    return RoleResponse.from_detail(
        await use_case.assign_permission(id, permission_id, actor=principal)
    )


@router.delete(
    "/{id}/permissions/{permission_id}",
    status_code=204,
    summary="Revoca un permiso",
    dependencies=[Depends(require_permission("identity.roles.assign_permissions"))],
)
async def revoke_permission(id: UUID, permission_id: UUID, use_case: UseCase) -> Response:
    await use_case.revoke_permission(id, permission_id)
    return Response(status_code=204)
