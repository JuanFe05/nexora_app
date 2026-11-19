// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob } from "@/lib/table-export";
import { triageExportColumns, defaultVisibleColumns } from "../columns";
import TriagePage from "./triage-page";
vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.endsWith("product-lines")) throw new Error("must not fetch this catalog");
    return [{ id: 11, nombre: "Opción ficticia A" }, { id: 22, nombre: "Opción ficticia B" }];
  });
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [{ sede: "Sede ficticia", nmro_idntfccn: "00123", fcha_ingrso: "02/01/2026 10:11:12" }], headers: new Headers({ "X-Total-Count": "101" }) });
});
function dates(start = "2026-01-01", end = "2026-01-31") {
  for (const [label, iso] of [[/Fecha inicial/, start], [/Fecha final/, end]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(iso, true, "Y-m-d"));
  }
}
const consult = () => screen.getByRole("button", { name: "Consultar" });
const ready = () => waitFor(() => expect(consult()).toBeEnabled());
function params() { return new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.calls.at(-1)![0].split("?")[1]); }
it("validates dates without querying and omits the product-line filter and catalog", async () => {
  render(<TriagePage />);
  await ready();
  expect(screen.getByRole("heading", { name: "Triaje" })).toBeVisible();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
  expect(screen.queryByText("Línea de Producto")).not.toBeInTheDocument();
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ }).map((element) => element.getAttribute("aria-label"))).toEqual(["Sede: 0 seleccionadas", "Empresa: 0 seleccionadas"]);
  expect(vi.mocked(httpClient.get).mock.calls.map(([url]) => url)).toEqual(["/statistics/reports/triage/filters/sites", "/statistics/reports/triage/filters/companies"]);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2026-02-01", "2026-01-31");
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
});
it("applies only sites and companies, paginates the applied period and clears", async () => {
  const user = userEvent.setup();
  render(<TriagePage />);
  await ready();
  dates();
  for (const label of [/Sede: 0/, /Empresa: 0/]) {
    await user.click(screen.getByRole("combobox", { name: label }));
    await user.click(await screen.findByRole("option", { name: "Opción ficticia A" }));
    await user.keyboard("{Escape}");
  }
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
  await user.click(consult());
  expect(await screen.findByText("00123")).toBeVisible();
  expect(screen.getByText("02/01/2026 10:11:12")).toBeVisible();
  expect(params().getAll("sedes")).toEqual(["11"]);
  expect(params().getAll("empresas")).toEqual(["11"]);
  expect(params().has("lineas")).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 a 10 de 101 registros");
  dates("2026-01-20");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => expect(params().get("offset")).toBe("10"));
  expect(params().get("fecha_inicial")).toBe("2026-01-01");
  for (const size of [25, 50, 100]) {
    fireEvent.change(screen.getByRole("combobox", { name: "Registros por página" }), { target: { value: String(size) } });
    await waitFor(() => expect(params().get("limit")).toBe(String(size)));
    expect(params().get("offset")).toBe("0");
  }
  await user.click(screen.getByRole("button", { name: /Columnas visibles/ }));
  await user.click(screen.getByRole("checkbox", { name: "Empresa" }));
  expect(screen.queryByRole("columnheader", { name: "Empresa" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.getByLabelText(/Fecha inicial/)).toHaveValue("");
  expect(screen.getByLabelText(/Fecha final/)).toHaveValue("");
  expect(screen.getByRole("button", { name: "Limpiar" })).toBeDisabled();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
}, 15000);
it("still requires the site catalog and retries it", async () => {
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.endsWith("sites")) throw new Error("private detail");
    return [];
  });
  render(<TriagePage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Error al cargar opciones");
  expect(consult()).toBeDisabled();
  vi.mocked(httpClient.get).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar Sede" }));
  await ready();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it.each([502, 503, 422, 500])("shows safe %s errors, retries and shows an empty result", async (status) => {
  vi.mocked(httpClient.getWithMeta).mockRejectedValueOnce(new ApiError(status, "private detail", null)).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "0" }) });
  render(<TriagePage />);
  await ready();
  dates();
  fireEvent.click(consult());
  expect(await screen.findByRole("alert")).toHaveTextContent(status === 502 || status === 503 ? "No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo." : status === 422 ? "Revisa el período seleccionado. La fecha inicial no puede ser posterior a la fecha final." : "No se pudo consultar el informe. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("No hay triajes para este período.")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 0 a 0 de 0 registros");
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2);
});
it("exports applied filters and visible/all columns to CSV/XLSX without lineas", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  render(<TriagePage />);
  await ready();
  dates();
  await user.click(screen.getByRole("combobox", { name: /Sede: 0/ }));
  await user.click(await screen.findByRole("option", { name: "Opción ficticia A" }));
  await user.keyboard("{Escape}");
  await user.click(consult());
  await waitFor(() => expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Quitar Opción ficticia A" }));
  dates("2026-01-20");
  for (const [scope, format, label] of [[/Columnas visibles/, "csv", "CSV"], [/Todas las columnas/, "xlsx", "Excel (.xlsx)"]] as const) {
    await user.click(screen.getByRole("button", { name: "Exportar" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: scope }));
    fireEvent.click(await screen.findByRole("menuitem", { name: label }));
    await waitFor(() => expect(downloadBlob).toHaveBeenLastCalledWith(file, `triaje_2026-01-01_2026-01-31.${format}`));
    const [url, options] = vi.mocked(httpClient.getBlob).mock.calls.at(-1)!;
    expect(url.split("?")[0]).toBe("/statistics/reports/triage/export");
    const query = new URLSearchParams(url.split("?")[1]);
    expect(query.getAll("sedes")).toEqual(["11"]);
    expect(query.getAll("formato")).toEqual([format]);
    expect(query.getAll("columnas")).toEqual(triageExportColumns.filter((column) => format === "xlsx" || defaultVisibleColumns.includes(column.id as typeof defaultVisibleColumns[number])).map((column) => `${column.id}:${column.type}`));
    expect(query.get("fecha_inicial")).toBe("2026-01-01");
    expect(query.get("fecha_final")).toBe("2026-01-31");
    for (const key of ["lineas", "limit", "offset", "empresas"]) expect(query.has(key)).toBe(false);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(httpClient.getBlob).toHaveBeenCalledTimes(2);
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(1);
}, 15000);
