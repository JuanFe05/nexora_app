"""Matriz adversarial de permisos independientes y limites de delegacion IAM."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.domain.value_objects.access_catalog import PERMISSION_CATALOG
from tests.integration.conftest import Seeder
from tests.integration.test_iam_administration import (
    FORBIDDEN,
    USER,
    admin,
    assign_seeded_role,
    clean_custom_permissions,
    login,
    request,
    resources,
)

# Reuse administration fixtures, including cleanup of custom permissions.
__all__ = ["admin", "clean_custom_permissions"]
CODES = tuple(spec.code for spec in PERMISSION_CATALOG)
ACTIONS = (
    ("POST", "users", "create"),
    ("GET", "users", "list"),
    ("GET", "users", "view"),
    ("PATCH", "users", "update"),
    ("PATCH", "users", "deactivate"),
    ("PATCH", "users", "update_and_deactivate"),
    ("DELETE", "users", "delete"),
    ("PUT", "users", "assign_roles"),
    ("DELETE", "users", "assign_roles"),
    ("POST", "roles", "create"),
    ("GET", "roles", "list"),
    ("GET", "roles", "view"),
    ("PATCH", "roles", "update"),
    ("DELETE", "roles", "delete"),
    ("PUT", "roles", "assign_permissions"),
    ("DELETE", "roles", "assign_permissions"),
    ("POST", "permissions", "create"),
    ("GET", "permissions", "list"),
    ("GET", "permissions", "view"),
    ("PATCH", "permissions", "update"),
    ("DELETE", "permissions", "delete"),
)


async def stored_access(session: AsyncSession) -> list[object]:
    """All administration rows, including links; session activity is intentionally excluded."""
    result: list[object] = []
    for table in ("usuario", "rol", "permiso", "asignacion_rol", "rol_permiso"):
        result.append(
            list(
                (
                    await session.execute(
                        text(
                            f"SELECT row_to_json(t) FROM iam.{table} t "  # noqa: S608 (fixed list)
                            "ORDER BY row_to_json(t)::text"
                        )
                    )
                ).scalars()
            )
        )
    return result


async def actor_headers(
    client: AsyncClient, seeder: Seeder, session: AsyncSession, mode: str
) -> tuple[dict[str, str], UUID | None]:
    if mode == "unauthenticated":
        return {}, None
    user_id = await seeder.create_user(username="actor", email="actor@example.test")
    if mode == "administrator":
        await assign_seeded_role(session, user_id, "ADMINISTRADOR")
    elif mode != "roleless":
        await seeder.grant_role(
            user_id, role_code="ACTOR", permissions=CODES if mode == "all" else (mode,)
        )
    return await login(client, "actor"), user_id


@pytest.mark.parametrize("mode", (*CODES, "all", "administrator", "roleless", "unauthenticated"))
@pytest.mark.parametrize(("method", "resource", "action"), ACTIONS)
async def test_endpoint_permission_matrix(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
    mode: str,
    method: str,
    resource: str,
    action: str,
) -> None:
    user, role, permission = await resources(client, admin)
    headers, _ = await actor_headers(client, seeder, db_session, mode)
    identifier = {"users": user, "roles": role, "permissions": permission}[resource]
    path = f"/{resource}"
    payload = None
    if action not in {"create", "list"}:
        path += f"/{identifier}"
    if action == "create":
        payload = {
            "users": {**USER, "nombre_usuario": "other", "correo": "other@example.test"},
            "roles": {"codigo": "OTHER", "nombre": "Otro"},
            "permissions": {"codigo": "other.view", "nombre": "Otro", "modulo": "iam_test"},
        }[resource]
    elif action == "update":
        payload = {"primer_nombre" if resource == "users" else "nombre": "Cambio"}
    elif action == "deactivate":
        payload = {"estado": "inactivo"}
    elif action == "update_and_deactivate":
        payload = {"primer_nombre": "Cambio", "estado": "inactivo"}
    elif action == "assign_roles":
        path += f"/roles/{role}"
        if method == "DELETE":
            await request(client, admin, "PUT", path)
    elif action == "assign_permissions":
        # A delegate can grant its own action permission, not an unowned custom permission.
        catalog = (await request(client, admin, "GET", "/permissions")).json()
        permission = next(
            p["id"] for p in catalog if p["codigo"] == "identity.roles.assign_permissions"
        )
        path += f"/permissions/{permission}"
        if method == "DELETE":
            await request(client, admin, "PUT", path)
    required = (
        {"identity.users.update", "identity.users.deactivate"}
        if action == "update_and_deactivate"
        else {f"identity.{resource}.{'view' if action == 'list' else action}"}
    )
    granted = set(CODES) if mode in {"all", "administrator"} else {mode}
    allowed = required <= granted
    success = 201 if method == "POST" else 204 if method == "DELETE" else 200
    expected = success if allowed else 401 if mode == "unauthenticated" else 403
    before = await stored_access(db_session)
    response = await client.request(method, f"/api/v1{path}", headers=headers, json=payload)
    assert response.status_code == expected, response.text
    if not allowed:
        assert response.json() == (
            {"detail": "Falta el encabezado Authorization: Bearer"}
            if expected == 401
            else FORBIDDEN
        )
        assert await stored_access(db_session) == before
        # No information leak, including missing nested IDs, even with well-formed UUIDs.
        missing_path = path.replace(identifier, str(uuid4()))
        if action in {"assign_roles", "assign_permissions"}:
            missing_path = missing_path.rsplit("/", 1)[0] + f"/{uuid4()}"
        missing = await client.request(
            method, f"/api/v1{missing_path}", headers=headers, json=payload
        )
        assert missing.status_code == expected, missing.text
        assert missing.json() == response.json()
        assert await stored_access(db_session) == before
    elif expected == 204:
        assert response.content == b""
    else:
        assert "hash_contrasena" not in response.text
        if action == "create":
            assert response.json()["id"]
        elif payload is not None:
            assert all(response.json()[key] == value for key, value in payload.items())


@pytest.mark.parametrize(
    "permissions",
    [
        (),
        ("identity.users.update",),
        ("identity.users.deactivate",),
        ("identity.users.update", "identity.users.deactivate"),
    ],
)
@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"primer_nombre": "Cambio"},
        {"estado": "inactivo"},
        {"primer_nombre": "Cambio", "estado": "inactivo"},
    ],
)
async def test_patch_fields_and_status_are_independent(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
    permissions: tuple[str, ...],
    payload: dict[str, str],
) -> None:
    user, _, _ = await resources(client, admin)
    actor = await seeder.create_user(username="actor", email="actor@example.test")
    await seeder.grant_role(actor, role_code="ACTOR", permissions=permissions)
    headers = await login(client, "actor")
    required = set()
    if not payload or set(payload) - {"estado"}:
        required.add("identity.users.update")
    if "estado" in payload:
        required.add("identity.users.deactivate")
    allowed = required <= set(permissions)
    before = await stored_access(db_session)
    original = (await request(client, admin, "GET", f"/users/{user}")).json()
    response = await client.patch(f"/api/v1/users/{user}", headers=headers, json=payload)
    assert response.status_code == (200 if allowed else 403), response.text
    if allowed:
        assert response.json() == {**original, **payload}
    else:
        assert response.json() == FORBIDDEN
        assert await stored_access(db_session) == before


async def test_same_token_uses_current_active_role_permissions(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
) -> None:
    user = await seeder.create_user(username="actor", email="actor@example.test")
    holder = await seeder.create_user(username="holder", email="holder@example.test")
    role = await seeder.grant_role(holder, role_code="VIEWER", permissions=("identity.roles.view",))
    headers = await login(client, "actor")
    for assigned in (False, True, False):
        if assigned:
            await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
        elif (await client.get("/api/v1/auth/me", headers=headers)).json()["roles"]:
            await request(client, admin, "DELETE", f"/users/{user}/roles/{role}", 204)
        before = await stored_access(db_session)
        response = await client.get("/api/v1/roles", headers=headers)
        assert response.status_code == (200 if assigned else 403), response.text
        if not assigned:
            assert response.json() == FORBIDDEN
            assert await stored_access(db_session) == before
    await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
    await request(client, admin, "PATCH", f"/roles/{role}", 200, {"estado": "inactivo"})
    before = await stored_access(db_session)
    response = await client.get("/api/v1/roles", headers=headers)
    assert response.status_code == 403
    assert response.json() == FORBIDDEN
    assert await stored_access(db_session) == before
    await request(client, admin, "PATCH", f"/roles/{role}", 200, {"estado": "activo"})
    assert (await client.get("/api/v1/roles", headers=headers)).status_code == 200


@pytest.mark.parametrize(
    ("action", "self_target"),
    [
        ("assign_admin", False),
        ("assign_admin", True),
        ("revoke_admin", False),
        ("assign_powerful_role", False),
        ("assign_powerful_role", True),
        ("assign_permission", False),
        ("assign_permission", True),
    ],
)
async def test_anti_escalation_is_atomic(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
    self_target: bool,
    action: str,
) -> None:
    user, role, permission = await resources(client, admin)
    actor = await seeder.create_user(username="actor", email="actor@example.test")
    await seeder.grant_role(actor, role_code="ACTOR", permissions=CODES)
    headers = await login(client, "actor")
    roles = (await request(client, admin, "GET", "/roles")).json()
    admin_role = next(r["id"] for r in roles if r["codigo"] == "ADMINISTRADOR")
    target = str(actor) if self_target else user
    if action == "assign_admin":
        method, path = "PUT", f"/users/{target}/roles/{admin_role}"
    elif action == "revoke_admin":
        await request(client, admin, "PUT", f"/users/{target}/roles/{admin_role}")
        method, path = "DELETE", f"/users/{target}/roles/{admin_role}"
    elif action == "assign_powerful_role":
        await request(client, admin, "PUT", f"/roles/{role}/permissions/{permission}")
        method, path = "PUT", f"/users/{target}/roles/{role}"
    else:
        if self_target:
            role = str(
                (
                    await db_session.execute(text("SELECT id FROM iam.rol WHERE codigo = 'ACTOR'"))
                ).scalar_one()
            )
        method, path = "PUT", f"/roles/{role}/permissions/{permission}"
    before = await stored_access(db_session)
    response = await client.request(method, f"/api/v1{path}", headers=headers)
    assert response.status_code == 403, response.text
    assert response.json() == FORBIDDEN
    assert await stored_access(db_session) == before


@pytest.mark.parametrize("inactive", [False, True])
@pytest.mark.parametrize(
    ("method", "payload"),
    [
        ("PATCH", {"primer_nombre": "Ataque"}),
        ("PATCH", {"estado": "inactivo"}),
        ("PATCH", {"estado": "activo"}),
        ("DELETE", None),
    ],
)
async def test_non_administrator_cannot_manage_administrator_users(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
    inactive: bool,
    method: str,
    payload: dict[str, str] | None,
) -> None:
    user, _, _ = await resources(client, admin)
    headers, _ = await actor_headers(client, seeder, db_session, "all")
    roles = (await request(client, admin, "GET", "/roles")).json()
    admin_role = next(r["id"] for r in roles if r["codigo"] == "ADMINISTRADOR")
    await request(client, admin, "PUT", f"/users/{user}/roles/{admin_role}")
    if inactive:
        await request(client, admin, "PATCH", f"/users/{user}", 200, {"estado": "inactivo"})
    before = await stored_access(db_session)
    response = await client.request(method, f"/api/v1/users/{user}", headers=headers, json=payload)
    assert response.status_code == 403, response.text
    assert response.json() == FORBIDDEN
    assert await stored_access(db_session) == before


async def test_delegate_can_assign_a_role_only_when_it_owns_every_permission(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
) -> None:
    user, role, custom_permission = await resources(client, admin)
    headers, actor = await actor_headers(client, seeder, db_session, "identity.users.assign_roles")
    catalog = (await request(client, admin, "GET", "/permissions")).json()
    owned = next(p["id"] for p in catalog if p["codigo"] == "identity.users.assign_roles")
    await request(client, admin, "PUT", f"/roles/{role}/permissions/{owned}")
    await request(client, headers, "PUT", f"/users/{actor}/roles/{role}")
    await request(client, headers, "DELETE", f"/users/{actor}/roles/{role}", 204)
    await request(client, admin, "PUT", f"/roles/{role}/permissions/{custom_permission}")
    before = await stored_access(db_session)
    response = await client.put(f"/api/v1/users/{user}/roles/{role}", headers=headers)
    assert response.status_code == 403
    assert response.json() == FORBIDDEN
    assert await stored_access(db_session) == before
    # Revoking an ordinary role does not require holding the role's permissions.
    await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
    await request(client, headers, "DELETE", f"/users/{user}/roles/{role}", 204)


async def test_delegate_can_revoke_an_unowned_permission_from_an_ordinary_role(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
) -> None:
    _, role, permission = await resources(client, admin)
    headers, _ = await actor_headers(
        client, seeder, db_session, "identity.roles.assign_permissions"
    )
    await request(client, admin, "PUT", f"/roles/{role}/permissions/{permission}")
    await request(client, headers, "DELETE", f"/roles/{role}/permissions/{permission}", 204)
    stored = (await request(client, admin, "GET", f"/roles/{role}")).json()
    assert stored["permisos"] == []


@pytest.mark.parametrize(
    "permissions",
    [(), ("identity.users.view",), ("identity.users.delete",), ("identity.users.assign_roles",)],
)
@pytest.mark.parametrize("target", ["existing", "random"])
@pytest.mark.parametrize(
    "send",
    [
        {},
        {"json": None},
        {"json": {"estado": "INVALID"}},
    ],
    ids=["sin-cuerpo", "null", "estado-invalido"],
)
async def test_user_patch_without_update_or_deactivate_is_403_before_body_validation(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
    permissions: tuple[str, ...],
    target: str,
    send: dict[str, object],
) -> None:
    """Sin update ni deactivate: 403 aunque el cuerpo sea invalido (igual que roles y permisos)."""
    user, _, _ = await resources(client, admin)
    actor = await seeder.create_user(username="actor", email="actor@example.test")
    await seeder.grant_role(actor, role_code="ACTOR", permissions=permissions)
    headers = await login(client, "actor")
    before = await stored_access(db_session)
    identifier = user if target == "existing" else str(uuid4())
    response = await client.patch(f"/api/v1/users/{identifier}", headers=headers, **send)
    assert response.status_code == 403, response.text
    assert response.json() == FORBIDDEN
    assert await stored_access(db_session) == before
