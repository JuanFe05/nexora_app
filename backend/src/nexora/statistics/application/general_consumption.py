"""Consumo General: dos streams SQL concurrentes, ETL fuera del event loop y caché corta.

El spool temporal de entrada evita retener ambos conjuntos SQL crudos en memoria. Solo las
filas calculadas que exige la respuesta JSON permanecen en la caché acotada de aplicación.
"""

import asyncio
import pickle
import tempfile
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable, Mapping
from typing import IO, Any

from nexora.statistics.application.general_billing import COLUMNS as BILLING_COLUMNS
from nexora.statistics.application.general_billing import Row, clean_record, process_chunks
from nexora.statistics.application.ports import CatalogOption, ReportSource
from nexora.statistics.configuration.general_consumption import MODERATOR_FEES
from nexora.statistics.domain.filters import InvalidReportFilter, ReportFilter
from nexora.statistics.domain.general_billing import add_money, money, normalize_text, parse_date
from nexora.statistics.domain.general_consumption import UnconfiguredFeeYear, fila_cumple

COLUMNS = tuple(
    column
    for column in BILLING_COLUMNS
    if column[0]
    not in {
        "cnsctvo_fctra_agrpda",
        "no_remision",
        "fcha_rmsn",
        "no_envio",
    }
)

INDICATORS = (
    ("total_venta_particular", "Total Venta Particular"),
    ("total_copagos", "Total Copagos"),
    ("total_cuotas_moderadoras", "Total Cuotas Moderadoras"),
    ("total_copagos_contributivo", "Total Copagos Contributivo (SOS PGP)"),
    ("total_cuotas_moderadoras_contributivo", "Total Cuotas Moderadoras Contributivo (SOS PGP)"),
    ("total_copagos_subsidiado", "Total Copagos Subsidiado (SOS PGP)"),
    ("total_cuotas_moderadoras_subsidiado", "Total Cuotas Moderadoras Subsidiado (SOS PGP)"),
)


def prepare_admission(raw: Row) -> Row:
    """Mapea los alias reales de Admisiones a las 40 columnas de Consumo General.

    `vlr_ttl` = CAST(det.cntdd * det.vlr_untro AS BIGINT), igual que `cntdd1` en
    Facturas Detalladas; NO se usa `vlr_srvco` (unitario) ni se añaden honorarios.
    Fecha de referencia de edad, curso de vida y mes: siempre `fcha_admsn`.
    """
    mapped = {key: raw.get(key) for key, _, _ in COLUMNS}
    mapped.update(
        {
            key: raw.get(key)
            for key in (
                "prmr_nmbre",
                "sgndo_nmbre",
                "prmr_aplldo",
                "sgndo_aplldo",
            )
        }
    )
    aliases = {
        "emprs": "emprsa",
        "admision": "cnsctvo_admsn",
        "cnsctvo_dcto": "cnsctvo_admsn",
        "cdgo_tpo_dcmnto": "tpo_idntfccn",
        "cc_afldo": "nmro_idntfccn",
        "genero": "sexo",
        "fcha_ingrso_pcnte": "fcha_admsn",
        "fcha_egreso": "fcha_slda_admsn",
        "prfsnl_salud_ordn": "prfsnl_ordna",
        "prfsnl_salud_rlza": "prfsnl_rlza",
        "cdgo_dgnstco": "cd_dx",
        "dscrpcn_dgnstco": "dx",
        "usrio_mdfca": "usro_mdfccn",
        "procedimiento": "prcdmnto",
        "vlr_untro": "vlr_srvco",
        "cntdd1": "vlr_ttl",
    }
    mapped.update({target: raw.get(source) for target, source in aliases.items()})
    mapped["dscrp_transcn"] = "ADMISION"
    mapped["pnto_atncn"] = "URGENCIAS"
    mapped["prfjo_dcto"] = ""
    mapped["fcha_dcto"] = raw.get("fcha_admsn")
    row = clean_record(mapped)
    return {key: row[key] for key, _, _ in COLUMNS}


def _read_chunks(file: IO[bytes]) -> AsyncIterator[list[Row]]:
    async def chunks() -> AsyncIterator[list[Row]]:
        file.seek(0)
        while True:
            try:
                # Solo se deserializan bloques escritos por este proceso en su archivo privado.
                yield pickle.load(file)  # noqa: S301
            except EOFError:
                return

    return chunks()


def _invoices(file: IO[bytes]) -> list[Row]:
    async def mapped_chunks() -> AsyncIterator[list[Row]]:
        async for chunk in _read_chunks(file):
            yield [raw | {"usrio_mdfca": raw.get("usrio_realiza")} for raw in chunk]

    async def process() -> list[Row]:
        return [
            {key: row[key] for key, _, _ in COLUMNS}
            async for row in process_chunks(mapped_chunks(), matches=fila_cumple)
        ]

    return asyncio.run(process())


