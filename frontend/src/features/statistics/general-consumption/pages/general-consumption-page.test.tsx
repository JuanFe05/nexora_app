// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob } from "@/lib/table-export";
import { generalConsumptionColumns } from "../columns";
import type { GeneralConsumptionReport, GeneralConsumptionRow } from "../types";
import GeneralConsumptionPage from "./general-consumption-page";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
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
const reportCalls = () => vi.mocked(httpClient.get).mock.calls.filter(([url]) => url.startsWith(`${path}?`));
async function queryReport() {
  render(<GeneralConsumptionPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  dates();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByRole("table", { name: "Indicadores de consumo general" });
}

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

it("renders three Line tabs and all seven indicators in es-CO COP", async () => {
  await queryReport();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["Análisis", "Facturas Detalladas", "Admisiones"]);
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
  expect(screen.getAllByRole("button", { name: "Exportar" })).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Exportar" }));
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
  expect(httpClient.post).not.toHaveBeenCalled();
  expect(reportCalls()).toHaveLength(1);
});

it("shows warnings and empty datasets without another query", async () => {
  report.facturas = []; report.admisiones = []; report.total_facturas = 0; report.total_admisiones = 0;
  report.advertencias = ["Advertencia de prueba"];
  const user = userEvent.setup();
  await queryReport();
  expect(screen.getByText("Advertencia de prueba")).toBeVisible();
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
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
  vi.mocked(httpClient.get).mockResolvedValue(report);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("table", { name: "Indicadores de consumo general" });
  expect(reportCalls()).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
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
