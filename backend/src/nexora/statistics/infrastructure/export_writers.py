"""Escritores de exportación por bloques (CSV y XLSX) sin cargar el resultado completo en memoria.

CSV se emite a medida que llegan los bloques. XLSX se escribe en un archivo temporal en disco
(ZIP con hojas en streaming) y se devuelve por trozos; no requiere dependencias adicionales.
"""

import asyncio
import csv
import io
import re
import tempfile
import zipfile
from collections.abc import AsyncIterator, Callable, Sequence
from decimal import Decimal, InvalidOperation
from typing import IO, Any
from xml.sax.saxutils import escape

from nexora.statistics.application.export import ExportColumn

Row = dict[str, Any]
Chunks = AsyncIterator[list[Row]]

CSV_SEPARATOR = ";"
XLSX_MAX_ROWS = 1_048_576  # filas por hoja de Excel, incluida la cabecera
_DATE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?$")
_XML_ILLEGAL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
_FORMULA_START = re.compile("^[=+\\-@\t\r]")
_READ_BLOCK = 64 * 1024


def _is_empty(value: Any) -> bool:
    return value is None or value == ""


def _date_text(value: Any) -> str:
    text = str(value)
    match = _DATE.match(text)
    return f"{match[3]}/{match[2]}/{match[1]}" if match else text


def _number(value: Any) -> str | None:
    """Texto decimal exacto del número, o None cuando el valor no es numérico."""
    try:
        number = Decimal(str(value).strip())
    except InvalidOperation:
        return None
    if not number.is_finite():
        return None
    return format(number.normalize(), "f") if number else "0"


def _csv_cell(value: Any, kind: str) -> str:
    if _is_empty(value):
        return ""
    if kind == "date":
        return _date_text(value)
    if kind == "number":
        number = _number(value)
        if number is not None:
            return number
    text = str(value)
    # Texto que una hoja de cálculo podría ejecutar como fórmula se neutraliza (CSV injection).
    return f"'{text}" if _FORMULA_START.match(text) else text


