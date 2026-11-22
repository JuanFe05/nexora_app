"""PDF de una página con las tablas de Análisis, sin dependencias externas.

Genera un PDF real (texto y vectores, fuentes estándar Helvetica) en Carta horizontal, con el
conjunto centrado en ambos ejes, encabezados azules sobre fondo blanco y tamaños de letra y
columnas ajustados al ancho disponible. Las métricas de las fuentes son las de Helvetica.
"""

# ruff: noqa: E501 -- operaciones de dibujo y tablas de métricas en línea
import unicodedata
import zlib
from dataclasses import dataclass

from nexora.statistics.application.sivigila import AnalysisTable, SivigilaResult

PAGE_W, PAGE_H = 792.0, 612.0  # Carta horizontal, como el PDF de referencia
MARGIN = 28.0
BLUE = (0.0706, 0.247, 0.741)  # #123EBD
RGB = tuple[float, float, float]
LIGHT = (0.91, 0.933, 0.984)
WHITE = (1.0, 1.0, 1.0)
INK = (0.1, 0.1, 0.12)

_ASCII = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~"
_REGULAR = (
    "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 "
    + "556 " * 10
    + "278 278 584 584 584 556 1015 "
    + "667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 "
    "667 667 611 "
    "278 278 278 469 556 333 "
    "556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 "
    "500 500 500 "
    "334 260 334 584"
).split()
_BOLD = (
    "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 "
    + "556 " * 10
    + "333 333 584 584 584 611 975 "
    + "722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 "
    "667 667 611 "
    "333 278 333 584 556 333 "
    "556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 "
    "556 556 500 "
    "389 280 389 584"
).split()
_WIDTHS = {
    False: dict(zip(_ASCII, map(int, _REGULAR), strict=True)),
    True: dict(zip(_ASCII, map(int, _BOLD), strict=True)),
}


def text_width(text: str, size: float, bold: bool = False) -> float:
    table = _WIDTHS[bold]
    total = 0
    for char in text:
        if char not in table:
            base = unicodedata.normalize("NFKD", char)[:1]
            char = base if base in table else "n"
        total += table[char]
    return total * size / 1000


def wrap(text: str, width: float, size: float, bold: bool = False) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and text_width(candidate, size, bold) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    return [*lines, current] if current else lines or [""]


def _fits(texts: list[str], width: float, size: float, bold: bool, max_lines: int) -> bool:
    return all(
        len(lines := wrap(t, width, size, bold)) <= max_lines
        and all(text_width(line, size, bold) <= width for line in lines)
        for t in texts
    )


def _pick_size(
    texts: list[str], width: float, bold: bool, preferred: float, max_lines: int
) -> float:
    size = preferred
    while size > 5.5 and not _fits(texts, width, size, bold, max_lines):
        size -= 0.5
    return size


@dataclass(slots=True)
class _Canvas:
    ops: list[str]

    def color(self, rgb: RGB, stroke: bool = False) -> None:
        red, green, blue = rgb
        self.ops.append(f"{red:.4f} {green:.4f} {blue:.4f} {'RG' if stroke else 'rg'}")

    def rect(self, x: float, y: float, w: float, h: float, fill: RGB | None) -> None:
        if fill:
            self.color(fill)
            self.ops.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")
        self.color(BLUE, stroke=True)
        self.ops.append(f"0.5 w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S")

    def text(self, x: float, y: float, value: str, size: float, bold: bool, rgb: RGB) -> None:
        data = value.encode("cp1252", "replace").decode("latin-1")
        data = data.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        self.color(rgb)
        self.ops.append(
            f"BT /{'F2' if bold else 'F1'} {size:.2f} Tf {x:.2f} {y:.2f} Td ({data}) Tj ET"
        )

    def cell_text(
        self,
        x: float,
        y: float,
        w: float,
        h: float,
        lines: list[str],
        size: float,
        bold: bool,
        rgb: RGB,
        align: str,
    ) -> None:
        lead = size * 1.2
        top = y + h / 2 + len(lines) * lead / 2
        for index, line in enumerate(lines):
            line_w = text_width(line, size, bold)
            left = x + (w - line_w) / 2 if align == "center" else x + 4
            baseline = top - (index + 1) * lead + (lead - size) / 2 + size * 0.22
            self.text(left, baseline, line, size, bold, rgb)


@dataclass(slots=True)
class _Laid:
    width: float
    height: float
    cols: list[float]
    header_h: float
    row_h: list[float]
    header_size: float
    body_size: float
    label_lines: list[list[str]]
    header_lines: list[list[str]]


