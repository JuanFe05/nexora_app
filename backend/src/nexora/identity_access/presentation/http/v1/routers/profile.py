"""Perfil propio para cualquier principal autenticado, tenga o no roles."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from nexora.identity_access.application.use_cases.profile import (
    PasswordChange,
    ProfileChanges,
    ProfileService,
)
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    PrincipalDep,
    get_profile_service,
)
from nexora.identity_access.presentation.http.v1.schemas.administration import UserResponse
from nexora.identity_access.presentation.http.v1.schemas.profile import (
    PasswordUpdate,
    ProfileResponse,
    ProfileUpdate,
)

router = APIRouter(prefix="/profile", tags=["perfil"])
ServiceDep = Annotated[ProfileService, Depends(get_profile_service)]


@router.get("", response_model=ProfileResponse, summary="Consultar mi perfil")
async def get_profile(principal: PrincipalDep, service: ServiceDep) -> UserResponse:
    return ProfileResponse.from_detail(await service.get(principal))


@router.patch("", response_model=ProfileResponse, summary="Editar mis datos personales")
async def update_profile(
    body: ProfileUpdate, principal: PrincipalDep, service: ServiceDep
) -> UserResponse:
    detail = await service.update(
        principal,
        ProfileChanges(
            email=body.correo,
            first_name=body.primer_nombre,
            middle_name=body.segundo_nombre,
            last_name=body.primer_apellido,
            second_last_name=body.segundo_apellido,
            phone_number=body.numero_telefono,
        ),
    )
    return ProfileResponse.from_detail(detail)


@router.post(
    "/password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cambiar mi contrasena y cerrar mis otras sesiones",
)
async def change_password(
    body: PasswordUpdate, principal: PrincipalDep, service: ServiceDep
) -> Response:
    await service.change_password(
        principal,
        PasswordChange(
            current_password=body.contrasena_actual.get_secret_value(),
            new_password=body.contrasena_nueva.get_secret_value(),
        ),
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
