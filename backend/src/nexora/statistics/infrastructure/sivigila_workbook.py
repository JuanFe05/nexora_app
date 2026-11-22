"""Libro de Excel de siete hojas de la Notificación SIVIGILA, sin dependencias externas.

Reutiliza los mismos datos procesados que muestra el módulo: la hoja Análisis conserva el
encabezado y las dos tablas; las demás hojas contienen los registros de cada clasificación.
"""

# ruff: noqa: E501 -- marcado XML del paquete OOXML en línea
import io
import re
import zipfile
from datetime import date
from xml.sax.saxutils import escape

from nexora.statistics.application.sivigila import (
    COLUMNS,
    GROUP_LABELS,
    AnalysisTable,
    Row,
    SivigilaResult,
)
from nexora.statistics.domain.sivigila import parse_date

SHEETS = (
    ("analisis", "Análisis"),
    ("general", "General"),
    ("ira", "Evento IRA"),
    ("eda", "Evento EDA"),
    ("dengue", "Dengue"),
    ("varicela", "Varicela"),
    ("rabia", "Exposición Rábica"),
)
MAX_ROWS = 1_048_575  # límite de Excel menos la fila de encabezado
_ILLEGAL = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f]")
_EPOCH = date(1899, 12, 30)
_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

# Índices de estilo (ver _STYLES).
TITLE, SUBTITLE, HEADER, LABEL, NUMBER, TOTAL_LABEL, TOTAL_NUMBER, TEXT, DATE, INTEGER = range(
    1, 11
)

_STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<styleSheet xmlns="{_NS}">'
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>'
    '<fonts count="5">'
    '<font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    '<font><b/><sz val="14"/><color rgb="FF123EBD"/><name val="Calibri"/></font>'
    '<font><b/><sz val="12"/><color rgb="FF123EBD"/><name val="Calibri"/></font>'
    "</fonts>"
    '<fills count="4"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FF123EBD"/><bgColor indexed="64"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFB"/><bgColor indexed="64"/></patternFill></fill>'
    "</fills>"
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
    '<border><left style="thin"><color rgb="FF123EBD"/></left><right style="thin"><color rgb="FF123EBD"/></right>'
    '<top style="thin"><color rgb="FF123EBD"/></top><bottom style="thin"><color rgb="FF123EBD"/></bottom><diagonal/></border>'
    "</borders>"
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="11">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>'
    '<xf numFmtId="1" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/></styleSheet>'
)


