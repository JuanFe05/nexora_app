"""API administrativa de cuotas moderadoras (contrato compartido con Configuración)."""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from pydantic import BaseModel, ConfigDict, StrictInt

from nexora.identity_access.application.dto.auth import AuthenticatedPrincipal
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    get_moderator_fees_administration,
    require_permission,
)
from nexora.statistics.application.moderator_fees import FeeSchedule, ModeratorFeesAdministration


class ModeratorFeesRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def localized(request: Request) -> Response:
            try:
                return await handler(request)
            except RequestValidationError as exc:
                raise HTTPException(
                    422, "La solicitud de cuotas moderadoras no es válida."
                ) from exc

        return localized


class FeeAmounts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    importes: list[StrictInt]


moderator_fees_router = APIRouter(
    prefix="/statistics/administrative/moderator-fees",
    tags=["cuotas moderadoras"],
    route_class=ModeratorFeesRoute,
)
ServiceDep = Annotated[ModeratorFeesAdministration, Depends(get_moderator_fees_administration)]
ViewDep = Annotated[
    AuthenticatedPrincipal,
    Depends(require_permission("statistics.administrative.moderator_fees.view")),
]
ManageDep = Annotated[
    AuthenticatedPrincipal,
    Depends(require_permission("statistics.administrative.moderator_fees.manage")),
]


@moderator_fees_router.get("", summary="Consultar cuotas por vigencia")
async def list_fees(_: ViewDep, service: ServiceDep) -> list[FeeSchedule]:
    return await service.list()


@moderator_fees_router.put("/{vigencia}", summary="Crear o actualizar cuotas por vigencia")
async def upsert_fees(
    vigencia: int, body: FeeAmounts, principal: ManageDep, service: ServiceDep
) -> FeeSchedule:
    return await service.upsert(vigencia, body.importes, principal.user.id)


@moderator_fees_router.delete("/{vigencia}", status_code=204, summary="Eliminar una vigencia")
async def delete_fees(vigencia: int, _: ManageDep, service: ServiceDep) -> Response:
    await service.delete(vigencia)
    return Response(status_code=204)
