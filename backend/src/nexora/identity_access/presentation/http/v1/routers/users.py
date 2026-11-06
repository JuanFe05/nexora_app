"""Gestion de usuarios y asignaciones autorizada por permisos independientes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from nexora.identity_access.application.use_cases.administration import (
    NewUser,
    UserAdministration,
    UserChanges,
)
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    PrincipalDep,
    get_user_administration,
    require_permission,
)
from nexora.identity_access.presentation.http.v1.schemas.administration import (
    UserCreate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["usuarios"])
UseCase = Annotated[UserAdministration, Depends(get_user_administration)]


@router.post(
    "",
    response_model=UserResponse,
    status_code=201,
    summary="Crea un usuario",
    dependencies=[Depends(require_permission("identity.users.create"))],
)
async def create_user(payload: UserCreate, use_case: UseCase) -> UserResponse:
    detail = await use_case.create(
        NewUser(
            username=payload.nombre_usuario,
            email=payload.correo,
            password=payload.contrasena.get_secret_value(),
            first_name=payload.primer_nombre,
            middle_name=payload.segundo_nombre,
            last_name=payload.primer_apellido,
            second_last_name=payload.segundo_apellido,
            phone_number=payload.numero_telefono,
        )
    )
    return UserResponse.from_detail(detail)


@router.get(
    "",
    response_model=list[UserResponse],
    summary="Lista usuarios",
    dependencies=[Depends(require_permission("identity.users.view"))],
)
async def list_users(
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
) -> list[UserResponse]:
    page = await use_case.list(limit=limit, offset=offset, query=q)
    response.headers["X-Total-Count"] = str(page.total)
    return [UserResponse.from_detail(detail) for detail in page.items]


@router.get(
    "/{id}",
    response_model=UserResponse,
    summary="Consulta un usuario",
    dependencies=[Depends(require_permission("identity.users.view"))],
)
async def get_user(id: UUID, use_case: UseCase) -> UserResponse:
    return UserResponse.from_detail(await use_case.get(id))


@router.patch("/{id}", response_model=UserResponse, summary="Edita un usuario")
async def update_user(
    id: UUID, payload: UserUpdate, principal: PrincipalDep, use_case: UseCase
) -> UserResponse:
    # Authorize the supplied fields before looking up the target (including missing IDs).
    # Empty PATCH keeps its no-op behavior, but still requires the update permission.
    fields = payload.model_fields_set
    if not fields or fields - {"estado"}:
        await require_permission("identity.users.update")(principal)
    if "estado" in fields:
        await require_permission("identity.users.deactivate")(principal)
    detail = await use_case.update(
        id,
        UserChanges(
            username=payload.nombre_usuario,
            email=payload.correo,
            first_name=payload.primer_nombre,
            middle_name=payload.segundo_nombre,
            last_name=payload.primer_apellido,
            second_last_name=payload.segundo_apellido,
            phone_number=payload.numero_telefono,
            status=payload.estado,
        ),
        actor=principal,
    )
    return UserResponse.from_detail(detail)


@router.delete(
    "/{id}",
    status_code=204,
    summary="Elimina un usuario",
    dependencies=[Depends(require_permission("identity.users.delete"))],
)
async def delete_user(id: UUID, principal: PrincipalDep, use_case: UseCase) -> Response:
    await use_case.delete(id, actor=principal)
    return Response(status_code=204)


@router.put(
    "/{id}/roles/{role_id}",
    response_model=UserResponse,
    summary="Asigna un rol",
    dependencies=[Depends(require_permission("identity.users.assign_roles"))],
)
async def assign_role(
    id: UUID, role_id: UUID, principal: PrincipalDep, use_case: UseCase
) -> UserResponse:
    return UserResponse.from_detail(await use_case.assign_role(id, role_id, actor=principal))


@router.delete(
    "/{id}/roles/{role_id}",
    status_code=204,
    summary="Revoca un rol",
    dependencies=[Depends(require_permission("identity.users.assign_roles"))],
)
async def revoke_role(
    id: UUID, role_id: UUID, principal: PrincipalDep, use_case: UseCase
) -> Response:
    await use_case.revoke_role(id, role_id, actor=principal)
    return Response(status_code=204)