def _layout(table: AnalysisTable, label_w: float, max_width: float, preferred: float) -> _Laid:
    count = len(table.columnas) + 1
    num_w = min(40.0, (max_width - label_w) / count)
    cols = [label_w, *([num_w] * count)]
    headers = [*table.columnas, "Total"]
    header_size = _pick_size(headers, num_w - 4, True, preferred - 0.5, 3)
    header_size = min(header_size, _pick_size([table.titulo], label_w - 8, True, preferred, 2))
    body_size = _pick_size([str(f.total) for f in table.filas], num_w - 4, True, preferred, 1)
    labels = [f.etiqueta for f in table.filas]
    body_size = min(body_size, _pick_size(labels, label_w - 8, True, preferred, 2))
    header_lines = [wrap(h, num_w - 4, header_size, True) for h in headers]
    header_h = max(30.0, max(len(lines) for lines in header_lines) * header_size * 1.2 + 10)
    label_lines = [wrap(label, label_w - 8, body_size, True) for label in labels]
    row_h = [max(28.0, len(lines) * body_size * 1.2 + 10) for lines in label_lines]
    return _Laid(
        sum(cols), header_h + sum(row_h), cols, header_h, row_h, header_size, body_size,
        label_lines, header_lines,
    )  # fmt: skip


def _draw(
    canvas: _Canvas, table: AnalysisTable, laid: _Laid, x0: float, top: float, total_rows: set[int]
) -> None:
    x, y = x0, top - laid.header_h
    title_lines = wrap(table.titulo, laid.cols[0] - 8, laid.header_size, True)
    for index in range(len(laid.cols)):
        w = laid.cols[index]
        canvas.rect(x, y, w, laid.header_h, BLUE)
        lines = title_lines if index == 0 else laid.header_lines[index - 1]
        canvas.cell_text(
            x,
            y,
            w,
            laid.header_h,
            lines,
            laid.header_size,
            True,
            WHITE,
            "left" if index == 0 else "center",
        )
        x += w
    for row_index, row in enumerate(table.filas):
        y -= laid.row_h[row_index]
        emphasised = row_index in total_rows
        cells = [row.etiqueta, *map(str, row.valores), str(row.total)]
        x = x0
        for index, value in enumerate(cells):
            w = laid.cols[index]
            is_total = emphasised or index == len(cells) - 1
            canvas.rect(x, y, w, laid.row_h[row_index], LIGHT if is_total else None)
            lines = laid.label_lines[row_index] if index == 0 else [value]
            canvas.cell_text(
                x,
                y,
                w,
                laid.row_h[row_index],
                lines,
                laid.body_size,
                is_total or index == 0,
                INK,
                "left" if index == 0 else "center",
            )
            x += w


def build_analysis_pdf(report: SivigilaResult) -> bytes:
    usable = PAGE_W - 2 * MARGIN
    ira = _layout(report.ira, 182.0, min(usable, 520.0), 9.0)
    eda = _layout(report.eda, 86.0, usable, 9.0)
    title_size = min(14.0, _pick_size([report.titulo, report.subtitulo], usable, True, 14.0, 1))
    title_h = title_size * 1.25 * 2
    gap_title, gap_tables = 16.0, 22.0
    block = title_h + gap_title + ira.height + gap_tables + eda.height
    top = (PAGE_H + block) / 2  # centrado vertical
    canvas = _Canvas([])
    y = top
    for line in (report.titulo, report.subtitulo):
        y -= title_size * 1.25
        canvas.text(
            (PAGE_W - text_width(line, title_size, True)) / 2,
            y + title_size * 0.2,
            line,
            title_size,
            True,
            BLUE,
        )
    y -= gap_title
    _draw(canvas, report.ira, ira, (PAGE_W - ira.width) / 2, y, set())
    y -= ira.height + gap_tables
    _draw(canvas, report.eda, eda, (PAGE_W - eda.width) / 2, y, {len(report.eda.filas) - 1})
    return _assemble("\n".join(canvas.ops).encode("latin-1"), report.titulo)


def _assemble(content: bytes, title: str) -> bytes:
    stream = zlib.compress(content)
    safe_title = (
        title.encode("cp1252", "replace")
        .decode("latin-1")
        .replace("\\", "")
        .replace("(", "")
        .replace(")", "")
    )
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PAGE_W:g} {PAGE_H:g}] "
        "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>".encode(),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
        b"<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(stream) + stream + b"\nendstream",
        f"<< /Title ({safe_title}) /Producer (NEXORA) >>".encode("latin-1"),
    ]
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)
