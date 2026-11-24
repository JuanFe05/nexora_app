// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob } from "@/lib/table-export";
import { generalConsumptionApi } from "../api/general-consumption-api";
import { generalConsumptionColumns } from "../columns";
import type { GeneralConsumptionReport, GeneralConsumptionRow } from "../types";
import GeneralConsumptionPage from "./general-consumption-page";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
vi.mock("../api/general-consumption-api", async (original) => ({ generalConsumptionApi: { ...(await original<typeof import("../api/general-consumption-api")>()).generalConsumptionApi, uploadSerLaboral: vi.fn() } }));
afterEach(cleanup);
const path = "/statistics/administrative/general-consumption";
let report: GeneralConsumptionReport;
beforeEach(() => {
  vi.resetAllMocks();
  const row = Object.fromEntries(generalConsumptionColumns.map(({ id }) => [id, ""])) as GeneralConsumptionRow;
  Object.assign(row, { sede: "Sede de prueba", cnsctvo_dcto: "000123", fcha_dcto: "2026-01-02", total_cntdd1: 1234567 });
  const labels = ["Total Venta Particular", "Total Copagos", "Total Cuotas Moderadoras", "Total Copagos Contributivo (SOS PGP)", "Total Cuotas Moderadoras Contributivo (SOS PGP)", "Total Copagos Subsidiado (SOS PGP)", "Total Cuotas Moderadoras Subsidiado (SOS PGP)"];
  report = {
    indicadores: labels.map((etiqueta, index) => ({ clave: `indicador_${index}`, etiqueta, valor: index === 0 ? 1234567 : index === 1 ? 20100.5 : 0 })),
    facturas: Array.from({ length: 11 }, (_, index) => ({ ...row, nombre_completo: `Factura prueba ${index + 1}` })),
    admisiones: [{ ...row, nombre_completo: "Admisión prueba" }], advertencias: [], total_facturas: 11, total_admisiones: 1,
  };
  vi.mocked(httpClient.get).mockImplementation(async (url) => url.startsWith(`${path}?`) ? report : [{ id: 7, nombre: "Catálogo de prueba" }]);
});
function dates(start = "2026-01-01", end = "2026-01-31") {
  for (const [label, iso] of [[/Fecha inicial/, start], [/Fecha final/, end]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(iso, true, "Y-m-d"));
  }
}
const serResult = () => ({ ser_laboral_id: "opaque-test-token", filas: Array.from({ length: 11 }, (_, index) => ({ ...report.facturas[0], nombre_completo: `Ser Laboral prueba ${index + 1}` })), total: 11, omitidas: 3, advertencias: ["Advertencia CSV"] });
const csv = () => new File(["estado\nCERRADO"], "ser-laboral.csv", { type: "text/csv" });
async function upload() {
  fireEvent.change(screen.getByLabelText("Archivo CSV Ser Laboral"), { target: { files: [csv()] } });
  await screen.findByText("Ser Laboral prueba 1");
}
const reportCalls = () => vi.mocked(httpClient.get).mock.calls.filter(([url]) => url.startsWith(`${path}?`));
async function queryReport() {
  render(<GeneralConsumptionPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  dates();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByRole("table", { name: "Indicadores de consumo general" });
}

it("renders the combined export bar only for a successfully loaded report", async () => {
  render(<GeneralConsumptionPage />);
  function expectHidden() {
    expect(screen.queryByRole("button", { name: "Exportar datos unidos", hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Exportación de datos unidos", hidden: true })).not.toBeInTheDocument();
  }
  expectHidden();
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  let resolve!: (value: GeneralConsumptionReport) => void;
  let reject!: (error: Error) => void;
  vi.mocked(httpClient.get).mockImplementation(() => new Promise((done, fail) => { resolve = done as typeof resolve; reject = fail; }));
  dates(); fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expectHidden();
  await act(async () => resolve(report));
  expect(within(screen.getByRole("region", { name: "Exportación de datos unidos" })).getByRole("button", { name: "Exportar datos unidos" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expectHidden();
  await act(async () => reject(new ApiError(502, "private detail", null)));
  await screen.findByRole("alert");
  expectHidden();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expectHidden();
  await act(async () => resolve(report));
  expect(screen.getByRole("button", { name: "Exportar datos unidos" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expectHidden();
});

it("validates five filters and waits for Consultar before making one report request", async () => {
  render(<GeneralConsumptionPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ }).map((element) => element.getAttribute("aria-label"))).toEqual(["Sede: 0 seleccionadas", "Empresa: 0 seleccionadas", "Línea de Producto: 0 seleccionadas"]);
  expect(reportCalls()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2026-02-01");
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(reportCalls()).toHaveLength(0);
  dates();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByRole("tab", { name: "Análisis" });
  expect(reportCalls()).toHaveLength(1);
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
});

it("renders four Line tabs and all seven indicators in es-CO COP", async () => {
  await queryReport();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["Análisis", "Facturas Detalladas", "Admisiones", "Ser Laboral"]);
  expect(screen.getByRole("tablist")).toHaveAttribute("data-slot", "tabs-list");
  const table = within(screen.getByRole("table", { name: "Indicadores de consumo general" }));
  expect(table.getAllByRole("rowheader")).toHaveLength(7);
  const formatter = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" });
  for (const indicator of report.indicadores) {
    const row = table.getByRole("rowheader", { name: indicator.etiqueta }).closest("tr")!;
    expect(within(row).getByRole("cell").textContent).toBe(formatter.format(indicator.valor));
  }
});

it("paginates both data tabs locally and reuses the 40 unified billing columns and cell renderers", async () => {
  const user = userEvent.setup();
  await queryReport();
  await user.click(screen.getByRole("tab", { name: /^Facturas Detalladas/ }));
  expect(await screen.findByText("Factura prueba 1")).toBeVisible();
  expect(screen.queryByText("Factura prueba 11")).not.toBeInTheDocument();
  expect(screen.getAllByText("000123")[0]).toBeVisible();
  expect(screen.getAllByText("02/01/2026").length).toBeGreaterThan(0);
  expect(screen.getAllByText("1.234.567").length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
  expect(await screen.findByText("Factura prueba 11")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(40);
  await user.click(screen.getByRole("checkbox", { name: "Sede" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("columnheader", { name: "Sede" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: /^Admisiones/ }));
  expect(await screen.findByText("Admisión prueba")).toBeVisible();
  expect(reportCalls()).toHaveLength(1);
});

it.each(["pdf", "xlsx"] as const)("exports analysis %s by POST with indicators only, never detail rows", async (format) => {
  const user = userEvent.setup();
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.post).mockResolvedValue(file);
  await queryReport();
  await user.click(screen.getByRole("button", { name: format === "pdf" ? "Exportar PDF" : "Exportar Excel" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, `consumo-general-analisis.${format}`));
  expect(httpClient.post).toHaveBeenCalledExactlyOnceWith(`${path}/export/analysis/${format}`, { body: { indicadores: report.indicadores }, responseType: "blob", signal: expect.any(AbortSignal) });
  expect(httpClient.getBlob).not.toHaveBeenCalled();
  expect(reportCalls()).toHaveLength(1);
});

it.each([["csv", "CSV"], ["xlsx", "Excel (.xlsx)"]] as const)("exports combined data through a single %s GET download using applied filters", async (format, label) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  await queryReport();
  dates("2026-01-10", "2026-01-20");
  await user.click(screen.getByRole("tab", { name: /^Admisiones/ }));
  expect(await screen.findByText("Admisión prueba")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "Exportar datos unidos" })).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Exportar datos unidos" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Todas las columnas/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, `consumo-general_2026-01-01_2026-01-31.${format}`));
  expect(httpClient.getBlob).toHaveBeenCalledTimes(1);
  const [url] = vi.mocked(httpClient.getBlob).mock.calls[0];
  expect(url.split("?")[0]).toBe(`${path}/export`);
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.get("formato")).toBe(format);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
  expect(params.getAll("columnas")).toHaveLength(40);
  expect(params.has("limit")).toBe(false);
  expect(params.has("offset")).toBe(false);
  expect(params.has("tablas")).toBe(false);
  expect(httpClient.post).not.toHaveBeenCalled();
  expect(reportCalls()).toHaveLength(1);
});

it("shows warnings and empty datasets without another query", async () => {
  report.facturas = []; report.admisiones = []; report.total_facturas = 0; report.total_admisiones = 0;
  report.advertencias = ["Advertencia de prueba"];
  const user = userEvent.setup();
  await queryReport();
  expect(screen.getByText("Advertencia de prueba")).toBeVisible();
  expect(screen.getByRole("button", { name: "Exportar datos unidos" })).toBeEnabled();
  await user.click(screen.getByRole("tab", { name: /^Facturas Detalladas/ }));
  expect(await screen.findByText("No hay facturas detalladas para este período.")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: /^Admisiones/ }));
  expect(await screen.findByText("No hay admisiones para este período.")).toBeVisible();
  expect(reportCalls()).toHaveLength(1);
});

it("reports a safe error, retries, and clears results", async () => {
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.startsWith(`${path}?`)) throw new ApiError(502, "private detail", null);
    return [];
  });
  render(<GeneralConsumptionPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  dates(); fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cargar CSV Ser Laboral" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Exportar datos unidos" })).not.toBeInTheDocument();
  vi.mocked(httpClient.get).mockResolvedValue(report);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("table", { name: "Indicadores de consumo general" });
  expect(reportCalls()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
});

it("gates upload on successful consultation and places it immediately before Consultar", async () => {
  render(<GeneralConsumptionPage />);
  const load = screen.getByRole("button", { name: "Cargar CSV Ser Laboral" });
  expect(load).toBeDisabled();
  expect(load.nextElementSibling).toHaveTextContent("Consultar");
  expect(screen.queryByRole("button", { name: "Exportar datos unidos" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Archivo CSV Ser Laboral")).toHaveAttribute("accept", ".csv");
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  let resolve!: (value: GeneralConsumptionReport) => void;
  vi.mocked(httpClient.get).mockImplementation(() => new Promise((done) => { resolve = done as typeof resolve; }));
  dates(); fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(load).toBeDisabled();
  await act(async () => resolve(report));
  await waitFor(() => expect(load).toBeEnabled());
  expect(screen.getByRole("button", { name: "Exportar datos unidos" })).toBeEnabled();
});

it("renders the empty Ser Laboral tab, uploads with loading state, totals, warnings and local pagination, then resets on reconsult", async () => {
  const user = userEvent.setup();
  await queryReport();
  await user.click(screen.getByRole("tab", { name: /^Ser Laboral/ }));
  expect(await screen.findByText("Carga un CSV Ser Laboral para ver los registros.")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Análisis" }));
  let resolve!: (value: ReturnType<typeof serResult>) => void;
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockImplementation(() => new Promise((done) => { resolve = done; }));
  fireEvent.change(screen.getByLabelText("Archivo CSV Ser Laboral"), { target: { files: [csv()] } });
  expect(screen.getByRole("button", { name: "Cargando CSV…" })).toBeDisabled();
  await act(async () => resolve(serResult()));
  expect(await screen.findByText("Ser Laboral prueba 1")).toBeVisible();
  expect(screen.getByRole("tab", { name: /^Ser Laboral/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Total: 11 · Omitidas: 3")).toBeVisible();
  expect(screen.getByText("Advertencia CSV")).toBeVisible();
  await user.click(screen.getByRole("button", { name: /siguiente/i }));
  expect(await screen.findByText("Ser Laboral prueba 11")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(40);
  await user.keyboard("{Escape}");
  dates("2026-01-10", "2026-01-20");
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByRole("table", { name: "Indicadores de consumo general" });
  await user.click(screen.getByRole("tab", { name: /^Ser Laboral/ }));
  expect(await screen.findByText("Carga un CSV Ser Laboral para ver los registros.")).toBeVisible();
  expect(screen.queryByText("Advertencia CSV")).not.toBeInTheDocument();
  vi.mocked(httpClient.getBlob).mockResolvedValue(new Blob(["synthetic"]));
  await user.click(screen.getByRole("button", { name: "Exportar datos unidos" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Todas las columnas/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "CSV" }));
  await waitFor(() => expect(httpClient.getBlob).toHaveBeenCalledTimes(1));
  expect(new URLSearchParams(vi.mocked(httpClient.getBlob).mock.calls[0][0].split("?")[1]).has("ser_laboral_id")).toBe(false);
});

it.each([422, 413])("shows upload %s detail without changing the loaded data", async (status) => {
  await queryReport();
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockResolvedValue(serResult());
  await upload();
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockRejectedValue(new ApiError(status, "Detalle CSV de prueba", null));
  fireEvent.change(screen.getByLabelText("Archivo CSV Ser Laboral"), { target: { files: [csv()] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Detalle CSV de prueba");
  expect(screen.getByText("Ser Laboral prueba 1")).toBeVisible();
  expect(screen.getByText("Total: 11 · Omitidas: 3")).toBeVisible();
  expect(screen.getByRole("button", { name: "Cargar CSV Ser Laboral" })).toBeEnabled();
});

it("exports from the action bar with the uploaded token, clears it on 410 and exports again without it", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await queryReport();
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockResolvedValue(serResult());
  await upload();
  const bar = screen.getByRole("region", { name: "Exportación de datos unidos" });
  expect(bar.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(bar).toHaveTextContent("Facturas Detalladas + Admisiones + Ser Laboral");
  vi.mocked(httpClient.getBlob).mockRejectedValueOnce(new ApiError(410, "El archivo de Ser Laboral expiró; cárgalo de nuevo.", null)).mockResolvedValue(new Blob(["synthetic"]));
  async function exportCsv() {
    await user.click(screen.getByRole("button", { name: "Exportar datos unidos" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Todas las columnas/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "CSV" }));
  }
  await exportCsv();
  expect(await screen.findByRole("alert")).toHaveTextContent("El archivo de Ser Laboral expiró; cárgalo de nuevo.");
  expect(new URLSearchParams(vi.mocked(httpClient.getBlob).mock.calls[0][0].split("?")[1]).get("ser_laboral_id")).toBe("opaque-test-token");
  expect(screen.queryByText("Ser Laboral prueba 1")).not.toBeInTheDocument();
  expect(bar).not.toHaveTextContent("+ Ser Laboral");
  await exportCsv();
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
  expect(new URLSearchParams(vi.mocked(httpClient.getBlob).mock.calls[1][0].split("?")[1]).has("ser_laboral_id")).toBe(false);
});

const tableExports = [
  { tab: /^Facturas Detalladas/, label: "Exportar", table: "facturas", filename: "facturas-detalladas" },
  { tab: /^Admisiones/, label: "Exportar", table: "admisiones", filename: "admisiones" },
  { tab: /^Ser Laboral/, label: "Exportar", table: "ser_laboral", filename: "ser-laboral" },
] as const;

it.each(tableExports)("exports $table individually with visible/all columns and applied filters", async ({ tab, label, table, filename }) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockResolvedValue(serResult());
  await queryReport();
  await upload();
  dates("2026-01-10", "2026-01-20");
  await user.click(screen.getByRole("tab", { name: tab }));
  const button = await screen.findByRole("button", { name: label });
  expect(button).toBeEnabled();
  expect(screen.getByRole("button", { name: "Columnas visibles" }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
  await user.click(screen.getByRole("checkbox", { name: "Sede" }));
  await user.keyboard("{Escape}");
  const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
  for (const [scope, format, formatLabel] of [[/Columnas visibles/, "csv", "CSV"], [/Todas las columnas/, "xlsx", "Excel (.xlsx)"]] as const) {
    await user.click(button);
    fireEvent.click(await screen.findByRole("menuitem", { name: scope }));
    fireEvent.click(await screen.findByRole("menuitem", { name: formatLabel }));
    await waitFor(() => expect(downloadBlob).toHaveBeenLastCalledWith(file, `consumo-general-${filename}_2026-01-01_2026-01-31.${format}`));
    const [url, options] = vi.mocked(httpClient.getBlob).mock.lastCall!;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(url.split("?")[0]).toBe(`${path}/export`);
    expect(params.getAll("tablas")).toEqual([table]);
    expect(params.get("ser_laboral_id")).toBe(table === "ser_laboral" ? "opaque-test-token" : null);
    expect(params.get("fecha_inicial")).toBe("2026-01-01");
    expect(params.get("fecha_final")).toBe("2026-01-31");
    expect(params.get("formato")).toBe(format);
    const expectedColumns = generalConsumptionColumns.filter((column) => format === "xlsx" || headers.includes(column.header as string));
    expect(params.getAll("columnas").map((column) => column.split(":")[0])).toEqual(expectedColumns.map(({ id }) => id));
    expect(options).toEqual({ signal: expect.any(AbortSignal) });
  }
  expect(httpClient.getBlob).toHaveBeenCalledTimes(2);
  expect(reportCalls()).toHaveLength(1);
});

it("disables individual exports for empty tables and before a CSV is loaded", async () => {
  report.facturas = []; report.admisiones = []; report.total_facturas = 0; report.total_admisiones = 0;
  const user = userEvent.setup();
  await queryReport();
  for (const { tab, label } of tableExports.slice(0, 2)) {
    await user.click(screen.getByRole("tab", { name: tab }));
    expect(await screen.findByRole("button", { name: label })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: label }));
  }
  await user.click(screen.getByRole("tab", { name: /^Ser Laboral/ }));
  expect(screen.queryByRole("button", { name: "Exportar" })).not.toBeInTheDocument();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockResolvedValue({ ...serResult(), filas: [], total: 0 });
  fireEvent.change(screen.getByLabelText("Archivo CSV Ser Laboral"), { target: { files: [csv()] } });
  await screen.findByText("Total: 0 · Omitidas: 3");
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
});

it("prevents individual downloads during upload and consultation", async () => {
  const user = userEvent.setup();
  await queryReport();
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockResolvedValue(serResult());
  await upload();
  let resolve!: (value: ReturnType<typeof serResult>) => void;
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockImplementation(() => new Promise((done) => { resolve = done; }));
  fireEvent.change(screen.getByLabelText("Archivo CSV Ser Laboral"), { target: { files: [csv()] } });
  for (const { tab, label } of tableExports) {
    await user.click(screen.getByRole("tab", { name: tab }));
    const button = screen.queryByRole("button", { name: label });
    if (button) { expect(button).toBeDisabled(); fireEvent.click(button); }
  }
  expect(httpClient.getBlob).not.toHaveBeenCalled();
  await act(async () => resolve(serResult()));
  expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled();
  let resolveReport!: (value: GeneralConsumptionReport) => void;
  vi.mocked(httpClient.get).mockImplementation(() => new Promise((done) => { resolveReport = done as typeof resolveReport; }));
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.queryByRole("button", { name: "Exportar datos unidos" })).not.toBeInTheDocument();
  for (const { label } of tableExports) expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
  await act(async () => resolveReport(report));
  await user.click(screen.getByRole("tab", { name: /^Ser Laboral/ }));
  expect(screen.queryByRole("button", { name: "Exportar" })).not.toBeInTheDocument();
});

it("clears an expired individual Ser Laboral export and requires reloading the CSV", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await queryReport();
  vi.mocked(generalConsumptionApi.uploadSerLaboral).mockResolvedValue(serResult());
  await upload();
  vi.mocked(httpClient.getBlob).mockRejectedValueOnce(new ApiError(410, "private detail", null));
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Todas las columnas/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "CSV" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("El archivo de Ser Laboral expiró; cárgalo de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  const params = new URLSearchParams(vi.mocked(httpClient.getBlob).mock.calls[0][0].split("?")[1]);
  expect(params.getAll("tablas")).toEqual(["ser_laboral"]);
  expect(params.get("ser_laboral_id")).toBe("opaque-test-token");
  expect(screen.queryByText("Ser Laboral prueba 1")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Exportar" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Exportación de datos unidos" })).not.toHaveTextContent("+ Ser Laboral");
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(reportCalls()).toHaveLength(1);
  await upload();
  expect(screen.getByRole("button", { name: "Exportar" })).toBeEnabled();
});

it("shows safe analysis export failures and re-enables buttons", async () => {
  const user = userEvent.setup();
  vi.mocked(httpClient.post).mockRejectedValue(new Error("private detail"));
  await queryReport();
  await user.click(screen.getByRole("button", { name: "Exportar PDF" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo exportar la información. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeEnabled();
  expect(downloadBlob).not.toHaveBeenCalled();
});
