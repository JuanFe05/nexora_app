"""Role deletion requires its own permission and preserves access integrity (S1-S2)."""

import pytest
from httpx import AsyncClient

from tests.integration.conftest import Seeder
from tests.integration.test_iam_administration import (
    FORBIDDEN,
    USER,
    login,
    request,
    snapshot,
)
from tests.integration.test_iam_administration import admin as admin


async def test_delete_unassigned_role_with_permissions_preserves_permissions_and_users(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    role = (
        await request(
            client, admin, "POST", "/roles", 201, {"codigo": "REMOVABLE", "nombre": "Removable"}
        )
    ).json()
    permissions = (await request(client, admin, "GET", "/permissions?limit=100")).json()
    granted = permissions[:2]
    for permission in granted:
        await request(client, admin, "PUT", f"/roles/{role['id']}/permissions/{permission['id']}")
    detail = (await request(client, admin, "GET", f"/roles/{role['id']}")).json()
    assert detail["permisos"] == sorted(permission["codigo"] for permission in granted)
    assert detail["usuarios_asignados"] == 0
    # Include an unrelated user assigned to another role, not just the administrator.
    user = (await request(client, admin, "POST", "/users", 201, USER)).json()
    remaining_roles = (await request(client, admin, "GET", "/roles?limit=100")).json()
    other = next(item for item in remaining_roles if item["codigo"] == "ESTADISTICA")
    await request(client, admin, "PUT", f"/users/{user['id']}/roles/{other['id']}")
    remaining_roles = (await request(client, admin, "GET", "/roles?limit=100")).json()
    before = await snapshot(client, admin)

    await request(client, admin, "DELETE", f"/roles/{role['id']}", 204)

    after = await snapshot(client, admin)
    assert after == [
        before[0],
        [item for item in remaining_roles if item["id"] != role["id"]],
        before[2],
    ]
    assert (await request(client, admin, "GET", f"/roles/{role['id']}", 404)).json() == {
        "detail": "Rol no encontrado"
    }
    # The deleted role exposes no surviving permission links; the permissions themselves remain.
    for permission in granted:
        rejected = await request(
            client, admin, "DELETE", f"/roles/{role['id']}/permissions/{permission['id']}", 404
        )
        assert rejected.json() == {"detail": "Rol no encontrado"}
        assert (await request(client, admin, "GET", f"/permissions/{permission['id']}")).json() == (
            permission
        )
    assert await snapshot(client, admin) == after


async def test_view_only_user_cannot_delete_role_and_changes_nothing(
    client: AsyncClient, admin: dict[str, str], seeder: Seeder
) -> None:
    user_id = await seeder.create_user(username="viewer", email="viewer@example.test")
    await seeder.grant_role(user_id, role_code="VIEWER", permissions=("identity.roles.view",))
    viewer = await login(client, "viewer")
    me = (await client.get("/api/v1/auth/me", headers=viewer)).json()
    assert me["roles"] == ["VIEWER"]
    assert me["permisos"] == ["identity.roles.view"]
    role = (
        await request(
            client, admin, "POST", "/roles", 201, {"codigo": "REMOVABLE", "nombre": "Removable"}
        )
    ).json()
    assert (await request(client, viewer, "GET", f"/roles/{role['id']}")).json() == role
    before = await snapshot(client, admin)

    denied = await request(client, viewer, "DELETE", f"/roles/{role['id']}", 403)

    assert denied.json() == FORBIDDEN
    assert await snapshot(client, admin) == before
    assert (await request(client, viewer, "GET", f"/roles/{role['id']}")).json() == role


@pytest.mark.parametrize(
    ("target", "user_status"),
    [
        ("ADMINISTRADOR", None),
        ("ESTADISTICA", None),
        ("FACTURACION", None),
        ("ASSIGNED", "activo"),
        ("ASSIGNED", "inactivo"),
    ],
)
async def test_delete_only_user_cannot_delete_system_or_assigned_roles(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    target: str,
    user_status: str | None,
) -> None:
    user_id = await seeder.create_user(username="deleter", email="deleter@example.test")
    await seeder.grant_role(user_id, role_code="DELETER", permissions=("identity.roles.delete",))
    deleter = await login(client, "deleter")
    me = (await client.get("/api/v1/auth/me", headers=deleter)).json()
    assert me["roles"] == ["DELETER"]
    assert me["permisos"] == ["identity.roles.delete"]
    if user_status is not None:
        assigned_user = await seeder.create_user(
            username="assigned", email="assigned@example.test", status=user_status
        )
        role_id = str(await seeder.grant_role(assigned_user, role_code=target))
        detail = (await request(client, admin, "GET", f"/roles/{role_id}")).json()
        assert detail["usuarios_asignados"] == 1
        message = "El rol tiene usuarios asignados: revoque las asignaciones primero"
    else:
        roles = (await request(client, admin, "GET", "/roles")).json()
        role_id = next(role["id"] for role in roles if role["codigo"] == target)
        message = "Los roles de sistema no pueden eliminarse"
    before = await snapshot(client, admin)

    rejected = await request(client, deleter, "DELETE", f"/roles/{role_id}", 409)

    assert rejected.json() == {"detail": message}
    assert await snapshot(client, admin) == before


async def test_delete_only_user_can_delete_empty_custom_role(
    client: AsyncClient, admin: dict[str, str], seeder: Seeder
) -> None:
    user_id = await seeder.create_user(username="deleter", email="deleter@example.test")
    await seeder.grant_role(user_id, role_code="DELETER", permissions=("identity.roles.delete",))
    deleter = await login(client, "deleter")
    role = (
        await request(
            client, admin, "POST", "/roles", 201, {"codigo": "REMOVABLE", "nombre": "Removable"}
        )
    ).json()
    before = await snapshot(client, admin)

    await request(client, deleter, "DELETE", f"/roles/{role['id']}", 204)

    after = await snapshot(client, admin)
    assert after[0] == before[0]
    assert after[2] == before[2]
    roles = (await request(client, admin, "GET", "/roles?limit=100")).json()
    assert {item["codigo"] for item in roles} == {
        "ADMINISTRADOR",
        "ESTADISTICA",
        "FACTURACION",
        "DELETER",
    }
    assert (await request(client, admin, "GET", f"/roles/{role['id']}", 404)).json() == {
        "detail": "Rol no encontrado"
    }
