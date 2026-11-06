"""Perfil propio por HTTP: aislamiento, validacion y cambio atomico de credenciales."""

import asyncio
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.application.use_cases.profile import ProfileService
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    SessionDep,
    get_profile_service,
)
from tests.integration.conftest import ORIGIN, PASSWORD, Seeder
from tests.integration.test_iam_administration import assign_seeded_role, login

NEW = "ClaveNueva123456*"
PATH = "/api/v1/profile"


async def stored(session: AsyncSession) -> list[dict[str, object]]:
    rows = (await session.execute(text("SELECT * FROM iam.usuario ORDER BY id"))).mappings()
    return [dict(row) for row in rows]


@pytest.mark.parametrize("role", ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION", None])
async def test_any_authenticated_role_can_read_and_edit_only_self(
    client: AsyncClient,
    seeder: Seeder,
    db_session: AsyncSession,
    role: str | None,
):
    user_id = await seeder.create_user()
    await seeder.create_user(username="other", email="other@example.test")
    if role:
        await assign_seeded_role(db_session, user_id, role)
    headers = await login(client, "jperez")
    before = await stored(db_session)
    response = await client.get(PATH, headers=headers)
    assert response.status_code == 200
    assert response.json() == {
        "id": str(user_id),
        "nombre_usuario": "jperez",
        "correo": "jperez@nexora.co",
        "primer_nombre": "Juan",
        "segundo_nombre": None,
        "primer_apellido": "Perez",
        "segundo_apellido": None,
        "numero_telefono": None,
        "estado": "activo",
        "roles": [role] if role else [],
    }
    assert "hash_contrasena" not in response.text
    response = await client.patch(
        PATH,
        headers=headers,
        json={
            "correo": " own@example.test ",
            "primer_nombre": " Ana ",
            "segundo_nombre": " Maria ",
            "primer_apellido": " Lopez ",
            "segundo_apellido": " Diaz ",
            "numero_telefono": " 123 ",
        },
    )
    assert response.status_code == 200, response.text
    for field, value in {
        "correo": "own@example.test",
        "primer_nombre": "Ana",
        "segundo_nombre": "Maria",
        "primer_apellido": "Lopez",
        "segundo_apellido": "Diaz",
        "numero_telefono": "123",
    }.items():
        assert response.json()[field] == value
    assert response.json()["nombre_usuario"] == "jperez"
    assert response.json()["roles"] == ([role] if role else [])
    assert "hash_contrasena" not in response.text
    after = await stored(db_session)
    assert next(row for row in after if row["id"] != user_id) == next(
        row for row in before if row["id"] != user_id
    )
    same = await client.patch(PATH, headers=headers, json={"correo": "OWN@example.test"})
    assert same.status_code == 200
    empty = await client.patch(PATH, headers=headers, json={})
    assert empty.status_code == 200
    assert empty.json() == same.json()


@pytest.mark.parametrize(
    "method,path,payload",
    [
        ("GET", PATH, None),
        ("PATCH", PATH, {"primer_nombre": "Ana"}),
        ("POST", PATH + "/password", {"contrasena_actual": PASSWORD, "contrasena_nueva": NEW}),
    ],
)
async def test_profile_requires_access_token(client, method, path, payload):
    response = await client.request(method, path, json=payload)
    assert response.status_code == 401
    assert response.json() == {"detail": "Falta el encabezado Authorization: Bearer"}


@pytest.mark.parametrize(
    "changes",
    [
        {"nombre_usuario": "hijacked"},
        {"estado": "inactivo"},
        {"roles": ["ADMINISTRADOR"]},
        {"id": "00000000-0000-0000-0000-000000000001"},
        {"hash_contrasena": "secret-marker"},
        {"unknown": "secret-marker"},
        {"correo": None},
        {"primer_nombre": None},
        {"segundo_nombre": None},
        {"primer_apellido": None},
        {"segundo_apellido": None},
        {"numero_telefono": None},
        {"correo": "not-an-email"},
        {"primer_nombre": "  "},
        {"segundo_nombre": " "},
        {"primer_apellido": " "},
        {"segundo_apellido": " "},
        {"numero_telefono": " "},
        {"correo": " "},
        {"primer_nombre": "n" * 101},
        {"segundo_nombre": "n" * 101},
        {"primer_apellido": "n" * 101},
        {"segundo_apellido": "n" * 101},
        {"numero_telefono": "1" * 31},
        {"correo": "n" * 250 + "@example.test"},
    ],
)
async def test_rejected_fields_never_modify_users(client, seeder, db_session, changes):
    await seeder.create_user()
    await seeder.create_user(username="other", email="other@example.test")
    headers = await login(client, "jperez")
    before = await stored(db_session)
    response = await client.patch(PATH, headers=headers, json=changes)
    assert response.status_code == 422, response.text
    assert "secret-marker" not in response.text
    assert all("input" not in error and "ctx" not in error for error in response.json()["detail"])
    assert await stored(db_session) == before


async def test_email_conflict_and_no_target_id(client, seeder, db_session):
    await seeder.create_user()
    other = await seeder.create_user(username="other", email="other@example.test")
    headers = await login(client, "jperez")
    before = await stored(db_session)
    response = await client.patch(PATH, headers=headers, json={"correo": "OTHER@example.test"})
    assert response.status_code == 409
    assert response.json() == {"detail": "El nombre de usuario o el correo ya estan registrados"}
    response = await client.patch(
        f"{PATH}/{other}", headers=headers, json={"primer_nombre": "Hacked"}
    )
    assert response.status_code == 404
    assert await stored(db_session) == before


async def test_wrong_password_is_400_then_throttled_per_user(client, seeder, db_session):
    await seeder.create_user()
    headers = await login(client, "jperez")
    before = await stored(db_session)
    payload = {"contrasena_actual": "wrong-secret", "contrasena_nueva": NEW}
    for _ in range(3):
        response = await client.post(PATH + "/password", headers=headers, json=payload)
        assert response.status_code == 400
        assert response.json() == {"detail": "La contrasena actual es incorrecta"}
        assert await stored(db_session) == before
    # Un segundo login/IP no evita el bloqueo por usuario.
    second_headers = await login(client, "jperez")
    response = await client.post(
        PATH + "/password",
        headers=second_headers,
        json={"contrasena_actual": PASSWORD, "contrasena_nueva": NEW},
    )
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) > 0
    assert response.json() == {"detail": "Demasiados intentos fallidos. Intente mas tarde."}
    assert NEW not in response.text
    assert await stored(db_session) == before