def _col(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def _text_cell(ref: str, value: object, style: int) -> str:
    text = _ILLEGAL.sub("", "" if value is None else str(value))
    if not text:
        return f'<c r="{ref}" s="{style}"/>'
    return f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>'


def _number_cell(ref: str, value: object, style: int) -> str:
    try:
        number = float(value)  # type: ignore[arg-type]
    except TypeError, ValueError:
        return f'<c r="{ref}" s="{style}"/>'
    return f'<c r="{ref}" s="{style}"><v>{int(number) if number.is_integer() else number}</v></c>'


def _sheet(
    rows: list[str],
    *,
    cols: list[float],
    extra_view: str = ">",
    tail: str = "",
    props: str = "",
    dimension: str = "",
) -> bytes:
    widths = "".join(
        f'<col min="{i}" max="{i}" width="{w:.1f}" customWidth="1"/>'
        for i, w in enumerate(cols, start=1)
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{_NS}" xmlns:r="{_REL}">{props}{dimension}'
        f'<sheetViews><sheetView workbookViewId="0"{extra_view}</sheetView></sheetViews>'
        f'<sheetFormatPr defaultRowHeight="15"/><cols>{widths}</cols>'
        f"<sheetData>{''.join(rows)}</sheetData>{tail}</worksheet>"
    )
    return xml.encode("utf-8")


def _analysis_sheet(report: SivigilaResult) -> bytes:
    rows: list[str] = []
    last = _col(
        max(len(report.eda.columnas), len(report.ira.columnas)) + 2
    )  # etiqueta + grupos + total
    rows.append(
        f'<row r="6" ht="24" customHeight="1">{_text_cell("B6", report.titulo, TITLE)}</row>'
    )
    rows.append(
        f'<row r="7" ht="20" customHeight="1">{_text_cell("B7", report.subtitulo, SUBTITLE)}</row>'
    )

    def table(first_row: int, data: AnalysisTable, total_rows: set[int]) -> int:
        header = [_text_cell(f"B{first_row}", data.titulo, HEADER)]
        header += [
            _text_cell(f"{_col(i + 2)}{first_row}", name, HEADER)
            for i, name in enumerate(data.columnas)
        ]
        header.append(_text_cell(f"{_col(len(data.columnas) + 2)}{first_row}", "Total", HEADER))
        rows.append(f'<row r="{first_row}" ht="30" customHeight="1">{"".join(header)}</row>')
        for offset, row in enumerate(data.filas, start=1):
            number = first_row + offset
            emphasised = offset - 1 in total_rows
            cells = [_text_cell(f"B{number}", row.etiqueta, TOTAL_LABEL if emphasised else LABEL)]
            for i, value in enumerate(row.valores):
                cells.append(
                    _number_cell(
                        f"{_col(i + 2)}{number}", value, TOTAL_NUMBER if emphasised else NUMBER
                    )
                )
            cells.append(
                _number_cell(f"{_col(len(data.columnas) + 2)}{number}", row.total, TOTAL_NUMBER)
            )
            rows.append(f'<row r="{number}" ht="22" customHeight="1">{"".join(cells)}</row>')
        return first_row + len(data.filas)

    end_ira = table(9, report.ira, set())
    table(end_ira + 2, report.eda, {len(report.eda.filas) - 1})
    widths = [3.0, 44.0, *([11.0] * (len(report.eda.columnas) + 1))]
    merges = f'<mergeCells count="2"><mergeCell ref="B6:{last}6"/><mergeCell ref="B7:{last}7"/></mergeCells>'
    page = (
        '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>'
        '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1"/>'
    )
    return _sheet(
        rows,
        cols=widths,
        props='<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
        extra_view=' showGridLines="0">',
        tail=merges + page,
    )


def _serial(value: object) -> int | None:
    parsed = parse_date(value)
    return (parsed - _EPOCH).days if parsed else None


def _data_sheet(key: str, records: list[Row]) -> bytes:
    if len(records) > MAX_ROWS:
        raise ValueError("La pestaña supera el máximo de filas de una hoja de Excel.")
    label = GROUP_LABELS.get(key, "Grupo")
    titles = [label if col == "grupo" else name for col, name, _ in COLUMNS]
    head = "".join(_text_cell(f"{_col(i)}1", title, HEADER) for i, title in enumerate(titles))
    rows = [f'<row r="1" ht="30" customHeight="1">{head}</row>']
    widths = [max(len(title) + 4, 10.0) for title in titles]
    for number, record in enumerate(records, start=2):
        cells = []
        for i, (column, _, kind) in enumerate(COLUMNS):
            value = record.get(column)
            ref = f"{_col(i)}{number}"
            if kind == "date":
                serial = _serial(value)
                cells.append(
                    f'<c r="{ref}" s="{DATE}"><v>{serial}</v></c>'
                    if serial is not None
                    else f'<c r="{ref}" s="{DATE}"/>'
                )
            elif kind == "number":
                cells.append(_number_cell(ref, value, INTEGER))
            else:
                cells.append(_text_cell(ref, value, TEXT))
            if kind == "text" and value:
                widths[i] = min(max(widths[i], len(str(value)) + 2), 60.0)
        rows.append(f'<row r="{number}">{"".join(cells)}</row>')
    widths = [
        12.0 if kind == "date" else w for w, (_, _, kind) in zip(widths, COLUMNS, strict=True)
    ]
    last = f"{_col(len(COLUMNS) - 1)}{len(records) + 1}"
    pane = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    return _sheet(
        rows,
        cols=widths,
        extra_view=f">{pane}",
        tail=f'<autoFilter ref="A1:{last}"/>',
    )


def build_workbook(report: SivigilaResult) -> bytes:
    sheets = [(_analysis_sheet(report), "Análisis")]
    sheets += [(_data_sheet(key, report.pestanas[key]), name) for key, name in SHEETS[1:]]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as package:
        overrides = "".join(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        package.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            f"{overrides}</Types>",
        )
        package.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        )
        listing = "".join(
            f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>'
            for i, (_, name) in enumerate(sheets, start=1)
        )
        package.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<workbook xmlns="{_NS}" xmlns:r="{_REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>{listing}</sheets></workbook>',
        )
        links = "".join(
            f'<Relationship Id="rId{i}" Type="{_REL}/worksheet" Target="worksheets/sheet{i}.xml"/>'
            for i in range(1, len(sheets) + 1)
        )
        package.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{links}<Relationship Id="rId{len(sheets) + 1}" Type="{_REL}/styles" Target="styles.xml"/></Relationships>',
        )
        package.writestr("xl/styles.xml", _STYLES)
        for i, (xml, _) in enumerate(sheets, start=1):
            package.writestr(f"xl/worksheets/sheet{i}.xml", xml)
    return buffer.getvalue()
