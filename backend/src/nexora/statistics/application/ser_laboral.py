"""CSV streaming Ser Laboral y caché efímera por token opaco, de vida de aplicación."""

import asyncio
import codecs
import csv
import io
import secrets
from collections import OrderedDict
from time import monotonic
from typing import Any

from nexora.statistics.application.general_consumption import COLUMNS
from nexora.statistics.domain.filters import InvalidReportFilter
from nexora.statistics.domain.general_billing import Money, add_money, month_name, normalize_text
from nexora.statistics.domain.ser_laboral import (
    csv_money,
    document_date,
    line_total,
    patient_date,
)

# Solo se exigen las fuentes realmente usadas; los alias ajenos/garbled se ignoran.
TEXT_SOURCES = {
    "sede": "sede",
    "emprs": "emprs",
    "cnsctvo_dcto": "cnsctvo_dcto",
    "dscrp_transcn": "dscrp_transcn",
    "pnto_atncn": "pnto_atncn_atncn",
    "lna_prdcto": "lna_prdcto",
    "cdgo_prcdmnto": "cdgo_prcdmnto",
    "procedimiento": "procedimiento",
    "cc_afldo": "cc_afldo",
    "nombre_completo": "afldo",
    "genero": "genero",
    "prfsnl_salud_ordn": "prfsnl_salud_ordn",
    "prfsnl_salud_rlza": "prfsnl_salud_rlza",
    "usrio_mdfca": "usrio_mdfca",
    "nmro_atrzcn_eps": "nmro_atrzcn_eps",
}
REQUIRED_HEADERS = (
    "estado", "sede", "emprs", "cnsctvo_dcto", "dscrp_transcn", "fcha_dcto",
    "pnto_atncn_atncn", "lna_prdcto", "cdgo_prcdmnto", "procedimiento", "cc_afldo",
    "afldo", "genero", "fcha_ingrso_pcnte", "fcha_egrso_pcnte", "prfsnl_salud_ordn",
    "prfsnl_salud_rlza", "cntdd", "vlr_untro", "usrio_mdfca", "nmro_atrzcn_eps",
)


class SerLaboralExpired(ValueError):
    def __init__(self) -> None:
        super().__init__("El archivo de Ser Laboral expiró; cárgalo de nuevo.")


def _encoding(content: bytes) -> str:
    # Validación incremental: no se materializa una segunda copia completa decodificada.
    decoder = codecs.getincrementaldecoder("utf-8-sig")()
    try:
        for offset in range(0, len(content), 65536):
            decoder.decode(content[offset : offset + 65536])
        decoder.decode(b"", final=True)
        return "utf-8-sig"
    except UnicodeDecodeError:
        return "cp1252"