async def csv_stream(columns: Sequence[ExportColumn], chunks: Chunks) -> AsyncIterator[bytes]:
    """BOM + separador `;` para que Excel regional abra el archivo en columnas y UTF-8."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=CSV_SEPARATOR, lineterminator="\r\n")
    writer.writerow([column.id for column in columns])
    yield ("\ufeff" + buffer.getvalue()).encode("utf-8")
    async for chunk in chunks:
        buffer.seek(0)
        buffer.truncate()
        writer.writerows(
            [_csv_cell(row.get(column.id), column.type) for column in columns] for row in chunk
        )
        yield buffer.getvalue().encode("utf-8")


def _column_letter(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _xml_text(value: Any) -> str:
    return escape(_XML_ILLEGAL.sub("", str(value)))


_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
    "</styleSheet>"
)
_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


class XlsxWriter:
    """Libro de una o más hojas (se abre otra al llenar la actual), escrito fila a fila."""

    def __init__(self, target: IO[bytes], columns: Sequence[ExportColumn]) -> None:
        self._zip = zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=1)
        self._columns = list(columns)
        self._sheet: IO[bytes] | None = None
        self._sheets = 0
        self._rows = 0

    def _open_sheet(self) -> None:
        self._sheets += 1
        sheet = self._zip.open(f"xl/worksheets/sheet{self._sheets}.xml", "w", force_zip64=True)
        widths = "".join(
            f'<col min="{i}" max="{i}" width="{min(40, max(12, len(c.id) + 2))}" customWidth="1"/>'
            for i, c in enumerate(self._columns, 1)
        )
        sheet.write(
            (
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<worksheet xmlns="{_NS}"><sheetViews><sheetView workbookViewId="0">'
                '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
                f"</sheetView></sheetViews><cols>{widths}</cols><sheetData>"
            ).encode()
        )
        self._sheet = sheet
        self._rows = 0
        self._write_row(
            f'<c r="{_column_letter(i)}1" t="inlineStr" s="1"><is><t>{_xml_text(c.id)}</t></is></c>'
            for i, c in enumerate(self._columns)
        )

    def _write_row(self, cells: Any) -> None:
        if self._sheet is None:
            raise RuntimeError("No hay hoja abierta")
        self._rows += 1
        self._sheet.write(f'<row r="{self._rows}">{"".join(cells)}</row>'.encode())

    def _close_sheet(self) -> None:
        if self._sheet is not None:
            self._sheet.write(b"</sheetData></worksheet>")
            self._sheet.close()
            self._sheet = None

    def _cell(self, index: int, column: ExportColumn, value: Any) -> str:
        if _is_empty(value):
            return ""
        ref = f"{_column_letter(index)}{self._rows}"
        if column.type == "number":
            number = _number(value)
            if number is not None:
                return f'<c r="{ref}"><v>{number}</v></c>'
        text = _date_text(value) if column.type == "date" else str(value)
        return (
            f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{_xml_text(text)}</t></is></c>'
        )

    def write_rows(self, rows: Sequence[Row]) -> None:
        for row in rows:
            if self._sheet is None or self._rows >= XLSX_MAX_ROWS:
                self._close_sheet()
                self._open_sheet()
            self._write_row(
                self._cell(i, column, row.get(column.id)) for i, column in enumerate(self._columns)
            )

    def close(self) -> None:
        if self._sheets == 0:
            self._open_sheet()
        self._close_sheet()
        count = range(1, self._sheets + 1)
        head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        sheets = "".join(f'<sheet name="Hoja{n}" sheetId="{n}" r:id="rId{n}"/>' for n in count)
        rels = "".join(
            f'<Relationship Id="rId{n}" Type="{_REL_NS}/worksheet" '
            f'Target="worksheets/sheet{n}.xml"/>'
            for n in count
        )
        overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{n}.xml" ContentType="application/vnd.'
            'openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for n in count
        )
        parts = {
            "[Content_Types].xml": (
                f'{head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.'
                'relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
                '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.'
                'openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                '<Override PartName="/xl/styles.xml" ContentType="application/vnd.'
                f'openxmlformats-officedocument.spreadsheetml.styles+xml"/>{overrides}</Types>'
            ),
            "_rels/.rels": (
                f'{head}<Relationships xmlns="{_PKG_REL}"><Relationship Id="rId1" '
                f'Type="{_REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>'
            ),
            "xl/workbook.xml": (
                f'{head}<workbook xmlns="{_NS}" xmlns:r="{_REL_NS}">'
                f"<sheets>{sheets}</sheets></workbook>"
            ),
            "xl/_rels/workbook.xml.rels": (
                f'{head}<Relationships xmlns="{_PKG_REL}">{rels}'
                f'<Relationship Id="rIdStyles" Type="{_REL_NS}/styles" Target="styles.xml"/>'
                "</Relationships>"
            ),
            "xl/styles.xml": _STYLES,
        }
        for name, content in parts.items():
            self._zip.writestr(name, content)
        self._zip.close()


async def xlsx_stream(columns: Sequence[ExportColumn], chunks: Chunks) -> AsyncIterator[bytes]:
    with tempfile.TemporaryFile() as target:
        writer = XlsxWriter(target, columns)
        async for chunk in chunks:
            await asyncio.to_thread(writer.write_rows, chunk)
        await asyncio.to_thread(writer.close)
        target.seek(0)
        while block := await asyncio.to_thread(target.read, _READ_BLOCK):
            yield block


Writer = Callable[[Sequence[ExportColumn], Chunks], AsyncIterator[bytes]]
WRITERS: dict[str, tuple[Writer, str, str]] = {
    "csv": (csv_stream, "text/csv; charset=utf-8", "csv"),
    "xlsx": (
        xlsx_stream,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx",
    ),
}
