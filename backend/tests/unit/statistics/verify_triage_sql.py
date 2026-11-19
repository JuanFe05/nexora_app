"""Dependency-light verification when the platform blocks SQLAlchemy's native DLL.

Run from backend: uv run python tests/unit/statistics/verify_triage_sql.py
Only the CSV header is read; patient records are never loaded.
"""

import ast
import re
from pathlib import Path

from nexora.statistics.infrastructure.queries.triage import (
    TRIAGE_EXPORT_QUERY,
    TRIAGE_EXPORT_SQL,
    TRIAGE_QUERY,
    TRIAGE_SQL,
)


def main() -> None:
    root = Path(__file__).resolve().parents[4]
    select = TRIAGE_SQL.split("\nSELECT\n", 1)[1].split("FROM tbPreadmision pa", 1)[0]
    aliases = re.findall(r"\bAS (\w+)\s*(?:,|--|$)", select, re.MULTILINE)
    assert aliases.pop() == "total_registros"
    assert len(aliases) == len(set(aliases)) == 38
    with (root / "data_ips" / "TRIAJE.csv").open(encoding="utf-8-sig") as csv_file:
        assert aliases == csv_file.readline().strip().split(",")
    tests = ast.parse(Path(__file__).with_name("test_shared_reports.py").read_text())
    header = next(
        ast.literal_eval(node.value)
        for node in tests.body
        if isinstance(node, ast.Assign)
        and any(isinstance(t, ast.Name) and t.id == "TRIAGE_HEADER" for t in node.targets)
    )
    assert aliases == header
    assert "OFFSET" not in TRIAGE_EXPORT_SQL and "total_registros" not in TRIAGE_EXPORT_SQL
    expected_params = {
        "fecha_inicial",
        "fecha_final",
        "filtrar_sedes",
        "sedes",
        "filtrar_empresas",
        "empresas",
    }
    assert set(re.findall(r":([a-z_]\w*)", TRIAGE_EXPORT_SQL)) == expected_params
    assert set(re.findall(r":([a-z_]\w*)", TRIAGE_SQL)) == expected_params | {"offset", "limit"}
    for query, suffix in [(TRIAGE_QUERY, ""), (TRIAGE_EXPORT_QUERY, "_export")]:
        assert query.name == f"statistics.triage{suffix}"
        assert query.list_params == frozenset({"sedes", "empresas"})

    # Audit that the packaged query differs from the original ONLY by S2 adaptations.
    original = (root / "data_ips" / "Triaje.sql").read_text(encoding="utf-8-sig")
    original = original.replace(
        "-- PARAMETROS: cambiar fechas", "-- PARAMETROS: fechas de ingreso (ambas inclusivas)"
    )
    original = original.replace("'20260601'", "CAST(:fecha_inicial AS DATE)")
    original = original.replace("'20261117'", "CAST(:fecha_final AS DATE)")
    original = original.replace(
        "AS prmtro_brql\n", "AS prmtro_brql\n    , COUNT(*) OVER () AS total_registros\n"
    )
    original = original.replace(
        "\n\nORDER BY pa.cnsctvo_trgge\n",
        "\n  AND (:filtrar_sedes = 0 OR s.unco IN :sedes)\n"
        "  AND (:filtrar_empresas = 0 OR emp.unco IN :empresas)\n\n"
        "ORDER BY pa.cnsctvo_trgge, pa.unco, thc_trge.unco, thc_atncn.unco\n"
        "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY\n",
    )
    expected = "SET NOCOUNT ON;\nSET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;\n\n" + original
    assert TRIAGE_SQL.strip() == expected.strip()
    print(
        "PASS: 38 aliases match CSV/test headers; export has exactly six bindings "
        "and no paging/total; only S2 SQL adaptations."
    )


if __name__ == "__main__":
    main()