def process_csv(content: bytes) -> dict[str, Any]:
    """Una pasada CSV, índices únicos resueltos una vez; totaliza sobre filas retenidas.

    Solo permanecen las 40 columnas calculadas que exige la respuesta JSON. Una segunda
    pasada por esas filas asigna el total a la primera aparición, aunque estén intercaladas.
    """
    encoding = _encoding(content)
    # Un archivo con BOM pero bytes cp1252 defectuosos tampoco deja el BOM en la cabecera.
    if encoding == "cp1252" and content.startswith(codecs.BOM_UTF8):
        content = content[len(codecs.BOM_UTF8) :]
    rows: list[dict[str, Any]] = []
    totals: dict[str, Money] = {}
    omitted = 0
    try:
        with io.TextIOWrapper(io.BytesIO(content), encoding=encoding, newline="") as stream:
            reader = csv.reader(stream, delimiter=",", strict=True)
            headers = [h.strip().lower() for h in next(reader, [])]
            missing = [h for h in REQUIRED_HEADERS if h not in headers]
            if missing:
                raise InvalidReportFilter(
                    f"Cabeceras requeridas faltantes: {', '.join(missing)}."
                )
            if any(headers.count(h) != 1 for h in REQUIRED_HEADERS):
                raise InvalidReportFilter("No se permiten cabeceras requeridas duplicadas.")
            indexes = {h: headers.index(h) for h in REQUIRED_HEADERS}
            text_indexes = [(target, indexes[source]) for target, source in TEXT_SOURCES.items()]
            for values in reader:
                if not values:
                    continue
                # Una fila truncada tiene campos ausentes vacíos; no interrumpe el informe.
                if len(values) < len(headers):
                    values.extend([""] * (len(headers) - len(values)))
                if normalize_text(values[indexes["estado"]]) != "CERRADO":
                    omitted += 1
                    continue
                row: dict[str, Any] = {key: "" for key, _, _ in COLUMNS}
                row.update(
                    {target: normalize_text(values[index]) for target, index in text_indexes}
                )
                quantity = csv_money(values[indexes["cntdd"]])
                unit_price = csv_money(values[indexes["vlr_untro"]])
                amount = line_total(quantity, unit_price)
                reference = document_date(values[indexes["fcha_dcto"]])
                row.update({
                    "admision": "0", "fcha_dcto": reference,
                    "fcha_ingrso_pcnte": patient_date(values[indexes["fcha_ingrso_pcnte"]]),
                    "fcha_egreso": patient_date(values[indexes["fcha_egrso_pcnte"]]),
                    "vlr_srvcs": 0, "vlr_smnstrs": 0, "cntdd": quantity,
                    "vlr_untro": unit_price, "cntdd1": amount, "total_cntdd1": 0,
                    "vlr_copago": 0, "pago_tpo1": 0, "pago_tpo2": 0,
                    "mes_dcto": month_name(reference),
                })
                invoice = row["cnsctvo_dcto"]
                totals[invoice] = add_money(totals.get(invoice, 0), amount)
                rows.append(row)
    except (UnicodeDecodeError, csv.Error) as exc:
        raise InvalidReportFilter("El archivo CSV de Ser Laboral no es válido.") from exc
    if not rows:
        raise InvalidReportFilter("Ningún registro cumple los filtros.")
    for row in rows:
        row["total_cntdd1"] = totals.pop(row["cnsctvo_dcto"], 0)
    return {"filas": rows, "total": len(rows), "omitidas": omitted, "advertencias": []}


class SerLaboralCache:
    """Tokens aleatorios de 256 bits; TTL fijo 30 min y máximo 8 cargas por aplicación.

    Timer activo y comprobación monotónica al leer; expiración/expulsión/cierre liberan filas.
    Solo publicar entradas tras completar un procesamiento válido, sin modificar otras cargas.
    """

    def __init__(self, *, ttl_seconds: float = 1800, max_entries: int = 8) -> None:
        if ttl_seconds <= 0 or max_entries < 1:
            raise ValueError("El TTL y el máximo de entradas deben ser positivos.")
        self._ttl, self._maximum = ttl_seconds, max_entries
        self._entries: OrderedDict[
            str, tuple[dict[str, Any], float, asyncio.TimerHandle]
        ] = OrderedDict()
        self._closed = False

    def _expire(self, token: str) -> None:
        if entry := self._entries.pop(token, None):
            entry[2].cancel()

    async def load(self, content: bytes) -> dict[str, Any]:
        result = await asyncio.to_thread(process_csv, content)
        if self._closed:
            raise SerLaboralExpired
        while len(self._entries) >= self._maximum:
            self._expire(next(iter(self._entries)))
        token = secrets.token_urlsafe(32)
        timer = asyncio.get_running_loop().call_later(self._ttl, self._expire, token)
        self._entries[token] = (result, monotonic() + self._ttl, timer)
        return {"ser_laboral_id": token, **result}

    def rows(self, token: str) -> list[dict[str, Any]]:
        entry = self._entries.get(token)
        if entry is None:
            raise SerLaboralExpired
        if entry[1] <= monotonic():
            self._expire(token)
            raise SerLaboralExpired
        rows: list[dict[str, Any]] = entry[0]["filas"]
        return rows

    def close(self) -> None:
        self._closed = True
        for token in list(self._entries):
            self._expire(token)
