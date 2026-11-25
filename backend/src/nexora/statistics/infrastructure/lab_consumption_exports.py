"""Grouped laboratory archives and styled analysis; dependency-free OOXML/CSV writers."""

import asyncio
import io
import shutil
import tempfile
import zipfile
from collections.abc import AsyncIterator, Iterator, Sequence
from typing import IO, Any

from nexora.statistics.application.export import ExportColumn
from nexora.statistics.infrastructure.export_writers import (
    XLSX_MAX_ROWS,
    XlsxWriter,
    csv_stream,
)
from nexora.statistics.infrastructure.sivigila_workbook import (
    _STYLES,
    HEADER,
    LABEL,
    NUMBER,
    SUBTITLE,
    TITLE,
    _sheet,
    _text_cell,
)

Row = dict[str, Any]
# A table keeps its source lists separate, avoiding another full copy of the report.
Table = tuple[str, Sequence[ExportColumn], Sequence[Sequence[Row]], Sequence[str]]


def _blocks(
    groups: Sequence[Sequence[Row]], columns: Sequence[ExportColumn], keys: Sequence[str]
) -> Iterator[list[Row]]:
    for rows in groups:
        for offset in range(0, len(rows), 2000):
            yield [
                {column.id: row.get(key) for column, key in zip(columns, keys, strict=True)}
                for row in rows[offset : offset + 2000]
            ]


class _GroupedWriter(XlsxWriter):
    """Use the existing row/packaging invariants, explicitly starting each logical sheet."""

    def table(
        self, columns: Sequence[ExportColumn], groups: Sequence[Sequence[Row]], keys: Sequence[str]
    ) -> None:
        self._close_sheet()
        self._columns = list(columns)
        self._open_sheet()
        for block in _blocks(groups, columns, keys):
            self.write_rows(block)


def _copy_book(
    source: IO[bytes], target: IO[bytes], replacements: dict[str, bytes]
) -> None:
    source.seek(0)
    with (
        zipfile.ZipFile(source) as book,
        zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as output,
    ):
        for name in book.namelist():
            if name in replacements:
                output.writestr(name, replacements[name])
            else:
                with book.open(name) as src, output.open(name, "w", force_zip64=True) as dst:
                    shutil.copyfileobj(src, dst, 65536)


def build_grouped(target: IO[bytes], formato: str, tables: Sequence[Table]) -> None:
    """Run entirely in a worker; archives and intermediate workbooks use system temp files."""
    if formato == "csv":
        async def chunks(
            groups: Sequence[Sequence[Row]], columns: Sequence[ExportColumn], keys: Sequence[str]
        ) -> AsyncIterator[list[Row]]:
            for block in _blocks(groups, columns, keys):
                yield block

        async def write_csv(file: IO[bytes], columns: Sequence[ExportColumn],
                            groups: Sequence[Sequence[Row]], keys: Sequence[str]) -> None:
            async for block in csv_stream(columns, chunks(groups, columns, keys)):
                file.write(block)

        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
            for (_, columns, groups, keys), filename in zip(
                tables, ("Datos_Aplicativo.csv", "ANNAR_LAB.csv"), strict=True
            ):
                with archive.open(filename, "w", force_zip64=True) as file:
                    asyncio.run(write_csv(file, columns, groups, keys))
        return
    with tempfile.TemporaryFile() as raw:
        writer = _GroupedWriter(raw, [])
        for _, columns, groups, keys in tables:
            writer.table(columns, groups, keys)
        writer.close()
        raw.seek(0)
        with zipfile.ZipFile(raw) as book:
            workbook = book.read("xl/workbook.xml")
        for index, (name, _, _, _) in enumerate(tables, 1):
            workbook = workbook.replace(f'name="Hoja{index}"'.encode(), f'name="{name}"'.encode())
        _copy_book(raw, target, {"xl/workbook.xml": workbook})


def validate_sheet_sizes(tables: Sequence[Table]) -> bool:
    """Grouped downloads must never silently spill a source into another sheet."""
    return all(sum(len(rows) for rows in groups) < XLSX_MAX_ROWS for _, _, groups, _ in tables)


def build_analysis_xlsx(
    aplicativo: list[Row], annar: list[Row], title: str, period: str
) -> bytes:
    buffer = io.BytesIO()
    writer = XlsxWriter(buffer, [])
    writer.close()
    rows = [
        f'<row r="1" ht="28" customHeight="1">{_text_cell("A1", title, TITLE)}</row>',
        f'<row r="2" ht="24" customHeight="1">{_text_cell("A2", period, SUBTITLE)}</row>',
    ]
    merges = ["A1:G1", "A2:G2", "A4:C4", "E4:G4"]
    tables = (
        ("Datos Aplicativo", "cups", "CUPS", aplicativo, "ABC"),
        ("ANNAR LAB", "examen", "Código", annar, "EFG"),
    )
    rows.append(
        '<row r="4" ht="26" customHeight="1">'
        + "".join(_text_cell(f"{cols[0]}4", name, SUBTITLE)
                  for name, _, _, _, cols in tables) + "</row>"
    )
    rows.append(
        '<row r="5" ht="28" customHeight="1">'
        + "".join(_text_cell(f"{col}5", text, HEADER)
                  for _, _, label, _, cols in tables
                  for col, text in zip(cols, (label, "Descripción", "Cantidad"), strict=True))
        + "</row>"
    )
    # Each XML row contains both tables; D remains entirely empty, even for unequal lengths.
    for offset in range(max(len(aplicativo), len(annar))):
        index = offset + 6
        cells = []
        for _, code, _, data, cols in tables:
            if offset >= len(data):
                continue
            item = data[offset]
            cells.extend((
                _text_cell(f"{cols[0]}{index}", item[code], LABEL),
                _text_cell(f"{cols[1]}{index}", item["descripcion"], LABEL),
                f'<c r="{cols[2]}{index}" s="{NUMBER}"><v>{item["cantidad"]}</v></c>',
            ))
        rows.append(f'<row r="{index}" ht="30" customHeight="1">{"".join(cells)}</row>')
    sheet = _sheet(
        rows, cols=[24, 76, 24, 4, 24, 76, 24], extra_view=' showGridLines="0">',
        tail=(f'<mergeCells count="{len(merges)}">'
              + "".join(f'<mergeCell ref="{ref}"/>' for ref in merges) + "</mergeCells>"
              '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" '
              'header="0.3" footer="0.3"/>'
              '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'),
    )
    buffer.seek(0)
    with zipfile.ZipFile(buffer) as book:
        workbook = book.read("xl/workbook.xml").replace(b'name="Hoja1"', 'name="Análisis"'.encode())
    # Avoid optional decimal separators in the quantity format. General retains numeric
    # cells for integers and fractions; keep the existing fonts, borders and alignment.
    styles = _STYLES.replace('numFmtId="1"', 'numFmtId="0"')
    output = io.BytesIO()
    _copy_book(buffer, output, {
        "xl/workbook.xml": workbook,
        "xl/worksheets/sheet1.xml": sheet,
        "xl/styles.xml": styles.encode(),
    })
    return output.getvalue()
