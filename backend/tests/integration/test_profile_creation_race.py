"""Carreras de identidad: barreras deterministas y defensa ante restricciones SQL."""

import asyncio
import hashlib
from dataclasses import replace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nexora.identity_access.domain.exceptions.identity import ConflictError
from nexora.identity_access.infrastructure.persistence.administration_repository import (
    SqlAlchemyAdministrationRepository,
)
from nexora.identity_access.infrastructure.persistence.mappers import user_to_model
from nexora.identity_access.infrastructure.persistence.transaction import SqlAlchemyTransaction
from nexora.identity_access.presentation.http.v1.dependencies.auth import (
    ContainerDep,
    SessionDep,
    get_profile_service,
    get_user_administration,
)
from tests.integration.conftest import Seeder
from tests.integration.test_iam_administration import USER, assign_seeded_role, login

CONFLICT = {"detail": "El nombre de usuario o el correo ya estan registrados"}


async def user_digest(session: AsyncSession, user_id: UUID) -> str:
    serialized = (
        await session.execute(
            text("SELECT row_to_json(u)::text FROM iam.usuario u WHERE id = :id"),
            {"id": user_id},
        )
    ).scalar_one()
    return hashlib.sha256(serialized.encode()).hexdigest()


@pytest.mark.parametrize("created_email", ["race@example.test", "RACE@example.test"])
@pytest.mark.parametrize("first_writer", ["profile", "admin"])
async def test_profile_creation_race(
    client: AsyncClient,
    app: FastAPI,
    seeder: Seeder,
    db_session: AsyncSession,
    created_email: str,
    first_writer: str,
) -> None:
    admin_id = await seeder.create_user(username="admin", email="admin@example.test")
    await assign_seeded_role(db_session, admin_id, "ADMINISTRADOR")
    own_id = await seeder.create_user()
    admin = await login(client, "admin")
    own = await login(client, "jperez")
    before = {uid: await user_digest(db_session, uid) for uid in (admin_id, own_id)}
    checked = asyncio.Event()
    release = asyncio.Event()
    second_started = asyncio.Event()
    first_finished = asyncio.Event()

    class RacingRepository(SqlAlchemyAdministrationRepository):
        def __init__(self, session: AsyncSession, writer: str) -> None:
            super().__init__(session)
            self.writer = writer

        async def lock_access_changes(self) -> None:
            if self.writer != first_writer:
                second_started.set()
            await super().lock_access_changes()

        async def find_user(self, *, username: str, email: str):
            result = await super().find_user(username=username, email=email)
            if self.writer == first_writer:
                checked.set()
                await release.wait()
            else:
                # Sin el lock de create, fuerza la lectura obsoleta antes del primer commit.
                second_started.set()
                await first_finished.wait()
            return result

    def profile_override(container: ContainerDep, session: SessionDep):
        service = get_profile_service(container, session)
        service._administration = RacingRepository(session, "profile")
        return service

    def admin_override(container: ContainerDep, session: SessionDep):
        service = get_user_administration(container, session)
        service._repo = RacingRepository(session, "admin")
        return service

    app.dependency_overrides[get_profile_service] = profile_override
    app.dependency_overrides[get_user_administration] = admin_override
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    try:
        async with AsyncClient(transport=transport, base_url="http://testserver") as racing:

            async def write(writer: str):
                try:
                    if writer == "profile":
                        return await racing.patch(
                            "/api/v1/profile", headers=own, json={"correo": "race@example.test"}
                        )
                    return await racing.post(
                        "/api/v1/users", headers=admin, json={**USER, "correo": created_email}
                    )
                finally:
                    if writer == first_writer:
                        first_finished.set()

            async with asyncio.timeout(10), asyncio.TaskGroup() as tasks:
                first = tasks.create_task(write(first_writer))
                await checked.wait()
                second = tasks.create_task(
                    write("admin" if first_writer == "profile" else "profile")
                )
                await second_started.wait()
                release.set()
            assert first.result().status_code == (200 if first_writer == "profile" else 201)
            assert second.result().status_code == 409, second.result().text
            assert second.result().json() == CONFLICT
    finally:
        release.set()
        first_finished.set()
        app.dependency_overrides.clear()
    count = (
        await db_session.execute(
            text("SELECT count(*) FROM iam.usuario WHERE lower(correo) = 'race@example.test'")
        )
    ).scalar_one()
    assert count == 1
    assert await user_digest(db_session, admin_id) == before[admin_id]
    if first_writer == "admin":
        assert await user_digest(db_session, own_id) == before[own_id]
    else:
        assert (
            await db_session.execute(
                text("SELECT count(*) FROM iam.usuario WHERE nombre_usuario = :username"),
                {"username": USER["nombre_usuario"]},
            )
        ).scalar_one() == 0


