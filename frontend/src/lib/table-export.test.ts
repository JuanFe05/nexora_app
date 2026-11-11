import { expect, it } from "vitest";
import { buildCsv, buildXlsx, type ExportColumn } from "./table-export";

const columns: ExportColumn[] = [
  { id: "name", type: "text" },
  { id: "day", type: "date" },
  { id: "amount", type: "number" },
];

it("builds a BOM-prefixed, semicolon-separated CSV with escaped, formatted and neutralized cells", () => {
  const csv = buildCsv(columns, [
    { name: 'Ana "la" mayor; Sur', day: "2026-01-02 10:00:00", amount: 1200.5 },
    { name: "=HYPERLINK(1)", day: null, amount: "-3" },
    { name: "Línea\nnueva", day: "sin fecha", amount: "n/a" },
  ]);
  expect(csv.startsWith("\uFEFF")).toBe(true);
  expect(csv.split("\r\n")).toEqual([
    "\uFEFFname;day;amount",
    '"Ana ""la"" mayor; Sur";02/01/2026;1200.5',
    "'=HYPERLINK(1);;-3",
    '"Línea\nnueva";sin fecha;n/a',
    "",
  ]);
});

it("builds a valid xlsx file", async () => {
  const blob = await buildXlsx(columns, [
    { name: "Ana", day: "2026-01-02", amount: 10 },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
});
