"""ANNAR through the production app factory, middleware, auth and lifespan.

Only database-bound startup/repositories are replaced. Fixtures are synthetic;
no clinical workbook is loaded by the test suite.
"""

import io
import struct
import zipfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from tests.support.fakes import (
    FakeAccessRepository,
    FakeSessionRepository,
    FakeTransaction,
    FakeUserRepository,
    build_user,
)
from tests.unit.statistics.test_lab_consumption import XLSX_MIME, annar_row, xls_bytes, xlsx_bytes

from nexora.bootstrap import app as bootstrap
from nexora.bootstrap.settings import Settings
from nexora.identity_access.domain.entities.session import Session
from nexora.identity_access.presentation.http.v1.dependencies import auth
from nexora.statistics.application.ser_laboral import SerLaboralExpired

ORIGIN = "http://localhost:5173"
PATH = "/api/v1/statistics/administrative/lab-consumption/annar-lab"
PERMISSION = "statistics.administrative.lab_consumption.view"
INVALID = "El archivo XLS de ANNAR LAB no es válido."


def ole_workbook(stream: bytes) -> bytes:
    """Wrap synthetic BIFF in an OLE2 v3 compound file (one Workbook stream)."""
    size = max(4096, (len(stream) + 511) // 512 * 512)
    count = size // 512
    fat_count = 1
    while fat_count * 128 < count + 1 + fat_count:
        fat_count += 1
    assert fat_count <= 109  # No DIFAT extension is needed for these fixtures.
    header = bytearray(512)
    header[:8] = bytes.fromhex("d0cf11e0a1b11ae1")
    struct.pack_into("<HHHHH", header, 24, 0x3E, 3, 0xFFFE, 9, 6)
    struct.pack_into("<IIIIIIIII", header, 40, 0, fat_count, count, 0, 4096,
                     0xFFFFFFFE, 0, 0xFFFFFFFE, 0)
    struct.pack_into("<109i", header, 76, *range(count + 1, count + 1 + fat_count),
                     *([-1] * (109 - fat_count)))

    def directory(name: str, kind: int, child: int, start: int, length: int) -> bytes:
        entry = bytearray(128)
        encoded = (name + "\0").encode("utf-16le")
        entry[:len(encoded)] = encoded
        struct.pack_into("<HBBiii", entry, 64, len(encoded), kind, 1, -1, -1, child)
        struct.pack_into("<iQ", entry, 116, start, length)
        return bytes(entry)

    entries = directory("Root Entry", 5, 1, -2, 0)
    entries += directory("Workbook", 2, -1, 0, size)
    fat = [*range(1, count), -2, -2, *([-3] * fat_count)]
    slots = fat_count * 128
    return (bytes(header) + stream.ljust(size, b"\0") + entries.ljust(512, b"\0")
            + struct.pack(f"<{slots}i", *fat, *([-1] * (slots - len(fat)))))


@asynccontextmanager
async def app_client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[tuple[Any, ...]]:
    # Match integration/conftest.py without reading developer .env/credentials or
    # running its PostgreSQL migrations. Real container construction remains intact.
    settings = Settings(
        _env_file=None,
        environment="testing",
        database_url="postgresql+psycopg://nexora:nexora@localhost:45337/nexora_test",
        jwt_secret=SecretStr("secreto-de-pruebas-de-al-menos-32-caracteres"),
        allowed_origins=(ORIGIN,),
        login_max_attempts=3,
        login_attempt_window_seconds=60,
        login_block_seconds=60,
    )

    async def no_database_seed(_: Any) -> None:
        pass

    async def no_database_session() -> AsyncIterator[None]:
        yield None

    monkeypatch.setattr(bootstrap, "initialize_access", no_database_seed)
    app = bootstrap.create_app(settings)
    container = app.state.container
    now = container.clock.now()
    user = build_user()
    sessions = FakeSessionRepository()
    session = Session(uuid4(), user.id, uuid4(), now, now, now + timedelta(hours=12))
    await sessions.add(session)
    users = FakeUserRepository([user])
    access = FakeAccessRepository({user.id: ((), frozenset({PERMISSION}))})
    transaction = FakeTransaction()
    monkeypatch.setattr(auth, "SqlAlchemyUserRepository", lambda _: users)
    monkeypatch.setattr(auth, "SqlAlchemySessionRepository", lambda _: sessions)
    monkeypatch.setattr(auth, "SqlAlchemyAccessRepository", lambda _: access)
    monkeypatch.setattr(auth, "SqlAlchemyTransaction", lambda _: transaction)
    app.dependency_overrides[auth.get_db_session] = no_database_session
    token = container.tokens.issue_access_token(user_id=user.id, session_id=session.id, now=now)
    headers = {
        "Authorization": f"Bearer {token.value}",
        "Origin": ORIGIN,
        "Content-Type": "application/vnd.ms-excel",
        "Accept": "application/json",
        "Referer": ORIGIN + "/estadistica/administrativa/consumo-laboratorio",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
    }
    async with (
        app.router.lifespan_context(app),
        AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client,
    ):
        yield app, client, headers, access, user


@pytest.fixture
async def real_app(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[tuple[Any, ...]]:
    async with app_client(monkeypatch) as result:
        yield result


@pytest.mark.parametrize("formato", ["xls", "xlsx"])
async def test_real_app_cors_streamed_ole_import_and_shutdown(
    monkeypatch: pytest.MonkeyPatch, formato: str,
) -> None:
    async with app_client(monkeypatch) as (app, client, headers, _, _):
        preflight = await client.options(PATH, headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        })
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == ORIGIN
        assert preflight.headers["access-control-allow-credentials"] == "true"
        assert "POST" in preflight.headers["access-control-allow-methods"]
        assert preflight.headers["access-control-allow-headers"] == "authorization,content-type"
        content = (ole_workbook(xls_bytes([annar_row(), [""] * 14])) if formato == "xls"
                   else xlsx_bytes([annar_row(), [""] * 14]))
        if formato == "xlsx":
            headers = headers | {"Content-Type": XLSX_MIME}

        async def chunks() -> AsyncIterator[bytes]:
            for offset in range(0, len(content), 127):
                yield content[offset:offset + 127]

        response = await client.post(PATH, content=chunks(), headers=headers)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        assert response.headers["access-control-allow-origin"] == ORIGIN
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body == {
            "annar_lab_id": body["annar_lab_id"],
            "filas": [{"codigo_centro_costo": "10", "nombre_centro_costos": "Sección diez",
                       "nombre_examen": "Examen", "cantidad": 1, "empresa": "Empresa",
                       "punto_atencion": "Punto"}],
            "total": 1,
            "advertencias": [],
            "analisis_annar": [{"examen": "E", "descripcion": "Examen", "cantidad": 1}],
        }
        cache = app.state.lab_consumption_report.annar_lab
        assert cache.rows(body["annar_lab_id"]) == body["filas"]
    with pytest.raises(SerLaboralExpired, match="ANNAR LAB expiró"):
        cache.rows(body["annar_lab_id"])


def invalid_workbooks() -> list[Any]:
    zipped = io.BytesIO()
    with zipfile.ZipFile(zipped, "w") as archive:
        archive.writestr("xl/workbook.xml", "<workbook/>")
    # BIFF globals BOF+EOF with no BOUNDSHEET records.
    no_sheet = struct.pack("<HHHHHHIIHH", 0x0809, 16, 0x0600, 5, 0x0DBB, 1996, 0x41, 6,
                           0x000A, 0)
    return [
        pytest.param(b"", INVALID, id="empty"),
        pytest.param(b"not an OLE2 workbook", INVALID, id="non-ole2"),
        pytest.param(zipped.getvalue(), INVALID, id="xlsx-renamed-xls"),
        pytest.param(ole_workbook(xls_bytes([annar_row()]))[:600], INVALID, id="truncated"),
        pytest.param(ole_workbook(xls_bytes([], ("Incorrecta",))),
                     "Cabeceras requeridas faltantes: Sede, Nombre Sede, Cliente, Nombre Cliente, "
                     "Cen.Costo, Nombre Centro de Costos, Medico, Nombre Medico, Seccion, "
                     "Nombre de la Sección, Examen, Nombre del Examen, Nivel, Valor.",
                     id="wrong-headers"),
        pytest.param(ole_workbook(no_sheet),
                     "El archivo XLS de ANNAR LAB debe tener una sola hoja.", id="missing-sheet"),
    ]


@pytest.mark.parametrize(("content", "message"), invalid_workbooks())
async def test_invalid_input_is_json_422_and_does_not_evict(
    real_app: Any, content: bytes, message: str,
) -> None:
    app, client, headers, _, _ = real_app
    valid = ole_workbook(xls_bytes([annar_row()]))
    # Fill the public cache to capacity: a rejected ninth upload must not evict.
    previous = [(await client.post(PATH, content=valid, headers=headers)).json() for _ in range(8)]
    response = await client.post(PATH, content=content, headers=headers)
    assert response.status_code == 422
    assert response.json() == {"detail": message}
    assert response.headers["content-type"] == "application/json"
    assert response.headers["access-control-allow-origin"] == ORIGIN
    for body in previous:
        cached = app.state.lab_consumption_report.annar_lab.rows(body["annar_lab_id"])
        assert cached == body["filas"]


async def test_real_app_full_size_response(real_app: Any) -> None:
    """The real input's scale, without retaining its contents or reading it in CI."""
    _, client, headers, _, _ = real_app
    # Reuse the BIFF fixture writer and clone its row records in linear time.
    # Its DIMENSIONS hint can remain small: LABEL/NUMBER records define actual rows.
    fixture_row = annar_row()
    fixture_row[7] = "M"  # Unused column: keep the synthetic FAT within the header.
    one = xls_bytes([fixture_row])
    sheet = bytearray()
    row_records = []
    offset = 0
    while offset < len(one):
        code, length = struct.unpack_from("<HH", one, offset)
        record = one[offset:offset + 4 + length]
        if code in (0x0204, 0x0203) and struct.unpack_from("<H", record, 4)[0] == 1:
            row_records.append(record)
        else:
            sheet.extend(record)
        offset += 4 + length
    del sheet[-4:]  # The worksheet EOF follows the generated rows.
    for index in range(1, 22509):
        for record in row_records:
            sheet.extend(record[:4])
            sheet.extend(struct.pack("<H", index))
            sheet.extend(record[6:])
    sheet.extend(struct.pack("<HH", 0x000A, 0))
    content = ole_workbook(bytes(sheet)).ljust(8168960, b"\0")
    assert len(content) >= 8_000_000

    async def chunks() -> AsyncIterator[bytes]:
        for offset in range(0, len(content), 65536):
            yield content[offset:offset + 65536]

    response = await client.post(PATH, content=chunks(), headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    assert response.headers["access-control-allow-origin"] == ORIGIN
    body = response.json()
    assert body["total"] == len(body["filas"]) == 22508
    assert all(row == body["filas"][0] for row in body["filas"])
    assert body["advertencias"] == []
    assert body["analisis_annar"] == [
        {"examen": "E", "descripcion": "Examen", "cantidad": 22508},
    ]
    assert len(response.content) > 3_000_000


async def test_real_permission_dependency_rejects_before_parsing(real_app: Any) -> None:
    _, client, headers, access, user = real_app
    missing = await client.post(PATH, content=b"invalid", headers={"Origin": ORIGIN})
    assert missing.status_code == 401
    assert missing.json() == {"detail": "Falta el encabezado Authorization: Bearer"}
    access.access[user.id] = ((), frozenset({"statistics.administrative.general_consumption.view"}))
    forbidden = await client.post(PATH, content=b"invalid", headers=headers)
    assert forbidden.status_code == 403
    assert forbidden.json() == {"detail": "No tiene permisos para ejecutar esta operacion"}
    assert forbidden.headers["access-control-allow-origin"] == ORIGIN
