"""Importación XLS/XLSX de ANNAR LAB en el worker de la caché compartida."""

import io
import re
import struct
import unicodedata
import zipfile
from collections import Counter
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation
from typing import Any
from xml.etree.ElementTree import ParseError

import xlrd  # type: ignore[import-untyped]
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from nexora.statistics.application.ser_laboral import SerLaboralExpired
from nexora.statistics.domain.filters import InvalidReportFilter

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
REQUIRED_HEADERS = (
    "Sede",
    "Nombre Sede",
    "Cliente",
    "Nombre Cliente",
    "Cen.Costo",
    "Nombre Centro de Costos",
    "Medico",
    "Nombre Medico",
    "Seccion",
    "Nombre de la Sección",
    "Examen",
    "Nombre del Examen",
    "Nivel",
    "Valor",
)
COLUMNS = (
    ("codigo_centro_costo", "Código Centro de Costo", "text"),
    ("nombre_centro_costos", "Nombre Centro de Costos", "text"),
    ("nombre_examen", "Nombre del Examen", "text"),
    ("cantidad", "Cantidad", "number"),
    ("empresa", "Empresa", "text"),
    ("punto_atencion", "Punto Atención", "text"),
)


class AnnarLabExpired(SerLaboralExpired):
    def __init__(self) -> None:
        ValueError.__init__(self, "El archivo de ANNAR LAB expiró; cárgalo de nuevo.")


class UploadTooLarge(ValueError):
    """El transporte traduce el límite compartido a HTTP 413."""


def check_size(content: bytes) -> None:
    if len(content) > MAX_UPLOAD_BYTES:
        raise UploadTooLarge("El archivo excede el límite de 25 MB.")


def normalize_header(value: Any) -> str:
    text = str(value).strip().lower()
    # Además de acentos/NBSP, tolerar las variantes de codificación de «Sección».
    text = text.replace("secciã³n", "seccion").replace("secci�n", "seccion")
    text = unicodedata.normalize("NFKD", text)
    return re.sub(r"[^a-z0-9.]", "", text)


def _numeric_code(key: tuple[str, str]) -> tuple[Decimal, str, str]:
    try:
        number = Decimal(key[0])
        if not number.is_finite():
            number = Decimal("Infinity")
    except InvalidOperation:
        number = Decimal("Infinity")
    return number, *key


def _process_rows(values: Iterable[Iterable[Any]]) -> dict[str, Any]:
    """Misma validación, proyección y agrupación para ambos lectores."""
    iterator = iter(values)
    headers = [normalize_header(v) for v in next(iterator, ())]
    missing = [h for h in REQUIRED_HEADERS if normalize_header(h) not in headers]
    if missing:
        raise InvalidReportFilter(f"Cabeceras requeridas faltantes: {', '.join(missing)}.")
    if any(headers.count(normalize_header(h)) != 1 for h in REQUIRED_HEADERS):
        raise InvalidReportFilter("No se permiten cabeceras requeridas duplicadas.")
    indexes = {h: headers.index(normalize_header(h)) for h in REQUIRED_HEADERS}
    rows: list[dict[str, Any]] = []
    groups: Counter[tuple[str, str]] = Counter()
    for raw in iterator:
        cells = ["" if v is None else str(v).strip() for v in raw]
        if not any(cells):
            continue
        fields = {header: cells[i] if i < len(cells) else "" for header, i in indexes.items()}
        code, description = fields["Seccion"], fields["Nombre de la Sección"]
        rows.append(
            {
                "codigo_centro_costo": code,
                "nombre_centro_costos": description,
                "nombre_examen": fields["Nombre del Examen"],
                "cantidad": 1,
                "empresa": fields["Nombre Cliente"],
                "punto_atencion": fields["Nombre Centro de Costos"],
            }
        )
        groups[(code, description)] += 1
    return {
        "filas": rows,
        "total": len(rows),
        "advertencias": [],
        "analisis_annar": [
            {"seccion": code, "descripcion": description, "cantidad": groups[(code, description)]}
            for code, description in sorted(groups, key=_numeric_code)
        ],
    }


def process_xls(content: bytes) -> dict[str, Any]:
    check_size(content)
    if not content:
        raise InvalidReportFilter("El archivo XLS de ANNAR LAB no es válido.")
    try:
        # Una hoja a demanda; sin formateo ni segunda copia completa de celdas crudas.
        with xlrd.open_workbook(file_contents=content, on_demand=True) as book:
            if book.nsheets != 1:
                raise InvalidReportFilter("El archivo XLS de ANNAR LAB debe tener una sola hoja.")
            sheet = book.sheet_by_index(0)
            return _process_rows(sheet.row_values(index) for index in range(sheet.nrows))
    except (
        xlrd.XLRDError,
        xlrd.compdoc.CompDocError,
        struct.error,
        OSError,
        ValueError,
        IndexError,
        EOFError,
        zipfile.BadZipFile,
        KeyError,
        AssertionError,
        NotImplementedError,
        TypeError,
    ) as exc:
        if isinstance(exc, InvalidReportFilter):
            raise
        raise InvalidReportFilter("El archivo XLS de ANNAR LAB no es válido.") from exc


def process_xlsx(content: bytes) -> dict[str, Any]:
    check_size(content)
    try:
        with io.BytesIO(content) as stream:
            book = load_workbook(stream, read_only=True, data_only=True, keep_links=False)
            try:
                if len(book.sheetnames) != 1 or len(book.worksheets) != 1:
                    raise InvalidReportFilter(
                        "El archivo XLSX de ANNAR LAB debe tener una sola hoja."
                    )
                sheet = book.worksheets[0]
                # No confiar en dimensiones incorrectas del productor del archivo.
                sheet.reset_dimensions()
                return _process_rows(sheet.iter_rows(values_only=True))
            finally:
                book.close()
    except (
        InvalidFileException, zipfile.BadZipFile, ParseError, OSError, ValueError,
        IndexError, EOFError, KeyError, TypeError, NotImplementedError, OverflowError,
    ) as exc:
        if isinstance(exc, InvalidReportFilter):
            raise
        raise InvalidReportFilter("El archivo XLSX de ANNAR LAB no es válido.") from exc
