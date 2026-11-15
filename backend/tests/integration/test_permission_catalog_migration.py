"""0003 corrige permisos de estadistica ya sembrados sin tocar otras filas ni asignaciones."""

from __future__ import annotations

from argparse import Namespace
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from nexora.bootstrap.settings import Settings

OBSOLETE = "statistics.resolutions.res_1552_2013_256_2016.view"
CIRCULAR = "statistics.circulars.circular_06_2018.view"
EDITED = "statistics.circulars.circular_21_2026.view"
OTHER = "statistics.reports.vital_signs.view"


def _insert_permission(connection, code: str, name: str) -> None:
    connection.execute(
        text(
            "INSERT INTO iam.permiso (id, codigo, nombre, descripcion, modulo) "
            "VALUES (:id, :code, :name, :name, 'statistics') "
            "ON CONFLICT (codigo) DO UPDATE SET nombre = :name, descripcion = :name"
        ),
        {"id": uuid4(), "code": code, "name": name},
    )


def test_catalog_correction_is_targeted_and_idempotent(settings: Settings) -> None:
    config = Config("alembic.ini")
    config.cmd_opts = Namespace(x=[f"url={settings.database_url}"])
    engine = create_engine(settings.database_url)
    try:
        command.downgrade(config, "0002_session_refresh_grace")
        with engine.begin() as connection:
            connection.execute(
                text("DELETE FROM iam.permiso WHERE codigo IN (:a, :b, :c, :d)"),
                {"a": OBSOLETE, "b": CIRCULAR, "c": EDITED, "d": OTHER},
            )
            role_id = uuid4()
            connection.execute(
                text("INSERT INTO iam.rol (id, codigo, nombre) VALUES (:id, :code, 'Rol Prueba')"),
                {"id": role_id, "code": f"TEST_{role_id.hex[:8]}"},
            )
            _insert_permission(
                connection, OBSOLETE, "Consultar Resolución 1552 de 2013 & 256 de 2016"
            )
            _insert_permission(connection, CIRCULAR, "Consultar Circular 06 de 2018 (Medicamentos)")
            _insert_permission(connection, EDITED, "Nombre editado por un administrador")
            _insert_permission(connection, OTHER, "Consultar informe Signos Vitales")
            for code in (OBSOLETE, OTHER):
                connection.execute(
                    text(
                        "INSERT INTO iam.rol_permiso (rol_id, permiso_id) "
                        "SELECT :role, id FROM iam.permiso WHERE codigo = :code"
                    ),
                    {"role": role_id, "code": code},
                )
        for _ in range(2):  # segunda pasada sobre la base ya corregida: idempotencia
            command.downgrade(config, "0002_session_refresh_grace")
            command.upgrade(config, "head")
            with engine.connect() as connection:
                rows = dict(
                    connection.execute(
                        text(
                            "SELECT codigo, nombre FROM iam.permiso WHERE codigo IN (:a,:b,:c,:d)"
                        ),
                        {"a": OBSOLETE, "b": CIRCULAR, "c": EDITED, "d": OTHER},
                    ).all()
                )
                links = [
                    row[0]
                    for row in connection.execute(
                        text(
                            "SELECT p.codigo FROM iam.rol_permiso rp "
                            "JOIN iam.permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = :role"
                        ),
                        {"role": role_id},
                    )
                ]
            assert OBSOLETE not in rows
            assert rows[CIRCULAR] == "Consultar Circular 06 de 2018"
            assert rows[EDITED] == "Nombre editado por un administrador"
            assert rows[OTHER] == "Consultar informe Signos Vitales"
            assert links == [OTHER]
    finally:
        with engine.begin() as connection:
            connection.execute(text("DELETE FROM iam.rol WHERE id = :id"), {"id": role_id})
        engine.dispose()
