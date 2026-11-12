"""Derive streaming exports from paged SQL without changing report semantics."""

import re

_PAGING = "OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY\n"
_TOTAL_COLUMN = re.compile(r",\s*COUNT\(\*\) OVER \(\)\s+AS total_registros")


def derive_export_sql(paged_sql: str, report_name: str) -> str:
    """Remove only the total column and pagination; fail closed if markers change."""
    export_sql = _TOTAL_COLUMN.sub("", paged_sql).replace(_PAGING, "")
    if export_sql == paged_sql or "OFFSET" in export_sql or "total_registros" in export_sql:
        raise RuntimeError(f"No se pudo derivar la consulta de exportacion de {report_name}")
    return export_sql
