"""Consumo de Laboratorio: fuentes compartidas, proyección independiente y cargas efímeras."""

import asyncio
from typing import IO, Any

from nexora.statistics.application.annar_lab import (
    AnnarLabExpired,
    check_size,
    process_xls,
    process_xlsx,
)
from nexora.statistics.application.general_consumption import _read_chunks, _transform
from nexora.statistics.application.ports import CatalogOption, ReportSource
from nexora.statistics.application.ser_laboral import SerLaboralCache, process_csv
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.domain.lab_consumption import (
    invoice_matches,
    is_laboratory,
    project_row,
)


def process_annar_excel(content: bytes) -> dict[str, Any]:
    # HTTP valida el formato declarado antes de cargar; una caché y un worker comunes.
    return process_xlsx(content) if content.startswith(b"PK") else process_xls(content)


def process_lab_csv(content: bytes) -> dict[str, Any]:
    check_size(content)
    result = process_csv(content)
    rows = [
        project_row(row, "ser_laboral")
        for row in result["filas"]
        if is_laboratory(row.get("lna_prdcto"))
    ]
    if not rows:
        raise InvalidReportFilter("Ningún registro cumple los filtros.")
    return {
        "filas": rows,
        "total": len(rows),
        "omitidas": result["omitidas"] + result["total"] - len(rows),
        "advertencias": [],
    }


def _invoices(file: IO[bytes]) -> list[dict[str, Any]]:
    async def process() -> list[dict[str, Any]]:
        return [
            project_row(raw, "facturas")
            async for chunk in _read_chunks(file)
            for raw in chunk
            if invoice_matches(raw)
        ]

    return asyncio.run(process())


def _admissions(file: IO[bytes]) -> list[dict[str, Any]]:
    async def process() -> list[dict[str, Any]]:
        return [
            project_row(raw, "admisiones")
            async for chunk in _read_chunks(file)
            for raw in chunk
            if is_laboratory(raw.get("lna_prdcto"))
        ]

    return asyncio.run(process())


class LabConsumptionReport:
    """Servicio de aplicación; dos consultas concurrentes, sin cuotas moderadoras.

    Cada consulta usa el catálogo actual. El spool/worker compartido no retiene las dos
    entradas SQL en memoria y cierra sus archivos/cursos incluso ante cancelación.
    """

    def __init__(
        self,
        invoices: ReportSource,
        admissions: ReportSource,
        *,
        upload_ttl_seconds: float = 1800,
        upload_max_entries: int = 8,
    ) -> None:
        self._invoices, self._admissions = invoices, admissions
        self.ser_laboral = SerLaboralCache(
            ttl_seconds=upload_ttl_seconds,
            max_entries=upload_max_entries,
            processor=process_lab_csv,
        )
        self.annar_lab = SerLaboralCache(
            ttl_seconds=upload_ttl_seconds,
            max_entries=upload_max_entries,
            processor=process_annar_excel,
            result_key="annar_lab_id",
            expired=AnnarLabExpired,
        )

    async def sites(self) -> list[CatalogOption]:
        return await self._invoices.sites()

    async def companies(self) -> list[CatalogOption]:
        return await self._invoices.companies()

    async def build(self, filters: ReportFilter) -> dict[str, Any]:
        lines = tuple(
            option.id
            for option in await self._invoices.product_lines()
            if "LABORATORIO" in option.nombre.upper()
        )
        invoices: list[dict[str, Any]] = []
        admissions: list[dict[str, Any]] = []
        warnings = []
        if lines:
            selected = ReportFilter(
                filters.fecha_inicial, filters.fecha_final, filters.sedes, filters.empresas, lines
            )
            tasks = [
                asyncio.create_task(_transform(source, selected, processor))
                for source, processor in (
                    (self._invoices, _invoices),
                    (self._admissions, _admissions),
                )
            ]
            try:
                invoices, admissions = await asyncio.gather(*tasks)
            except BaseException:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                raise
        else:
            warnings.append("No hay líneas de producto de LABORATORIO configuradas.")
        return {
            "facturas": invoices,
            "admisiones": admissions,
            "total_facturas": len(invoices),
            "total_admisiones": len(admissions),
            "advertencias": warnings,
        }

    async def aclose(self) -> None:
        self.ser_laboral.close()
        self.annar_lab.close()
