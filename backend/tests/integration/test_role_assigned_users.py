"""Role read counts stay live without changing pagination or issuing N+1 queries."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from httpx import AsyncClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

from tests.integration.test_iam_administration import USER, request
from tests.integration.test_iam_administration import admin as admin


@contextmanager
def sql_statements() -> Iterator[list[str]]:
    statements: list[str] = []

    def record(
        conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool
    ) -> None:
        statements.append(statement)

    event.listen(Engine, "before_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(Engine, "before_cursor_execute", record)


async def test_role_counts_follow_assign_revoke_and_user_deletion(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    created = await request(
        client, admin, "POST", "/roles", 201, {"codigo": "COUNTED", "nombre": "Counted"}
    )
    original = created.json()
    assert original == {
        "id": original["id"],
        "codigo": "COUNTED",
        "nombre": "Counted",
        "descripcion": None,
        "estado": "activo",
        "permisos": [],
        "usuarios_asignados": 0,
    }
    role_id = original["id"]

    async def assert_count(expected: int) -> None:
        listed = await request(client, admin, "GET", "/roles?q=counted")
        assert listed.json() == [{**original, "usuarios_asignados": expected}]
        assert listed.headers["X-Total-Count"] == "1"
        detail = await request(client, admin, "GET", f"/roles/{role_id}")
        assert detail.json() == listed.json()[0]
        unchanged = await request(client, admin, "PATCH", f"/roles/{role_id}", 200, {})
        assert unchanged.json() == detail.json()

    await assert_count(0)
    users: list[str] = []
    for index in range(3):
        username = f"countuser{index}"
        user = await request(
            client,
            admin,
            "POST",
            "/users",
            201,
            {**USER, "nombre_usuario": username, "correo": f"{username}@example.test"},
        )
        users.append(user.json()["id"])
        assigned = await request(client, admin, "PUT", f"/users/{users[-1]}/roles/{role_id}")
        assert assigned.json()["roles"] == ["COUNTED"]
        await assert_count(index + 1)
    # Repeating assignment does not count the same user twice.
    await request(client, admin, "PUT", f"/users/{users[0]}/roles/{role_id}")
    await assert_count(3)
    await request(client, admin, "PATCH", f"/users/{users[1]}", 200, {"estado": "inactivo"})
    await assert_count(3)
    # Assignment count is independent of the role's effective-access status as well.
    updated = await request(
        client, admin, "PATCH", f"/roles/{role_id}", 200, {"estado": "inactivo"}
    )
    assert updated.json() == {**original, "estado": "inactivo", "usuarios_asignados": 3}
    original = {**original, "estado": "inactivo"}
    await assert_count(3)
    # Preserve permission-assignment responses through the shared role response schema.
    permission = (await request(client, admin, "GET", "/permissions")).json()[0]
    assigned = await request(
        client, admin, "PUT", f"/roles/{role_id}/permissions/{permission['id']}"
    )
    assert assigned.json() == {
        **original,
        "permisos": [permission["codigo"]],
        "usuarios_asignados": 3,
    }
    await request(client, admin, "DELETE", f"/roles/{role_id}/permissions/{permission['id']}", 204)
    await assert_count(3)
    revoked = await request(client, admin, "DELETE", f"/users/{users[0]}/roles/{role_id}", 204)
    assert revoked.content == b""
    await assert_count(2)
    before = await request(client, admin, "GET", "/roles?q=counted")
    rejected = await request(client, admin, "DELETE", f"/users/{users[0]}/roles/{role_id}", 404)
    assert rejected.json() == {"detail": "Asignacion de rol no encontrado"}
    assert (await request(client, admin, "GET", "/roles?q=counted")).json() == before.json()
    await request(client, admin, "DELETE", f"/users/{users[1]}", 204)
    await assert_count(1)
    await request(client, admin, "DELETE", f"/users/{users[2]}", 204)
    await assert_count(0)


async def test_role_count_page_search_and_constant_sql_statements(
    client: AsyncClient, admin: dict[str, str]
) -> None:
    user = (await request(client, admin, "POST", "/users", 201, USER)).json()["id"]
    roles: list[dict[str, Any]] = []
    statement_counts: list[int] = []
    for index in range(10):
        role = (
            await request(
                client,
                admin,
                "POST",
                "/roles",
                201,
                {"codigo": f"COUNT_{index:02}", "nombre": f"Page count {index}"},
            )
        ).json()
        if index % 2:
            await request(client, admin, "PUT", f"/users/{user}/roles/{role['id']}")
            role["usuarios_asignados"] = 1
        roles.append(role)
        if index in (2, 9):
            with sql_statements() as statements:
                listed = await request(client, admin, "GET", "/roles?q=COUNT_&limit=100")
            assert listed.json() == roles
            assert listed.headers["X-Total-Count"] == str(index + 1)
            statement_counts.append(len(statements))
            # The role page and its counts are fetched by one SELECT, not one per role.
            page_queries = [sql for sql in statements if "usuarios_asignados" in sql]
            assert len(page_queries) == 1
            assert "count(DISTINCT" in page_queries[0]
    assert statement_counts[0] == statement_counts[1]
    assert statement_counts[0] > 0
    for offset in (0, 1, 9, 10, 100):
        page = await request(
            client, admin, "GET", f"/roles?q=  pAgE count  &limit=1&offset={offset}"
        )
        assert page.json() == roles[offset : offset + 1]
        assert page.headers["X-Total-Count"] == "10"
    # The literal underscore filter and ordering are unchanged.
    assert (await request(client, admin, "GET", "/roles?q=COUNT_01")).json() == roles[1:2]