def _admissions(file: IO[bytes]) -> list[Row]:
    async def process() -> list[Row]:
        rows: list[Row] = []
        totals: dict[str, Any] = {}
        async for chunk in _read_chunks(file):
            for raw in chunk:
                row = prepare_admission(raw)
                key = normalize_text(raw.get("cnsctvo_admsn"))
                totals[key] = add_money(totals.get(key, 0), row["cntdd1"])
                rows.append(row)
        consumed: set[str] = set()
        for row in rows:
            key = row["admision"]
            if key not in consumed:
                row["total_cntdd1"] = money(totals[key])
                consumed.add(key)
        return rows

    return asyncio.run(process())


async def _transform(
    source: ReportSource, filters: ReportFilter, processor: Callable[[IO[bytes]], list[Row]]
) -> list[Row]:
    # SQL entrega bloques; disco, serialización y cálculo nunca ocupan el event loop.
    file = await asyncio.to_thread(tempfile.TemporaryFile, mode="w+b")
    chunks = source.stream(filters)
    try:
        async for chunk in chunks:
            await _thread(pickle.dump, chunk, file, pickle.HIGHEST_PROTOCOL)
        return await _thread(processor, file)
    finally:
        close = getattr(chunks, "aclose", None)
        if close is not None:
            await close()
        await asyncio.to_thread(file.close)


async def _thread[T](function: Callable[..., T], *args: Any) -> T:
    """Esperar al worker incluso al cancelar, antes de cerrar su archivo temporal."""
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        await task
        raise


def analyze(rows: list[Row], fees: Mapping[int, frozenset[int]]) -> list[Row]:
    totals: list[Any] = [0] * len(INDICATORS)
    companies = {
        "SOS PGP MIR Y COR CONTRIBUTIVO": 3,
        "SOS PGP MIR Y COR SUBSIDIADO": 5,
    }
    for row in rows:
        reference = parse_date(row["fcha_dcto"])
        if reference is None:
            raise InvalidReportFilter(
                "Una factura válida no tiene fecha para determinar la vigencia."
            )
        if reference.year not in fees:
            raise UnconfiguredFeeYear(reference.year)
        fee = row["vlr_copago"]
        is_moderator = fee in fees[reference.year]
        index = 2 if is_moderator else 1
        totals[0] = add_money(totals[0], row["pago_tpo1"])
        totals[index] = add_money(totals[index], fee)
        if (company_index := companies.get(row["emprs"])) is not None:
            index = company_index + int(is_moderator)
            totals[index] = add_money(totals[index], fee)
    return [
        {"clave": key, "etiqueta": label, "valor": total}
        for (key, label), total in zip(INDICATORS, totals, strict=True)
    ]


class GeneralConsumptionReport:
    """Servicio de vida de aplicación, single-flight; consult y export comparten resultado.

    Máximo dos filtros por defecto y vencimiento activo a los 60 segundos. No persiste datos
    clínicos en PostgreSQL. Las fuentes comparten exactamente el mismo ReportFilter.
    """

    def __init__(
        self,
        invoices: ReportSource,
        admissions: ReportSource,
        *,
        fees: Mapping[int, frozenset[int]] = MODERATOR_FEES,
        ttl_seconds: float = 60,
        max_entries: int = 2,
    ) -> None:
        if ttl_seconds <= 0 or max_entries < 1:
            raise ValueError("El TTL y el máximo de entradas deben ser positivos.")
        # Import local: el procesador Ser Laboral reutiliza las columnas de este módulo.
        from nexora.statistics.application.ser_laboral import SerLaboralCache

        self.ser_laboral = SerLaboralCache()
        self._invoices, self._admissions = invoices, admissions
        self._fees = dict(fees)
        self._ttl, self._maximum = ttl_seconds, max_entries
        self._cache: OrderedDict[ReportFilter, tuple[dict[str, Any], asyncio.TimerHandle]] = (
            OrderedDict()
        )
        self._lock = asyncio.Lock()

    async def sites(self) -> list[CatalogOption]:
        return await self._invoices.sites()

    async def companies(self) -> list[CatalogOption]:
        return await self._invoices.companies()

    async def product_lines(self) -> list[CatalogOption]:
        return await self._invoices.product_lines()

    def _expire(self, filters: ReportFilter) -> None:
        if entry := self._cache.pop(filters, None):
            entry[1].cancel()

    async def build(self, filters: ReportFilter) -> dict[str, Any]:
        async with self._lock:
            if cached := self._cache.get(filters):
                self._cache.move_to_end(filters)
                return cached[0]
            # gather inicia los dos streams simultáneamente. Ante error, cancelar y esperar
            # ambos para cerrar los cursores y los archivos antes de propagarlo.
            tasks = [
                asyncio.create_task(_transform(source, filters, processor))
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
            indicators = await _thread(analyze, invoices, self._fees)
            result = {
                "indicadores": indicators,
                "facturas": invoices,
                "admisiones": admissions,
                "advertencias": [],
                "total_facturas": len(invoices),
                "total_admisiones": len(admissions),
            }
            while len(self._cache) >= self._maximum:
                self._expire(next(iter(self._cache)))
            timer = asyncio.get_running_loop().call_later(self._ttl, self._expire, filters)
            self._cache[filters] = (result, timer)
            return result

    async def aclose(self) -> None:
        self.ser_laboral.close()
        async with self._lock:
            for filters in list(self._cache):
                self._expire(filters)