@pytest.mark.parametrize(
    "current,new",
    [
        (NEW, NEW),
        (PASSWORD, "short-secret"[:8]),
        ("", NEW),
        ("x" * 129, NEW),
        (PASSWORD, "x" * 129),
    ],
)
async def test_password_validation_redacts_secrets(client, seeder, db_session, current, new):
    await seeder.create_user()
    headers = await login(client, "jperez")
    before = await stored(db_session)
    response = await client.post(
        PATH + "/password",
        headers=headers,
        json={"contrasena_actual": current, "contrasena_nueva": new},
    )
    assert response.status_code == 422, response.text
    if current:
        assert current not in response.text
    assert new not in response.text
    assert all("input" not in error and "ctx" not in error for error in response.json()["detail"])
    assert await stored(db_session) == before
    # La validacion no consume intentos del throttle.
    response = await client.post(
        PATH + "/password",
        headers=headers,
        json={"contrasena_actual": PASSWORD, "contrasena_nueva": NEW},
    )
    assert response.status_code == 204
    assert response.content == b""


async def test_password_change_login_session_revocation_and_timestamp(client, seeder, db_session):
    user_id = await seeder.create_user()
    await seeder.create_user(username="other", email="other@example.test")
    foreign = await login(client, "other")
    other_session = await login(client, "jperez")
    other_cookies = dict(client.cookies)
    current = await login(client, "jperez")
    current_cookies = dict(client.cookies)
    before = await stored(db_session)
    # Un fallo previo seguido de exito limpia el contador de cambio, no el de login.
    bad = await client.post(
        PATH + "/password",
        headers=current,
        json={"contrasena_actual": "wrong", "contrasena_nueva": NEW},
    )
    assert bad.status_code == 400
    response = await client.post(
        PATH + "/password",
        headers=current,
        json={"contrasena_actual": PASSWORD, "contrasena_nueva": NEW},
    )
    assert response.status_code == 204, response.text
    assert response.content == b""
    after = await stored(db_session)
    own = next(row for row in after if row["id"] == user_id)
    previous = next(row for row in before if row["id"] == user_id)
    assert own["fecha_cambio_contrasena"] is not None
    assert str(own["hash_contrasena"]).startswith("$argon2id$")
    assert own["hash_contrasena"] != previous["hash_contrasena"]
    assert next(row for row in after if row["id"] != user_id) == next(
        row for row in before if row["id"] != user_id
    )
    assert (await client.get("/api/v1/auth/me", headers=other_session)).status_code == 401
    assert (await client.get(PATH, headers=other_session)).status_code == 401
    assert (await client.get("/api/v1/auth/me", headers=current)).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=foreign)).status_code == 200
    client.cookies.clear()
    client.cookies.update(other_cookies)
    revoked = await client.post(
        "/api/v1/auth/refresh",
        headers={"origin": ORIGIN, "X-CSRF-Token": other_cookies["nexora_csrf_token"]},
    )
    assert revoked.status_code == 401
    client.cookies.clear()
    client.cookies.update(current_cookies)
    alive = await client.post(
        "/api/v1/auth/refresh",
        headers={"origin": ORIGIN, "X-CSRF-Token": current_cookies["nexora_csrf_token"]},
    )
    assert alive.status_code == 200
    old = await client.post(
        "/api/v1/auth/login",
        headers={"origin": ORIGIN},
        json={"identificador": "jperez", "contrasena": PASSWORD},
    )
    assert old.status_code == 401
    assert old.json() == {"detail": "Credenciales invalidas"}
    await login(client, "jperez", NEW)
    for _ in range(3):
        bad = await client.post(
            PATH + "/password",
            headers=current,
            json={"contrasena_actual": "wrong", "contrasena_nueva": NEW},
        )
        assert bad.status_code == 400


