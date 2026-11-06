"""Administracion IAM por HTTP: autorizacion por rol y consistencia transaccional."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexora.bootstrap.settings import Settings
from nexora.identity_access.application.use_cases.administration import (
    PermissionAdministration,
    RoleAdministration,
    UserAdministration,
)
from nexora.identity_access.domain.exceptions.identity import ConflictError
from nexora.identity_access.infrastructure.persistence.administration_repository import (
    SqlAlchemyAdministrationRepository,
)
from nexora.identity_access.infrastructure.persistence.transaction import SqlAlchemyTransaction
from nexora.identity_access.infrastructure.security.password_hasher import Argon2PasswordHasher
from nexora.shared_kernel.clock import SystemClock
from tests.integration.conftest import ORIGIN, PASSWORD, Seeder

NEW_PASSWORD = "Clave123456*"
USER = {
    "nombre_usuario": "nuevo",
    "correo": "nuevo@example.test",
    "primer_nombre": " Ana ",
    "primer_apellido": " Perez ",
    "segundo_nombre": " Maria ",
    "segundo_apellido": " Lopez ",
    "numero_telefono": " 3001234567 ",
    "contrasena": NEW_PASSWORD,
}
FORBIDDEN = {"detail": "No tiene permisos para ejecutar esta operacion"}
LAST_ADMIN = "No se puede dejar al sistema sin un administrador activo"
DUPLICATE_USER = "El nombre de usuario o el correo ya estan registrados"


async def login(client: AsyncClient, username: str, password: str = PASSWORD) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"identificador": username, "contrasena": password},
        headers={"origin": ORIGIN},
    )
    assert response.status_code == 200, response.text
    assert "hash_contrasena" not in response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def assign_seeded_role(session: AsyncSession, user_id: UUID, code: str) -> None:
    await session.execute(
        text(
            "INSERT INTO iam.asignacion_rol (usuario_id, rol_id) "
            "SELECT :user_id, id FROM iam.rol WHERE codigo = :code"
        ),
        {"user_id": user_id, "code": code},
    )
    await session.commit()


@pytest.fixture
async def admin(client: AsyncClient, seeder: Seeder, db_session: AsyncSession) -> dict[str, str]:
    user_id = await seeder.create_user(username="admin", email="admin@example.test")
    await assign_seeded_role(db_session, user_id, "ADMINISTRADOR")
    return await login(client, "admin")


@pytest.fixture(autouse=True)
async def clean_custom_permissions(db_session: AsyncSession) -> AsyncIterator[None]:
    yield
    await db_session.execute(
        text(
            "DELETE FROM iam.rol_permiso WHERE permiso_id IN "
            "(SELECT id FROM iam.permiso WHERE modulo = 'iam_test')"
        )
    )
    await db_session.execute(text("DELETE FROM iam.permiso WHERE modulo = 'iam_test'"))
    await db_session.commit()


async def snapshot(client: AsyncClient, admin: dict[str, str]) -> list[object]:
    result: list[object] = []
    for resource in ("users", "roles", "permissions"):
        response = await client.get(f"/api/v1/{resource}?limit=100", headers=admin)
        assert response.status_code == 200, response.text
        assert "hash_contrasena" not in response.text
        result.append(response.json())
    return result


async def request(
    client: AsyncClient,
    admin: dict[str, str],
    method: str,
    path: str,
    status: int = 200,
    payload: dict[str, object] | None = None,
) -> Response:
    response = await client.request(method, f"/api/v1{path}", headers=admin, json=payload)
    assert response.status_code == status, response.text
    assert "hash_contrasena" not in response.text
    assert NEW_PASSWORD not in response.text
    if status == 204:
        assert response.content == b""
    return response


async def resources(client: AsyncClient, admin: dict[str, str]) -> tuple[str, str, str]:
    user = await request(client, admin, "POST", "/users", 201, USER)
    role = await request(
        client, admin, "POST", "/roles", 201, {"codigo": "CUSTOM", "nombre": " Custom "}
    )
    permission = await request(
        client,
        admin,
        "POST",
        "/permissions",
        201,
        {"codigo": "custom.view", "nombre": " View ", "modulo": "iam_test"},
    )
    assert user.json()["primer_nombre"] == "Ana"
    assert user.json()["primer_apellido"] == "Perez"
    assert user.json()["segundo_nombre"] == "Maria"
    assert user.json()["segundo_apellido"] == "Lopez"
    assert user.json()["numero_telefono"] == "3001234567"
    assert user.json()["estado"] == "activo"
    assert user.json()["roles"] == []
    assert role.json()["nombre"] == "Custom"
    assert role.json()["permisos"] == []
    assert permission.json()["nombre"] == "View"
    return user.json()["id"], role.json()["id"], permission.json()["id"]


def operations(user: str, role: str, permission: str) -> list[tuple[str, str, object]]:
    return [
        ("POST", "/users", USER),
        ("GET", "/users", None),
        ("GET", f"/users/{user}", None),
        ("PATCH", f"/users/{user}", {"primer_nombre": "Otra"}),
        ("DELETE", f"/users/{user}", None),
        ("PUT", f"/users/{user}/roles/{role}", None),
        ("DELETE", f"/users/{user}/roles/{role}", None),
        ("POST", "/roles", {"codigo": "OTHER", "nombre": "Otro"}),
        ("GET", "/roles", None),
        ("GET", f"/roles/{role}", None),
        ("PATCH", f"/roles/{role}", {"nombre": "Otro"}),
        ("DELETE", f"/roles/{role}", None),
        ("PUT", f"/roles/{role}/permissions/{permission}", None),
        ("DELETE", f"/roles/{role}/permissions/{permission}", None),
        ("POST", "/permissions", {"codigo": "other.view", "nombre": "Otro", "modulo": "iam_test"}),
        ("GET", "/permissions", None),
        ("GET", f"/permissions/{permission}", None),
        ("PATCH", f"/permissions/{permission}", {"nombre": "Otro"}),
        ("DELETE", f"/permissions/{permission}", None),
    ]


@pytest.mark.parametrize("role_code", [None, "ESTADISTICA", "FACTURACION", "ALL_PERMISSIONS"])
async def test_every_endpoint_rejects_non_administrators_without_changes(
    client: AsyncClient,
    admin: dict[str, str],
    seeder: Seeder,
    db_session: AsyncSession,
    role_code: str | None,
) -> None:
    user, role, permission = await resources(client, admin)
    await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
    await request(client, admin, "PUT", f"/roles/{role}/permissions/{permission}")
    headers: dict[str, str] = {}
    if role_code:
        outsider = await seeder.create_user(username="outsider", email="outsider@example.test")
        if role_code == "ALL_PERMISSIONS":
            codes = tuple(
                (
                    await db_session.execute(
                        text("SELECT codigo FROM iam.permiso WHERE codigo LIKE 'identity.%'")
                    )
                ).scalars()
            )
            assert codes
            await seeder.grant_role(outsider, role_code=role_code, permissions=codes)
        else:
            await assign_seeded_role(db_session, outsider, role_code)
        headers = await login(client, "outsider")
        me = await client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        if role_code == "ALL_PERMISSIONS":
            assert set(codes) <= set(me.json()["permisos"])
    before = await snapshot(client, admin)
    for method, path, payload in operations(user, role, permission):
        response = await client.request(method, f"/api/v1{path}", headers=headers, json=payload)
        assert response.status_code == (403 if role_code else 401), (method, path, response.text)
        assert response.json() == (
            FORBIDDEN if role_code else {"detail": "Falta el encabezado Authorization: Bearer"}
        )
        assert await snapshot(client, admin) == before


async def test_administrator_crud_assignments_and_effective_permissions(
    client: AsyncClient,
    admin: dict[str, str],
) -> None:
    user, role, permission = await resources(client, admin)
    await snapshot(client, admin)
    for resource, identifier, changes in (
        ("users", user, {"primer_nombre": "Bea", "segundo_nombre": "Maria", "estado": "inactivo"}),
        ("roles", role, {"nombre": "Editado", "descripcion": "Detalle", "estado": "inactivo"}),
        ("permissions", permission, {"nombre": "Editado", "descripcion": "Detalle"}),
    ):
        await request(client, admin, "GET", f"/{resource}/{identifier}")
        updated = await request(client, admin, "PATCH", f"/{resource}/{identifier}", 200, changes)
        for key, value in changes.items():
            assert updated.json()[key] == value
    await request(client, admin, "PATCH", f"/users/{user}", 200, {"estado": "activo"})
    await request(client, admin, "PATCH", f"/roles/{role}", 200, {"estado": "activo"})
    assigned = await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
    assert assigned.json()["roles"] == ["CUSTOM"]
    repeated = await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
    assert repeated.json() == assigned.json()
    headers = await login(client, "nuevo", NEW_PASSWORD)
    assert (await client.get("/api/v1/auth/me", headers=headers)).json()["permisos"] == []
    assigned_permission = await request(
        client, admin, "PUT", f"/roles/{role}/permissions/{permission}"
    )
    assert assigned_permission.json()["permisos"] == ["custom.view"]
    effective = (await client.get("/api/v1/auth/me", headers=headers)).json()
    assert effective["permisos"] == ["custom.view"]
    await request(client, admin, "DELETE", f"/roles/{role}/permissions/{permission}", 204)
    assert (await client.get("/api/v1/auth/me", headers=headers)).json()["permisos"] == []
    await request(client, admin, "DELETE", f"/users/{user}/roles/{role}", 204)
    assert (await client.get("/api/v1/auth/me", headers=headers)).json()["roles"] == []
    for resource, identifier in (("users", user), ("roles", role), ("permissions", permission)):
        await request(client, admin, "DELETE", f"/{resource}/{identifier}", 204)
        response = await request(client, admin, "GET", f"/{resource}/{identifier}", 404)
        label = {"users": "Usuario", "roles": "Rol", "permissions": "Permiso"}[resource]
        assert response.json() == {"detail": f"{label} no encontrado"}


@pytest.mark.parametrize("action", ["deactivate", "revoke", "delete"])
async def test_last_active_admin_and_self_protection(
    client: AsyncClient,
    admin: dict[str, str],
    action: str,
) -> None:
    me = (await client.get("/api/v1/auth/me", headers=admin)).json()
    own_id = me["usuario"]["id"]
    roles = (await request(client, admin, "GET", "/roles")).json()
    role_id = next(role["id"] for role in roles if role["codigo"] == "ADMINISTRADOR")
    before = await snapshot(client, admin)
    method, path, payload = {
        "deactivate": ("PATCH", f"/users/{own_id}", {"estado": "inactivo"}),
        "revoke": ("DELETE", f"/users/{own_id}/roles/{role_id}", None),
        "delete": ("DELETE", f"/users/{own_id}", None),
    }[action]
    response = await request(client, admin, method, path, 409, payload)
    message = "No puede eliminar su propia cuenta" if action == "delete" else LAST_ADMIN
    assert response.json() == {"detail": message}
    assert await snapshot(client, admin) == before
    second = (await request(client, admin, "POST", "/users", 201, USER)).json()["id"]
    await request(client, admin, "PUT", f"/users/{second}/roles/{role_id}")
    second_headers = await login(client, "nuevo", NEW_PASSWORD)
    if action == "delete":
        before = await snapshot(client, admin)
        await request(client, admin, "DELETE", f"/users/{own_id}", 409)
        assert await snapshot(client, admin) == before
        await request(client, second_headers, "DELETE", f"/users/{own_id}", 204)
    else:
        await request(
            client, second_headers, method, path, 200 if action == "deactivate" else 204, payload
        )
        response = await request(client, second_headers, "GET", f"/users/{own_id}")
        assert response.json()["estado"] == ("inactivo" if action == "deactivate" else "activo")
        if action == "revoke":
            assert "ADMINISTRADOR" not in response.json()["roles"]
    assert (await client.get("/api/v1/auth/me", headers=second_headers)).status_code == 200


async def test_protected_deletions_and_duplicates(
    client: AsyncClient,
    admin: dict[str, str],
) -> None:
    user, role, permission = await resources(client, admin)
    await request(client, admin, "PUT", f"/users/{user}/roles/{role}")
    await request(client, admin, "PUT", f"/roles/{role}/permissions/{permission}")
    roles = (await request(client, admin, "GET", "/roles")).json()
    permissions = (await request(client, admin, "GET", "/permissions")).json()
    attempts = [
        (f"/roles/{role}", "El rol tiene usuarios asignados: revoque las asignaciones primero"),
        (f"/permissions/{permission}", "El permiso esta asignado a roles: revoquelo primero"),
    ]
    attempts += [
        (f"/roles/{r['id']}", "Los roles de sistema no pueden eliminarse")
        for r in roles
        if r["codigo"] in {"ADMINISTRADOR", "ESTADISTICA", "FACTURACION"}
    ]
    catalog_message = "Los permisos del catalogo del sistema no pueden eliminarse"
    attempts += [
        (f"/permissions/{p['id']}", catalog_message)
        for p in permissions
        if p["codigo"].startswith("identity.")
    ]
    before = await snapshot(client, admin)
    for path, message in attempts:
        assert (await request(client, admin, "DELETE", path, 409)).json() == {"detail": message}
        assert await snapshot(client, admin) == before
    for path, payload, message in (
        ("/users", {**USER, "correo": "other@example.test"}, DUPLICATE_USER),
        ("/users", {**USER, "nombre_usuario": "other"}, DUPLICATE_USER),
        ("/roles", {"codigo": "CUSTOM", "nombre": "Otro"}, "Ya existe un rol con ese codigo"),
        (
            "/permissions",
            {"codigo": "custom.view", "nombre": "Otro", "modulo": "iam_test"},
            "Ya existe un permiso con ese codigo",
        ),
    ):
        response = await request(client, admin, "POST", path, 409, payload)
        assert response.json() == {"detail": message}
        assert await snapshot(client, admin) == before
    missing = str(uuid4())
    for method, path, payload in operations(missing, missing, missing):
        if path in {"/users", "/roles", "/permissions"}:
            continue
        response = await request(client, admin, method, path, 404, payload)
        label = {"users": "Usuario", "roles": "Rol", "permissions": "Permiso"}[path.split("/")[1]]
        assert response.json() == {"detail": f"{label} no encontrado"}
        assert await snapshot(client, admin) == before
    for method in ("PUT", "DELETE"):
        for path, label in (
            (f"/users/{user}/roles/{missing}", "Rol"),
            (f"/roles/{role}/permissions/{missing}", "Permiso"),
        ):
            response = await request(client, admin, method, path, 404)
            assert response.json() == {"detail": f"{label} no encontrado"}
            assert await snapshot(client, admin) == before


@pytest.mark.parametrize("resource", ["users", "roles", "permissions"])
async def test_validation_pagination_and_immutable_codes(
    client: AsyncClient,
    admin: dict[str, str],
    resource: str,
) -> None:
    user, role, permission = await resources(client, admin)
    identifier = {"users": user, "roles": role, "permissions": permission}[resource]
    before = await snapshot(client, admin)
    for query in ("limit=0", "limit=101", "offset=-1"):
        await request(client, admin, "GET", f"/{resource}?{query}", 422)
        assert await snapshot(client, admin) == before
    full = (await request(client, admin, "GET", f"/{resource}?limit=100")).json()
    page = (await request(client, admin, "GET", f"/{resource}?limit=1&offset=1")).json()
    assert page == full[1:2]
    assert (await request(client, admin, "GET", f"/{resource}?limit=100&offset=100")).json() == []
    bad_payloads: list[dict[str, object]] = [
        {"unknown": "value"},
        {"nombre" if resource != "users" else "primer_nombre": "   "},
    ]
    if resource != "users":
        bad_payloads.append({"codigo": "CHANGED" if resource == "roles" else "changed.code"})
    else:
        bad_payloads.append({"estado": "otro"})
    for payload in bad_payloads:
        await request(client, admin, "PATCH", f"/{resource}/{identifier}", 422, payload)
        assert await snapshot(client, admin) == before
    base: dict[str, object] = {
        "users": USER,
        "roles": {"codigo": "VALID", "nombre": "Nombre"},
        "permissions": {"codigo": "valid.code", "nombre": "Nombre", "modulo": "iam_test"},
    }[resource]
    field = "contrasena" if resource == "users" else "codigo"
    invalid = {
        "users": ["short", "x" * 11],
        "roles": ["A", "lower", "A" * 51, "A-B"],
        "permissions": ["single", "Upper.code", "valid..code", "valid.bad-code"],
    }[resource]
    for value in invalid:
        await request(client, admin, "POST", f"/{resource}", 422, {**base, field: value})
        assert await snapshot(client, admin) == before
    await request(client, admin, "POST", f"/{resource}", 422, {**base, "unknown": "value"})
    assert await snapshot(client, admin) == before


@pytest.mark.parametrize("endpoint", ["users", "auth/login"])
async def test_validation_errors_never_echo_secrets(
    client: AsyncClient, admin: dict[str, str], endpoint: str
) -> None:
    secret = "short-D1" if endpoint == "users" else "D1-secret-" * 15
    payload = (
        {**USER, "contrasena": secret}
        if endpoint == "users"
        else {"identificador": " ", "contrasena": secret}
    )
    before = await snapshot(client, admin)
    response = await client.post(f"/api/v1/{endpoint}", headers=admin, json=payload)
    assert response.status_code == 422
    assert secret not in response.text
    errors = response.json()["detail"]
    assert errors
    for error in errors:
        assert "input" not in error
        assert "ctx" not in error
        assert error["loc"][0] == "body"
        assert error["msg"]
    assert any(error["loc"] == ["body", "contrasena"] for error in errors)
    assert await snapshot(client, admin) == before


@pytest.mark.parametrize(
    ("resource", "fields"),
    [
        (
            "users",
            (
                "nombre_usuario",
                "correo",
                "primer_nombre",
                "segundo_nombre",
                "primer_apellido",
                "segundo_apellido",
                "numero_telefono",
                "estado",
            ),
        ),
        ("roles", ("nombre", "descripcion", "estado")),
        ("permissions", ("nombre", "modulo", "descripcion")),
    ],
)
async def test_patch_rejects_each_explicit_null_but_preserves_omission(
    client: AsyncClient, admin: dict[str, str], resource: str, fields: tuple[str, ...]
) -> None:
    user, role, permission = await resources(client, admin)
    identifier = {"users": user, "roles": role, "permissions": permission}[resource]
    path = f"/{resource}/{identifier}"
    before = await snapshot(client, admin)
    original = (await request(client, admin, "GET", path)).json()
    for field in fields:
        response = await request(client, admin, "PATCH", path, 422, {field: None})
        assert response.json()["detail"][0]["loc"] == ["body", field]
        assert await snapshot(client, admin) == before
    assert (await request(client, admin, "PATCH", path, 200, {})).json() == original
    name = "primer_nombre" if resource == "users" else "nombre"
    changed = (await request(client, admin, "PATCH", path, 200, {name: "Cambio"})).json()
    assert changed == {**original, name: "Cambio"}


async def test_create_user_password_length_boundaries(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    before = await snapshot(client, admin)
    await request(client, admin, "POST", "/users", 422, {**USER, "contrasena": "x" * 129})
    assert await snapshot(client, admin) == before
    for length in (12, 128):
        password = "x" * length
        username = f"length{length}"
        created = await request(
            client,
            admin,
            "POST",
            "/users",
            201,
            {
                **USER,
                "nombre_usuario": username,
                "correo": f"{username}@example.test",
                "contrasena": password,
            },
        )
        assert password not in created.text
        await login(client, username, password)


@pytest.mark.parametrize("kind", ["role", "permission"])
async def test_assignment_serializes_with_deletion(
    client: AsyncClient, admin: dict[str, str], settings: Settings, kind: str
) -> None:
    user, role, permission = await resources(client, admin)
    actor = UUID((await client.get("/api/v1/auth/me", headers=admin)).json()["usuario"]["id"])
    engine = create_async_engine(settings.database_url)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    assignment_entered = asyncio.Event()
    release_assignment = asyncio.Event()
    deletion_started = asyncio.Event()
    assignment_committed = asyncio.Event()

    class AssigningRepository(SqlAlchemyAdministrationRepository):
        async def assign_role(self, user_id: UUID, role_id: UUID, assigned_by: UUID) -> None:
            assignment_entered.set()
            await release_assignment.wait()
            await super().assign_role(user_id, role_id, assigned_by)

        async def assign_permission(self, role_id: UUID, permission_id: UUID) -> None:
            assignment_entered.set()
            await release_assignment.wait()
            await super().assign_permission(role_id, permission_id)

    class DeletingRepository(SqlAlchemyAdministrationRepository):
        async def lock_access_changes(self) -> None:
            deletion_started.set()
            await super().lock_access_changes()

        async def count_role_assignments(self, role_id: UUID) -> int:
            count = await super().count_role_assignments(role_id)
            deletion_started.set()
            await assignment_committed.wait()
            return count

        async def count_permission_roles(self, permission_id: UUID) -> int:
            count = await super().count_permission_roles(permission_id)
            deletion_started.set()
            await assignment_committed.wait()
            return count

    try:
        async with factory() as session_a, factory() as session_b:
            assigning = AssigningRepository(session_a)
            deleting = DeletingRepository(session_b)
            roles_a = RoleAdministration(
                repository=assigning, transaction=SqlAlchemyTransaction(session_a)
            )
            users_a = UserAdministration(
                repository=assigning,
                transaction=SqlAlchemyTransaction(session_a),
                hasher=Argon2PasswordHasher(),
                clock=SystemClock(),
            )
            roles_b = RoleAdministration(
                repository=deleting, transaction=SqlAlchemyTransaction(session_b)
            )
            permissions_b = PermissionAdministration(
                repository=deleting, transaction=SqlAlchemyTransaction(session_b)
            )

            async def assign() -> None:
                try:
                    if kind == "role":
                        await users_a.assign_role(UUID(user), UUID(role), actor_id=actor)
                    else:
                        await roles_a.assign_permission(UUID(role), UUID(permission))
                finally:
                    assignment_committed.set()

            async def delete() -> None:
                try:
                    if kind == "role":
                        await roles_b.delete(UUID(role))
                    else:
                        await permissions_b.delete(UUID(permission))
                finally:
                    await session_b.rollback()

            async with asyncio.timeout(10):
                assignment = asyncio.create_task(assign())
                await assignment_entered.wait()
                deletion = asyncio.create_task(delete())
                try:
                    await deletion_started.wait()
                finally:
                    release_assignment.set()
                outcomes = await asyncio.gather(assignment, deletion, return_exceptions=True)
            assert outcomes[0] is None, outcomes
            assert isinstance(outcomes[1], ConflictError), outcomes
            message = (
                "El rol tiene usuarios asignados: revoque las asignaciones primero"
                if kind == "role"
                else "El permiso esta asignado a roles: revoquelo primero"
            )
            assert str(outcomes[1]) == message
        path = f"/users/{user}" if kind == "role" else f"/roles/{role}"
        stored = (await request(client, admin, "GET", path)).json()
        assert stored["roles" if kind == "role" else "permisos"] == [
            "CUSTOM" if kind == "role" else "custom.view"
        ]
        target = f"/roles/{role}" if kind == "role" else f"/permissions/{permission}"
        assert (await request(client, admin, "DELETE", target, 409)).json() == {"detail": message}
    finally:
        release_assignment.set()
        assignment_committed.set()
        await engine.dispose()


async def test_inactive_second_admin_does_not_bypass_last_active_protection(
    client: AsyncClient,
    admin: dict[str, str],
) -> None:
    own_id = (await client.get("/api/v1/auth/me", headers=admin)).json()["usuario"]["id"]
    roles = (await request(client, admin, "GET", "/roles")).json()
    role_id = next(role["id"] for role in roles if role["codigo"] == "ADMINISTRADOR")
    second = (await request(client, admin, "POST", "/users", 201, USER)).json()["id"]
    await request(client, admin, "PUT", f"/users/{second}/roles/{role_id}")
    await request(client, admin, "PATCH", f"/users/{second}", 200, {"estado": "inactivo"})
    before = await snapshot(client, admin)
    for method, path, payload, message in (
        ("PATCH", f"/users/{own_id}", {"estado": "inactivo"}, LAST_ADMIN),
        ("DELETE", f"/users/{own_id}/roles/{role_id}", None, LAST_ADMIN),
        (
            "PATCH",
            f"/roles/{role_id}",
            {"estado": "inactivo"},
            "El rol ADMINISTRADOR no puede desactivarse",
        ),
    ):
        response = await request(client, admin, method, path, 409, payload)
        assert response.json() == {"detail": message}
        assert await snapshot(client, admin) == before
