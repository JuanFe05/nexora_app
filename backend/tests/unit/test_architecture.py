"""Limites de Clean Architecture del monolito (S2).

El dominio no conoce frameworks y la aplicacion no conoce infraestructura ni presentacion.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[2] / "src" / "nexora"
FRAMEWORKS = ("fastapi", "sqlalchemy", "psycopg", "alembic", "jwt", "argon2", "pydantic")


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            modules.add(node.module)
    return modules


def python_files(*parts: str) -> list[Path]:
    return sorted((SRC.joinpath(*parts)).rglob("*.py"))


@pytest.mark.parametrize("path", python_files("identity_access", "domain"), ids=str)
def test_el_dominio_no_depende_de_frameworks(path: Path) -> None:
    for module in imported_modules(path):
        root = module.split(".")[0]
        assert root not in FRAMEWORKS, f"{path.name} importa {module}"
        assert ".infrastructure" not in module, f"{path.name} importa {module}"
        assert ".presentation" not in module, f"{path.name} importa {module}"


@pytest.mark.parametrize("path", python_files("identity_access", "application"), ids=str)
def test_la_aplicacion_no_depende_de_infraestructura_ni_presentacion(path: Path) -> None:
    for module in imported_modules(path):
        root = module.split(".")[0]
        assert root not in FRAMEWORKS, f"{path.name} importa {module}"
        assert ".infrastructure" not in module, f"{path.name} importa {module}"
        assert ".presentation" not in module, f"{path.name} importa {module}"


@pytest.mark.parametrize("path", python_files("identity_access", "infrastructure"), ids=str)
def test_la_infraestructura_no_depende_de_la_presentacion(path: Path) -> None:
    for module in imported_modules(path):
        assert ".presentation" not in module, f"{path.name} importa {module}"