async def test_password_write_and_revocation_rollback_together(
    client: AsyncClient,
    seeder: Seeder,
    db_session: AsyncSession,
    app: FastAPI,
):
    await seeder.create_user()
    other = await login(client, "jperez")
    current = await login(client, "jperez")
    before = await stored(db_session)

    async def override(container: ContainerDep, session: SessionDep) -> ProfileService:
        service = get_profile_service(container, session)
        original = service._sessions.revoke_all_except

        async def revoke_then_fail(user_id: UUID, keep_session_id: UUID, now):
            await original(user_id, keep_session_id, now)
            raise RuntimeError("injected persistence failure")

        service._sessions.revoke_all_except = revoke_then_fail
        return service

    app.dependency_overrides[get_profile_service] = override
    try:
        with pytest.raises(RuntimeError, match="injected persistence failure"):
            await client.post(
                PATH + "/password",
                headers=current,
                json={"contrasena_actual": PASSWORD, "contrasena_nueva": NEW},
            )
    finally:
        app.dependency_overrides.clear()
    assert await stored(db_session) == before
    assert (await client.get("/api/v1/auth/me", headers=other)).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=current)).status_code == 200
    await login(client, "jperez", PASSWORD)


async def test_concurrent_password_changes_cannot_both_verify_old_hash(client, seeder):
    await seeder.create_user()
    headers = await login(client, "jperez")
    candidates = (NEW, "OtraNueva123456*")
    results = await asyncio.gather(
        *(
            client.post(
                PATH + "/password",
                headers=headers,
                json={"contrasena_actual": PASSWORD, "contrasena_nueva": candidate},
            )
            for candidate in candidates
        )
    )
    assert sorted(result.status_code for result in results) == [204, 400]
    winner = next(
        candidate
        for candidate, result in zip(candidates, results, strict=True)
        if result.status_code == 204
    )
    await login(client, "jperez", winner)
    assert (await client.get(PATH, headers=headers)).status_code == 200


