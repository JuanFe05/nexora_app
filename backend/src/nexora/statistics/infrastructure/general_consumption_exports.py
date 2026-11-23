"""Análisis independiente: solo indicadores, estilo azul NEXORA y Carta horizontal."""

import io
import zipfile
from decimal import Decimal
from typing import Any

from nexora.statistics.application.export import ExportColumn
from nexora.statistics.infrastructure.export_writers import XlsxWriter
from nexora.statistics.infrastructure.sivigila_pdf import (
    BLUE,
    INK,
    LIGHT,
    PAGE_H,
    PAGE_W,
    WHITE,
    _assemble,
    _Canvas,
    wrap,
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


def _cop(value: Any) -> str:
    return "$ " + format(Decimal(str(value)), ",.2f").replace(",", "_").replace(".", ",").replace(
        "_", "."
    )


def build_analysis_pdf(
    indicators: list[dict[str, Any]],
    title: str,
    period: str,
) -> bytes:
    canvas = _Canvas([])
    left, width, label_width = 42.0, PAGE_W - 84, 500.0
    y = PAGE_H - 52
    for text, size in ((title, 16), (period, 11)):
        for line in wrap(text, width - 8, size, True):
            canvas.cell_text(left, y - 25, width, 25, [line], size, True, BLUE, "center")
            y -= 25
    y -= 18
    rows = [("Indicador", "Valor (COP)"), *[(i["etiqueta"], _cop(i["valor"])) for i in indicators]]
    for index, (label, amount) in enumerate(rows):
        lines = wrap(label, label_width - 12, 11, index == 0)
        height = max(34.0, len(lines) * 14.0 + 10)
        y -= height
        for x, w, text_lines in (
            (left, label_width, lines),
            (left + label_width, width - label_width, [amount]),
        ):
            canvas.rect(x, y, w, height, BLUE if index == 0 else LIGHT if index % 2 else None)
            canvas.cell_text(
                x,
                y,
                w,
                height,
                text_lines,
                11,
                index == 0,
                WHITE if index == 0 else INK,
                "left" if x == left else "center",
            )
    return _assemble("\n".join(canvas.ops).encode("latin-1"), title)


def build_analysis_xlsx(
    indicators: list[dict[str, Any]],
    title: str,
    period: str,
) -> bytes:
    # El escritor existente mantiene las invariantes del paquete OOXML. Solo se sustituye
    # la presentación de su única hoja por las celdas y estilos de SIVIGILA.
    buffer = io.BytesIO()
    writer = XlsxWriter(
        buffer, [ExportColumn("Indicador", "text"), ExportColumn("Valor (COP)", "number")]
    )
    writer.close()
    rows = [
        f'<row r="1" ht="28" customHeight="1">{_text_cell("A1", title, TITLE)}</row>',
        f'<row r="2" ht="24" customHeight="1">{_text_cell("A2", period, SUBTITLE)}</row>',
        '<row r="4" ht="28" customHeight="1">'
        + _text_cell("A4", "Indicador", HEADER)
        + _text_cell("B4", "Valor (COP)", HEADER)
        + "</row>",
    ]
    for index, indicator in enumerate(indicators, 5):
        rows.append(
            f'<row r="{index}" ht="30" customHeight="1">'
            + _text_cell(f"A{index}", indicator["etiqueta"], LABEL)
            + f'<c r="B{index}" s="{NUMBER}"><v>{indicator["valor"]}</v></c></row>'
        )
    sheet = _sheet(
        rows,
        cols=[76, 26],
        extra_view=' showGridLines="0">',
        tail=(
            '<mergeCells count="2"><mergeCell ref="A1:B1"/><mergeCell ref="A2:B2"/></mergeCells>'
            '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
            '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1"/>'
        ),
    )
    output = io.BytesIO()
    with (
        zipfile.ZipFile(buffer) as source,
        zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target,
    ):
        for name in source.namelist():
            data = (
                sheet
                if name == "xl/worksheets/sheet1.xml"
                else (
                    _STYLES.replace('<numFmts count="1">', '<numFmts count="2">')
                    .replace(
                        "</numFmts>",
                        '<numFmt numFmtId="165" formatCode="&quot;$&quot; #,##0.00"/></numFmts>',
                    )
                    .replace('numFmtId="1"', 'numFmtId="165"')
                    .encode()
                    if name == "xl/styles.xml"
                    else source.read(name)
                )
            )
            if name == "xl/workbook.xml":
                data = data.replace(b'name="Hoja1"', 'name="Análisis"'.encode())
            target.writestr(name, data)
    return output.getvalue()
