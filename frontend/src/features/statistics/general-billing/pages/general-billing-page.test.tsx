// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob } from "@/lib/table-export";
import { defaultVisibleColumns, generalBillingColumns, generalBillingExportColumns } from "../columns";
import GeneralBillingPage from "./general-billing-page";
vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 11, nombre: "Opción A" }, { id: 22, nombre: "Opción B" }]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [{ sede: "Sede ficticia", cnsctvo_dcto: "000123", fcha_dcto: "2026-01-02", vlr_srvcs: 1234567 }], headers: new Headers({ "X-Total-Count": "101" }) });
  vi.mocked(httpClient.getBlob).mockResolvedValue(new Blob(["synthetic"]));
});
function dates(start = "2026-01-01", end = "2026-01-31") {
  for (const [label, iso] of [[/Fecha inicial/, start], [/Fecha final/, end]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(iso, true, "Y-m-d"));
  }
}
const consult = () => screen.getByRole("button", { name: "Consultar" });
const ready = () => waitFor(() => expect(consult()).toBeEnabled());
it("waits for Consultar, validates required dates and preserves filter order", async () => {
  render(<GeneralBillingPage />);
  await ready();
  expect(screen.getByRole("heading", { name: "Facturación General" })).toBeVisible();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ }).map((element) => element.getAttribute("aria-label"))).toEqual(["Sede: 0 seleccionadas", "Empresa: 0 seleccionadas", "Línea de Producto: 0 seleccionadas"]);
  const initial = screen.getByLabelText(/Fecha inicial/);
  expect(initial.id).toContain("general-billing");
  expect(initial.compareDocumentPosition(screen.getByLabelText(/Fecha final/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2026-02-01", "2026-01-31");
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
});
it("shows compact headers, makes all 44 columns selectable and paginates only applied dates", async () => {
  const user = userEvent.setup();
  render(<GeneralBillingPage />);
  await ready();
  dates();
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
  await user.click(consult());
  expect(await screen.findByText("000123")).toBeVisible();
  expect(screen.getByText("02/01/2026")).toBeVisible();
  expect(screen.getByText("1.234.567")).toBeVisible();
  expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(generalBillingColumns.filter(({ id }) => defaultVisibleColumns.includes(id)).map(({ label }) => label));
  await user.click(screen.getByRole("button", { name: /Columnas visibles/ }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(44);
  await user.click(screen.getByRole("checkbox", { name: "Nombre Mes" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("columnheader", { name: "Nombre Mes" })).toBeInTheDocument();
  dates("2026-01-20");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => {
    const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.calls.at(-1)![0].split("?")[1]);
    expect(params.get("offset")).toBe("10");
    expect(params.get("fecha_inicial")).toBe("2026-01-01");
  });
  await user.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
});
it.each(["csv", "xlsx"] as const)("exports %s with applied filters and chosen visible or all columns", async (format) => {
  const user = userEvent.setup();
  render(<GeneralBillingPage />);
  await ready();
  dates();
  for (const label of ["Sede", "Empresa", "Línea de Producto"]) {
    await user.click(screen.getByRole("combobox", { name: new RegExp(`${label}:`) }));
    await user.click(await screen.findByRole("option", { name: "Opción A" }));
    await user.keyboard("{Escape}");
  }
  await user.click(consult());
  expect(await screen.findByText("000123")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Columnas visibles/ }));
  await user.click(screen.getByRole("checkbox", { name: "Empresa" }));
  await user.keyboard("{Escape}");
  dates("2026-01-20");
  for (const all of [false, true]) {
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    // Igual que en las pruebas de menús compartidos: jsdom no modela la transición de puntero de Base UI.
    fireEvent.click(await screen.findByRole("menuitem", { name: all ? "Todas las columnas (44)" : "Columnas visibles (14)" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: format === "csv" ? "CSV" : "Excel (.xlsx)" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(all ? 2 : 1));
    const [url, options] = vi.mocked(httpClient.getBlob).mock.calls.at(-1)!;
    expect(url.split("?")[0]).toBe("/statistics/administrative/general-billing/export");
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("formato")).toBe(format);
    expect(params.get("fecha_inicial")).toBe("2026-01-01");
    expect(params.get("fecha_final")).toBe("2026-01-31");
    for (const key of ["sedes", "empresas", "lineas"]) expect(params.getAll(key)).toEqual(["11"]);
    expect(params.getAll("columnas")).toEqual(generalBillingExportColumns.filter(({ id }) => all || (defaultVisibleColumns.includes(id as typeof defaultVisibleColumns[number]) && id !== "emprs")).map(({ id, type }) => `${id}:${type}`));
    expect(params.has("limit")).toBe(false);
    expect(params.has("offset")).toBe(false);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), `facturacion-general_2026-01-01_2026-01-31.${format}`);
  }
}, 15000);
it("shows safe 502 errors, retries and displays the Spanish empty state", async () => {
  vi.mocked(httpClient.getWithMeta).mockRejectedValueOnce(new ApiError(502, "private detail", null)).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "0" }) });
  render(<GeneralBillingPage />);
  await ready();
  dates();
  fireEvent.click(consult());
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("No hay facturación general para este período.")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 0 a 0 de 0 registros");
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2);
});
