"""Administrative temporary passwords through the same HTTP surface as their clients."""

from uuid import uuid4

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from tests.integration.conftest import PASSWORD, Seeder
from tests.integration.test_auth_api import csrf_headers
from tests.integration.test_iam_administration import assign_seeded_role

AUTH = "/api/v1/auth"
PROFILE = "/api/v1/profile"
RESET = "/api/v1/users/{}/reset-password"
TEMPORARY = "Temporal456!"
PERSONAL = "Personal789@"
UPDATE = {"contrasena_actual": TEMPORARY, "contrasena_nueva": PERSONAL}
REQUIRED = {"detail": "PASSWORD_CHANGE_REQUIRED"}


async def sign_in(client: AsyncClient, username: str, password: str = PASSWORD) -> Response:
    return await client.post(
        f"{AUTH}/login", json={"identificador": username, "contrasena": password}
    )


def bearer(response: Response) -> dict[str, str]:
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_temporary_password_restricts_access_until_completion(
    app: FastAPI, client: AsyncClient, seeder: Seeder
) -> None:
    actor = await seeder.create_user(username="support", email="support@example.test")
    await seeder.grant_role(
        actor, role_code="SUPPORT", permissions=("identity.users.reset_password",)
    )
    target = await seeder.create_user()
    await seeder.grant_role(target, role_code="VIEWER", permissions=("identity.users.view",))
    admin = bearer(await sign_in(client, "support"))
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as user:
        old = bearer(await sign_in(user, "jperez"))
        other_old = bearer(await sign_in(user, "jperez"))
        reset = await client.post(
            RESET.format(target), headers=admin, json={"contrasena_temporal": TEMPORARY}
        )
        assert (reset.status_code, reset.content) == (204, b"")
        admin_me = await client.get(f"{AUTH}/me", headers=admin)
        assert admin_me.status_code == 200
        assert admin_me.json()["requiere_cambio_contrasena"] is False
        for headers in (old, other_old):
            revoked = await user.get(f"{AUTH}/me", headers=headers)
            assert (revoked.status_code, revoked.json()) == (401, {"detail": "Sesion no activa"})
        revoked = await user.post(f"{AUTH}/refresh", headers=csrf_headers(user))
        assert (revoked.status_code, revoked.json()) == (401, {"detail": "Sesion no activa"})
        assert (await sign_in(user, "jperez")).status_code == 401

        first = await sign_in(user, "jperez", TEMPORARY)
        assert first.status_code == 200
        assert first.json()["requiere_cambio_contrasena"] is True
        assert TEMPORARY not in first.text
        assert (await user.post(f"{AUTH}/logout", headers=csrf_headers(user))).status_code == 204
        assert (await user.get(f"{AUTH}/me", headers=bearer(first))).status_code == 401

        other_pending = bearer(await sign_in(user, "jperez", TEMPORARY))
        pending = bearer(await sign_in(user, "jperez", TEMPORARY))
        me = await user.get(f"{AUTH}/me", headers=pending)
        assert me.status_code == 200
        assert me.json()["requiere_cambio_contrasena"] is True
        for method, path, headers in (
            ("GET", PROFILE, pending),
            ("GET", "/api/v1/users", pending),
            ("POST", f"{AUTH}/logout-all", pending),
            ("POST", f"{AUTH}/refresh", csrf_headers(user)),
        ):
            blocked = await user.request(method, path, headers=headers)
            assert (blocked.status_code, blocked.json()) == (403, REQUIRED)
            assert "set-cookie" not in blocked.headers

        same = await user.post(
            f"{PROFILE}/password", headers=pending, json=UPDATE | {"contrasena_nueva": TEMPORARY}
        )
        assert same.status_code == 422
        assert TEMPORARY not in same.text
        wrong = await user.post(
            f"{PROFILE}/password", headers=pending, json=UPDATE | {"contrasena_actual": PASSWORD}
        )
        assert (wrong.status_code, wrong.json()) == (
            400, {"detail": "La contrasena actual es incorrecta"}
        )
        assert (await user.get(PROFILE, headers=pending)).json() == REQUIRED

        complete = await user.post(f"{PROFILE}/password", headers=pending, json=UPDATE)
        assert (complete.status_code, complete.content) == (204, b"")
        me = await user.get(f"{AUTH}/me", headers=pending)
        assert me.status_code == 200
        assert me.json()["requiere_cambio_contrasena"] is False
        assert (await user.get(f"{AUTH}/me", headers=other_pending)).status_code == 401
        assert (await user.get("/api/v1/users", headers=pending)).status_code == 200
        assert (await user.post(f"{AUTH}/refresh", headers=csrf_headers(user))).status_code == 200
        assert (await sign_in(user, "jperez", TEMPORARY)).status_code == 401
        personal = await sign_in(user, "jperez", PERSONAL)
        assert personal.status_code == 200
        assert personal.json()["requiere_cambio_contrasena"] is False


async def test_rejected_resets_do_not_change_credentials_or_revoke_sessions(
    client: AsyncClient, seeder: Seeder, db_session: AsyncSession
) -> None:
    target = await seeder.create_user()
    await assign_seeded_role(db_session, target, "ADMINISTRADOR")
    permitted = await seeder.create_user(username="support", email="support@example.test")
    await seeder.grant_role(
        permitted, role_code="SUPPORT", permissions=("identity.users.reset_password",)
    )
    ordinary = await seeder.create_user(username="ordinary", email="ordinary@example.test")
    current = bearer(await sign_in(client, "jperez"))
    admin = bearer(await sign_in(client, "support"))
    outsider = bearer(await sign_in(client, "ordinary"))
    valid = {"contrasena_temporal": TEMPORARY}
    for id_, headers, body, status_code in (
        (ordinary, {}, valid, 401),
        (ordinary, outsider, valid, 403),
        (target, admin, valid, 403),
        (uuid4(), admin, valid, 404),
        (ordinary, admin, {"contrasena_temporal": "weaksecret"}, 422),
    ):
        rejected = await client.post(RESET.format(id_), headers=headers, json=body)
        assert rejected.status_code == status_code
        assert TEMPORARY not in rejected.text
        assert "weaksecret" not in rejected.text
    for username, headers in (("jperez", current), ("ordinary", outsider)):
        me = await client.get(f"{AUTH}/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["requiere_cambio_contrasena"] is False
        assert (await sign_in(client, username)).status_code == 200