@pytest.mark.parametrize("stage", ["add", "update", "commit"])
@pytest.mark.parametrize("field", ["username", "email"])
async def test_identity_unique_integrity_error_becomes_conflict(
    seeder: Seeder, db_session: AsyncSession, stage: str, field: str
) -> None:
    existing_id = await seeder.create_user()
    other_id = await seeder.create_user(username="other", email="other@example.test")
    repository = SqlAlchemyAdministrationRepository(db_session)
    existing = await repository.get_user(existing_id)
    other = await repository.get_user(other_id)
    assert existing is not None and other is not None
    before = {uid: await user_digest(db_session, uid) for uid in (existing_id, other_id)}
    duplicate = replace(other, **{field: getattr(existing, field)})
    if stage != "update":
        unique_field = (
            {"email": "fresh@example.test"} if field == "username" else {"username": "fresh"}
        )
        duplicate = replace(duplicate, **unique_field)
    try:
        with pytest.raises(ConflictError, match=CONFLICT["detail"]):
            if stage == "update":
                await repository.update_user(duplicate)
            elif stage == "add":
                await repository.add_user(replace(duplicate, id=uuid4()))
            else:
                db_session.add(user_to_model(replace(duplicate, id=uuid4())))
                await SqlAlchemyTransaction(db_session).commit()
    finally:
        await db_session.rollback()
    assert {uid: await user_digest(db_session, uid) for uid in before} == before
    assert (await db_session.execute(text("SELECT count(*) FROM iam.usuario"))).scalar_one() == 2


@pytest.mark.parametrize("stage", ["add", "update", "commit"])
async def test_other_integrity_errors_are_not_masked(
    seeder: Seeder, db_session: AsyncSession, stage: str
) -> None:
    user_id = await seeder.create_user()
    repository = SqlAlchemyAdministrationRepository(db_session)
    user = await repository.get_user(user_id)
    assert user is not None
    before = await user_digest(db_session, user_id)
    invalid = replace(user, first_name=None)
    try:
        with pytest.raises(IntegrityError) as error:
            if stage == "update":
                await repository.update_user(invalid)
            elif stage == "add":
                await repository.add_user(
                    replace(invalid, id=uuid4(), username="other", email="other@example.test")
                )
            else:
                db_session.add(
                    user_to_model(
                        replace(invalid, id=uuid4(), username="other", email="other@example.test")
                    )
                )
                await SqlAlchemyTransaction(db_session).commit()
        assert error.value.orig.sqlstate == "23502"
    finally:
        await db_session.rollback()
    assert await user_digest(db_session, user_id) == before
    assert (await db_session.execute(text("SELECT count(*) FROM iam.usuario"))).scalar_one() == 1


@pytest.mark.parametrize("writer", ["profile", "admin"])
async def test_unique_flush_conflict_is_http_409_even_if_precheck_misses(
    client: AsyncClient, app: FastAPI, seeder: Seeder, db_session: AsyncSession, writer: str
) -> None:
    admin_id = await seeder.create_user(username="admin", email="admin@example.test")
    await assign_seeded_role(db_session, admin_id, "ADMINISTRADOR")
    own_id = await seeder.create_user()
    await seeder.create_user(username="taken", email="taken@example.test")
    admin = await login(client, "admin")
    own = await login(client, "jperez")
    before = await user_digest(db_session, own_id)

    class MissedConflictRepository(SqlAlchemyAdministrationRepository):
        async def find_user(self, *, username: str, email: str):
            return []

    def profile_override(container: ContainerDep, session: SessionDep):
        service = get_profile_service(container, session)
        service._administration = MissedConflictRepository(session)
        return service

    def admin_override(container: ContainerDep, session: SessionDep):
        service = get_user_administration(container, session)
        service._repo = MissedConflictRepository(session)
        return service

    app.dependency_overrides[get_profile_service] = profile_override
    app.dependency_overrides[get_user_administration] = admin_override
    try:
        if writer == "profile":
            response = await client.patch(
                "/api/v1/profile", headers=own, json={"correo": "taken@example.test"}
            )
        else:
            response = await client.post(
                "/api/v1/users", headers=admin, json={**USER, "correo": "taken@example.test"}
            )
        assert response.status_code == 409, response.text
        assert response.json() == CONFLICT
    finally:
        app.dependency_overrides.clear()
    assert await user_digest(db_session, own_id) == before
    assert (await db_session.execute(text("SELECT count(*) FROM iam.usuario"))).scalar_one() == 3


async def test_unrelated_unique_constraint_is_not_masked(seeder: Seeder, db_session: AsyncSession):
    user_id = await seeder.create_user()
    before = await user_digest(db_session, user_id)
    user = await SqlAlchemyAdministrationRepository(db_session).get_user(user_id)
    assert user is not None
    # La PK no es una colision de nombre/correo: no debe convertirse en ConflictError.
    duplicate = replace(user, username="fresh", email="fresh@example.test")
    try:
        with pytest.raises(IntegrityError) as error:
            await SqlAlchemyAdministrationRepository(db_session).add_user(duplicate)
        assert error.value.orig.sqlstate == "23505"
        assert error.value.orig.diag.constraint_name == "pk_usuario"
    finally:
        await db_session.rollback()
    assert await user_digest(db_session, user_id) == before
