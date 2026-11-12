// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { downloadBlob } from "@/lib/table-export";
import DetailedInvoicesPage from "../detailed-invoices/pages/detailed-invoices-page";
import VitalSignsPage from "../vital-signs/pages/vital-signs-page";
import { invoiceExportColumns, defaultVisibleColumns as invoiceDefaults } from "../detailed-invoices/columns";
import { vitalSignsExportColumns, defaultVisibleColumns as vitalDefaults } from "../vital-signs/columns";
vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 11, nombre: "Línea A" }, { id: 22, nombre: "Línea B" }]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "123" }) });
});
it.each([
  { Page: DetailedInvoicesPage, prefix: "detailed-invoices", filename: "facturas-detalladas", columns: invoiceExportColumns, defaults: invoiceDefaults },
  { Page: VitalSignsPage, prefix: "vital-signs", filename: "signos-vitales", columns: vitalSignsExportColumns, defaults: vitalDefaults },
])("$prefix exports applied filters and columns in one blob per operation", async ({ Page, prefix, filename, columns, defaults }) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  const view = render(<Page />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  for (const [label, iso] of [[/Fecha inicial/, "2026-01-01"], [/Fecha final/, "2026-01-31"]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(iso, true, "Y-m-d"));
  }
  act(() => screen.getByRole("combobox", { name: /Línea de Producto/ }).focus());
  await user.keyboard("{ArrowDown}");
  await user.click(await screen.findByRole("option", { name: "Línea A" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled());
  // A later draft selection must not change export filters.
  await user.click(screen.getByRole("button", { name: "Quitar Línea A" }));
  for (const [scope, format, label] of [[/Columnas visibles/, "csv", "CSV"], [/Todas las columnas/, "xlsx", "Excel (.xlsx)"]] as const) {
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: scope }));
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));
    await waitFor(() => expect(downloadBlob).toHaveBeenLastCalledWith(file, `${filename}_2026-01-01_2026-01-31.${format}`));
    const [url, options] = vi.mocked(httpClient.getBlob).mock.calls.at(-1)!;
    expect(url.split("?")[0]).toBe(`/statistics/reports/${prefix}/export`);
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.getAll("lineas")).toEqual(["11"]);
    expect(params.getAll("formato")).toEqual([format]);
    expect(params.getAll("columnas")).toEqual(columns.filter((column) => format === "xlsx" || (defaults as readonly string[]).includes(column.id)).map((column) => `${column.id}:${column.type}`));
    expect(params.get("fecha_inicial")).toBe("2026-01-01");
    expect(params.get("fecha_final")).toBe("2026-01-31");
    expect(params.has("limit")).toBe(false);
    expect(params.has("offset")).toBe(false);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(httpClient.getBlob).toHaveBeenCalledTimes(2);
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  view.unmount();
}, 15000);