async def test_queued_password_attempts_respect_throttle_after_waiting_for_user_lock(
    client: AsyncClient, seeder: Seeder, app: FastAPI
):
    await seeder.create_user()
    headers = await login(client, "jperez")
    arrived = 0
    all_arrived = asyncio.Event()

    async def override(container: ContainerDep, session: SessionDep) -> ProfileService:
        service = get_profile_service(container, session)
        original = service._users.get_for_update

        async def queued_get(user_id: UUID):
            nonlocal arrived
            arrived += 1
            if arrived == 5:
                all_arrived.set()
            await asyncio.wait_for(all_arrived.wait(), timeout=10)
            return await original(user_id)

        service._users.get_for_update = queued_get
        return service

    app.dependency_overrides[get_profile_service] = override
    try:
        results = await asyncio.gather(
            *(
                client.post(
                    PATH + "/password",
                    headers=headers,
                    json={"contrasena_actual": "wrong", "contrasena_nueva": NEW},
                )
                for _ in range(5)
            )
        )
    finally:
        app.dependency_overrides.clear()
    assert sorted(result.status_code for result in results) == [400, 400, 400, 429, 429]
    for result in results:
        if result.status_code == 429:
            assert int(result.headers["Retry-After"]) > 0
        assert NEW not in result.text
    await login(client, "jperez", PASSWORD)


async def test_concurrent_profile_emails_remain_case_insensitively_unique(client, seeder):
    await seeder.create_user()
    await seeder.create_user(username="other", email="other@example.test")
    first = await login(client, "jperez")
    second = await login(client, "other")
    responses = await asyncio.gather(
        client.patch(PATH, headers=first, json={"correo": "same@example.test"}),
        client.patch(PATH, headers=second, json={"correo": "SAME@example.test"}),
    )
    assert sorted(response.status_code for response in responses) == [200, 409]
    profiles = [await client.get(PATH, headers=headers) for headers in (first, second)]
    assert sum(profile.json()["correo"].lower() == "same@example.test" for profile in profiles) == 1


@pytest.mark.parametrize("method,path", [("PATCH", PATH), ("POST", PATH + "/password")])
async def test_malformed_profile_json_is_redacted_and_does_not_write(
    client, seeder, db_session, method, path
):
    await seeder.create_user()
    headers = await login(client, "jperez")
    before = await stored(db_session)
    secret = "malformed-secret-marker"
    response = await client.request(
        method,
        path,
        headers={**headers, "Content-Type": "application/json"},
        content='{"contrasena_actual": "' + secret + '",',
    )
    assert response.status_code == 422, response.text
    assert secret not in response.text
    assert response.json()["detail"]
    assert all("input" not in error and "ctx" not in error for error in response.json()["detail"])
    assert await stored(db_session) == before


@pytest.mark.parametrize("reason", ["inactive", "revoked"])
async def test_inactive_or_revoked_user_cannot_use_any_profile_endpoint(
    client, seeder, db_session, reason
):
    user_id = await seeder.create_user()
    headers = await login(client, "jperez")
    if reason == "inactive":
        await db_session.execute(
            text("UPDATE iam.usuario SET estado = 'inactivo' WHERE id = :id"), {"id": user_id}
        )
    else:
        await db_session.execute(
            text("UPDATE iam.sesion SET fecha_revocacion = now() WHERE usuario_id = :id"),
            {"id": user_id},
        )
    await db_session.commit()
    before = await stored(db_session)
    for method, path, payload in (
        ("GET", PATH, None),
        ("PATCH", PATH, {"correo": "denied@example.test"}),
        ("POST", PATH + "/password", {"contrasena_actual": PASSWORD, "contrasena_nueva": NEW}),
    ):
        response = await client.request(method, path, headers=headers, json=payload)
        assert response.status_code == 401, response.text
        assert response.json() == {"detail": "Sesion no activa"}
        assert PASSWORD not in response.text and NEW not in response.text
        assert await stored(db_session) == before
