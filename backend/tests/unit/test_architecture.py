"""Limites de Clean Architecture del monolito (S2).

El dominio no conoce frameworks y la aplicacion no conoce infraestructura ni presentacion.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[2] / "src" / "nexora"
CONTEXTS = ("identity_access", "statistics", "integration_management")
FRAMEWORKS = (
    "fastapi",
    "sqlalchemy",
    "psycopg",
    "alembic",
    "jwt",
    "argon2",
    "pydantic",
    "pyodbc",
)


def imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                package = path.relative_to(SRC.parent).with_suffix("").parts[:-1]
                base = package[: len(package) - node.level + 1]
                module = ".".join((*base, *((node.module or "").split(".") if node.module else ())))
            else:
                module = node.module or ""
            modules.add(module)
            modules.update(f"{module}.{alias.name}" for alias in node.names)
    return modules


def python_files(*parts: str) -> list[Path]:
    return sorted((SRC.joinpath(*parts)).rglob("*.py"))


@pytest.mark.parametrize(
    "path", [path for context in CONTEXTS for path in python_files(context, "domain")], ids=str
)
def test_el_dominio_no_depende_de_frameworks(path: Path) -> None:
    for module in imported_modules(path):
        root = module.split(".")[0]
        assert root not in FRAMEWORKS, f"{path.name} importa {module}"
        assert ".infrastructure" not in module, f"{path.name} importa {module}"
        assert ".presentation" not in module, f"{path.name} importa {module}"


@pytest.mark.parametrize(
    "path", [path for context in CONTEXTS for path in python_files(context, "application")], ids=str
)
def test_la_aplicacion_no_depende_de_infraestructura_ni_presentacion(path: Path) -> None:
    for module in imported_modules(path):
        root = module.split(".")[0]
        assert root not in FRAMEWORKS, f"{path.name} importa {module}"
        assert ".infrastructure" not in module, f"{path.name} importa {module}"
        assert ".presentation" not in module, f"{path.name} importa {module}"


@pytest.mark.parametrize(
    "path",
    [path for context in CONTEXTS for path in python_files(context, "infrastructure")],
    ids=str,
)
def test_la_infraestructura_no_depende_de_la_presentacion(path: Path) -> None:
    for module in imported_modules(path):
        assert ".presentation" not in module, f"{path.name} importa {module}"


@pytest.mark.parametrize("path", python_files("statistics"), ids=str)
def test_statistics_no_importa_internos_de_identidad(path: Path) -> None:
    for module in imported_modules(path):
        assert not any(
            module == prefix or module.startswith(prefix + ".")
            for prefix in ("nexora.identity_access.domain", "nexora.identity_access.infrastructure")
        ), f"{path.name} importa {module}"


@pytest.mark.parametrize("path", python_files(), ids=str)
def test_infraestructura_de_reportes_no_se_importa_desde_otros_contextos(path: Path) -> None:
    owner = path.relative_to(SRC).parts[0]
    if owner == "bootstrap":
        return
    for module in imported_modules(path):
        for context in ("statistics", "integration_management"):
            prefix = f"nexora.{context}.infrastructure"
            if module == prefix or module.startswith(prefix + "."):
                assert owner == context, f"{path.name} importa {module}"
