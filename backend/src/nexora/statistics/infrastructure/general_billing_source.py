"""Spool JSONL privado y de corta vida que comparten la paginación y las exportaciones.

La consulta SQL y el ETL se ejecutan una sola vez por falla de caché. Los desplazamientos
ocupan ocho bytes por fila retenida y los registros permanecen en disco. Los lectores toman
una concesión de la entrada para que el vencimiento o la expulsión no trunque una exportación.
"""

import asyncio
import json
import tempfile
from array import array
from collections import OrderedDict
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from nexora.integration_management.application.ports import SqlServerReader
from nexora.statistics.application.general_billing import process_chunks
from nexora.statistics.application.ports import CatalogOption, ReportPage
from nexora.statistics.domain.filters import ReportFilter
from nexora.statistics.infrastructure.detailed_invoices_source import (
    SqlServerDetailedInvoicesSource,
)

Row = dict[str, Any]


def _encode(row: Row) -> bytes:
    # Números JSON sin comillas y sin convertir Decimal a float (evita perder precisión).
    cells = (
        json.dumps(key)
        + ":"
        + (
            format(value, "f")
            if isinstance(value, Decimal)
            else json.dumps(value, ensure_ascii=False)
        )
        for key, value in row.items()
    )
    return ("{" + ",".join(cells) + "}\n").encode("utf-8")


@dataclass(slots=True)
class _Entry:
    path: Path
    offsets: array[int]
    expires: float
    timer: asyncio.TimerHandle | None = None
    readers: int = 0
    retired: bool = False

    def read(self, limit: int, offset: int) -> list[Row]:
        if offset >= len(self.offsets):
            return []
        with self.path.open("rb") as file:
            file.seek(self.offsets[offset])
            return [
                json.loads(file.readline(), parse_float=Decimal)
                for _ in range(min(limit, len(self.offsets) - offset))
            ]


class GeneralBillingSource:
    """Fuente de reporte con vida de aplicación, caché acotada y una sola construcción por filtro.

    Un único candado de construcción acota también los escritores SQL/spool concurrentes entre
    filtros distintos. La clave de caché es el `ReportFilter` ya validado (con sedes, empresas
    y líneas).
    """

    def __init__(
        self, reader: SqlServerReader, *, ttl_seconds: float = 60, max_entries: int = 8
    ) -> None:
        if ttl_seconds <= 0 or max_entries < 1:
            raise ValueError("El TTL y el máximo de entradas del spool deben ser positivos")
        self._source = SqlServerDetailedInvoicesSource(reader)
        self._ttl = ttl_seconds
        self._maximum = max_entries
        self._entries: OrderedDict[ReportFilter, _Entry] = OrderedDict()
        self._lock = asyncio.Lock()
        self._directory: tempfile.TemporaryDirectory[str] | None = None
        self._closed = False
        self._readers = 0

    @property
    def spool_directory(self) -> Path | None:
        """Para observar la limpieza operativa; esta ruta privada nunca se expone por HTTP."""
        return Path(self._directory.name) if self._directory else None

    async def sites(self) -> list[CatalogOption]:
        return await self._source.sites()

    async def companies(self) -> list[CatalogOption]:
        return await self._source.companies()

    async def product_lines(self) -> list[CatalogOption]:
        return await self._source.product_lines()

    def _retire(self, filter: ReportFilter, entry: _Entry) -> None:
        if self._entries.get(filter) is entry:
            self._entries.pop(filter)
        entry.retired = True
        if entry.timer:
            entry.timer.cancel()
        if not entry.readers:
            entry.path.unlink(missing_ok=True)

    def _cleanup_directory(self) -> None:
        if self._closed and not self._readers and self._directory:
            self._directory.cleanup()

    async def _build(self, filter: ReportFilter) -> _Entry:
        if self._directory is None:
            # Creación segura (0700 en POSIX; carpeta temporal privada del usuario en Windows).
            self._directory = tempfile.TemporaryDirectory(prefix="nexora-billing-")
        offsets = array("Q")
        path: Path | None = None
        rows = process_chunks(self._source.stream(filter))
        try:
            with tempfile.NamedTemporaryFile(
                dir=self._directory.name, suffix=".jsonl", delete=False
            ) as file:
                path = Path(file.name)
                async for row in rows:
                    offsets.append(file.tell())
                    file.write(_encode(row))
            return _Entry(path, offsets, asyncio.get_running_loop().time() + self._ttl)
        except BaseException:
            if path:
                path.unlink(missing_ok=True)
            raise
        finally:
            await rows.aclose()

    @asynccontextmanager
    async def _lease(self, filter: ReportFilter) -> AsyncIterator[_Entry]:
        async with self._lock:
            if self._closed:
                raise RuntimeError("El spool de facturación está cerrado")
            loop = asyncio.get_running_loop()
            for key, cached in list(self._entries.items()):
                if cached.expires <= loop.time():
                    self._retire(key, cached)
            entry = self._entries.get(filter)
            if entry is None:
                entry = await self._build(filter)
                while len(self._entries) >= self._maximum:
                    key, oldest = next(iter(self._entries.items()))
                    self._retire(key, oldest)
                self._entries[filter] = entry
                entry.timer = loop.call_later(self._ttl, self._retire, filter, entry)
            self._entries.move_to_end(filter)
            entry.readers += 1
            self._readers += 1
        try:
            yield entry
        finally:
            entry.readers -= 1
            self._readers -= 1
            if entry.retired and not entry.readers:
                entry.path.unlink(missing_ok=True)
            self._cleanup_directory()

    async def page(self, filter: ReportFilter, limit: int, offset: int) -> ReportPage:
        async with self._lease(filter) as entry:
            return ReportPage(entry.read(limit, offset), len(entry.offsets))

    async def stream(self, filter: ReportFilter) -> AsyncIterator[list[Row]]:
        async with self._lease(filter) as entry:
            for offset in range(0, len(entry.offsets), 2000):
                yield entry.read(2000, offset)

    async def aclose(self) -> None:
        """Se llama al apagar; las concesiones activas limpian cuando sus lectores terminan."""
        async with self._lock:
            self._closed = True
            for filter, entry in list(self._entries.items()):
                self._retire(filter, entry)
            self._cleanup_directory()
