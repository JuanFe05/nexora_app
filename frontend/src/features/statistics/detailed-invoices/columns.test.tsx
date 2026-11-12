// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  invoiceColumns,
  defaultVisibleColumns,
  formatDate,
  formatMoney,
  formatNumber,
} from "./columns";
import type { DetailedInvoice } from "./types";
afterEach(cleanup);
it("keeps every contracted key available with unique columns and 15 defaults", () => {
  // The enumerated backend contract has 71 keys, despite its '68 columns' heading.
  expect(invoiceColumns).toHaveLength(71);
  expect(new Set(invoiceColumns.map((column) => column.id)).size).toBe(71);
  expect(defaultVisibleColumns).toEqual([
    "sede",
    "emprs",
    "nmro_dcto",
    "fcha_dcto",
    "dscrp_transcn",
    "estado",
    "cc_afldo",
    "prmr_nmbre",
    "prmr_aplldo",
    "procedimiento",
    "cntdd",
    "vlr_untro",
    "vlr_factrdo",
    "estdo_pgo_pcnte",
    "frma_pgo",
  ]);
  for (const id of defaultVisibleColumns)
    expect(invoiceColumns.some((column) => column.id === id)).toBe(true);
});
it("formats calendar dates without timezone conversion and numeric strings without decimals", () => {
  expect(formatDate("2026-01-01")).toBe("01/01/2026");
  expect(formatDate("")).toBe("—");
  expect(formatMoney("1234567.8")).toBe("1.234.568");
  expect(formatMoney(0)).toBe("0");
  expect(formatMoney(null)).toBe("—");
  expect(formatNumber("1234.5")).toBe("1.234,5");
  expect(formatNumber("")).toBe("—");
});
it.each([
  "PAGADO",
  "PAGO PARCIAL",
  "PAGO PARCIAL CON DESCUENTO",
  "SIN PAGO (SOLO DESCUENTO/CREDITO)",
  "SIN FORMA DE PAGO",
])("renders %s as plain text without a badge", (status) => {
  const column = invoiceColumns.find(
    (column) => column.id === "estdo_pgo_pcnte",
  )!;
  render(<>{column.cell({ estdo_pgo_pcnte: status } as DetailedInvoice)}</>);
  expect(screen.getByText(status)).toBeVisible();
  expect(screen.getByText(status)).not.toHaveAttribute("data-variant");
  expect(screen.getByText(status).closest("[data-slot=badge]")).toBeNull();
});
it("truncates descriptions with full title, aligns numbers and leaves empty statuses blank", () => {
  const description = invoiceColumns.find(
    (column) => column.id === "procedimiento",
  )!;
  render(
    <>
      {description.cell({
        procedimiento: "Descripción extensa",
      } as DetailedInvoice)}
    </>,
  );
  expect(screen.getByTitle("Descripción extensa")).toHaveClass(
    "truncate",
    "max-w-72",
  );
  expect(
    invoiceColumns.find((column) => column.id === "vlr_factrdo")!.className,
  ).toContain("tabular-nums");
  expect(
    invoiceColumns
      .find((column) => column.id === "estdo_pgo_pcnte")!
      .cell({ estdo_pgo_pcnte: "" } as DetailedInvoice),
  ).toBeNull();
});

it("formats the SQL Server remission timestamp instead of hiding it", () => {
  expect(formatDate("2026-01-31 13:45:00")).toBe("31/01/2026");
});

it("exports with the original SQL aliases as headers, never the UI labels", async () => {
  const { invoiceExportColumns, invoiceColumns } = await import("./columns");
  expect(invoiceExportColumns.map((column) => column.id)).toEqual(
    invoiceColumns.map((column) => column.id),
  );
  expect(invoiceExportColumns.map((column) => column.id)).toContain("emprs");
  expect(invoiceExportColumns.some((column) => "label" in column)).toBe(false);
});
