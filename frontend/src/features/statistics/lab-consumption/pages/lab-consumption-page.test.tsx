// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import { downloadBlob } from "@/lib/table-export";
import { labConsumptionApi } from "../api/lab-consumption-api";
import type { LabConsumptionReport, LabConsumptionRow } from "../types";
import LabConsumptionPage from "./lab-consumption-page";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
vi.mock("../api/lab-consumption-api", async (original) => ({ labConsumptionApi: { ...(await original<typeof import("../api/lab-consumption-api")>()).labConsumptionApi, uploadSerLaboral: vi.fn(), uploadAnnarLab: vi.fn() } }));
const path = "/statistics/administrative/lab-consumption";
const row = (changes: Partial<LabConsumptionRow> = {}): LabConsumptionRow => ({ cnsctvo_dcto: "0001", cdgo_prcdmnto: "901", lna_prdcto: "LABORATORIO", procedimiento: "HEMOGRAMA", cntdd: 2, fcha_ingrso_pcnte: "2026-01-02", fcha_dcto: "2026-01-03", admision: "10", estado: "CERRADO", emprs: "EMPRESA", dscrp_transcn: "FACTURA", sede: "CENTRO", ...changes });
let report: LabConsumptionReport;
const ser = () => ({ ser_laboral_id: "ser-token", filas: [row({ cntdd: 4, procedimiento: "OTRA DESCRIPCIÓN" })], total: 1, omitidas: 2, advertencias: ["Advertencia CSV"] });
const annar = () => ({ annar_lab_id: "annar-token", filas: [{ codigo_centro_costo: "02", nombre_centro_costos: "QUÍMICA", nombre_examen: "GLUCOSA", cantidad: 1, empresa: "CLIENTE", punto_atencion: "NORTE" }], total: 1, advertencias: ["Advertencia Excel"], analisis_annar: [{ seccion: "02", descripcion: "AGRUPACIÓN ANNAR", cantidad: 7 }] });
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  report = { facturas: [row({ procedimiento: "" }), row({ cdgo_prcdmnto: "902", procedimiento: "OTRO", cntdd: 1 })], admisiones: [row({ cntdd: 3 })], total_facturas: 2, total_admisiones: 1, advertencias: [] };
  vi.mocked(httpClient.get).mockImplementation(async (url) => url.startsWith(`${path}?`) ? report : [{ id: 1, nombre: "Opción" }]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: new Blob(["export"]), headers: new Headers() });
  vi.mocked(httpClient.post).mockResolvedValue(new Blob(["analysis"]));
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockResolvedValue(ser());
  vi.mocked(labConsumptionApi.uploadAnnarLab).mockResolvedValue(annar());
});
function dates() {
  for (const [label, date] of [[/Fecha inicial/, "2026-01-01"], [/Fecha final/, "2026-01-31"]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(date, true, "Y-m-d"));
  }
}
async function query() {
  render(<LabConsumptionPage />);
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  dates(); fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeDisabled();
  await screen.findByRole("table", { name: "Datos Aplicativo" });
}
async function open(serFile = true, annarFile = true) {
  fireEvent.click(screen.getByRole("button", { name: "Importar archivos" }));
  const dialog = await screen.findByRole("dialog");
  if (serFile) fireEvent.change(within(dialog).getByLabelText("CSV Ser Laboral"), { target: { files: [new File(["csv"], "ser.csv", { type: "text/csv" })] } });
  if (annarFile) fireEvent.change(within(dialog).getByLabelText("Excel ANNAR LAB"), { target: { files: [new File(["xls"], "annar.xls", { type: "application/vnd.ms-excel" })] } });
  return dialog;
}
async function exportCsv(user: ReturnType<typeof userEvent.setup>, label = "Exportar") {
  await user.click(screen.getByRole("button", { name: label }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Todas las columnas/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "CSV" }));
  await waitFor(() => expect(httpClient.getWithMeta).toHaveBeenCalled());
}
it("renders the combined export bar only for a successfully loaded report", async () => {
  render(<LabConsumptionPage />);
  function expectHidden() {
    expect(screen.queryByRole("button", { name: "Exportar datos unidos", hidden: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Exportación de datos unidos", hidden: true })).not.toBeInTheDocument();
  }
  expectHidden();
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  let resolve!: (value: LabConsumptionReport) => void;
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
it("uses only four filters, five line tabs and locally sums all application sources with first nonempty description", async () => {
  await query();
  expect(screen.queryByText("Línea de Producto")).not.toBeInTheDocument();
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ })).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Importar archivos" }).nextElementSibling).toHaveTextContent("Consultar");
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["Análisis", "Facturas Detalladas", "Admisiones", "Ser Laboral", "ANNAR LAB"]);
  let first = within(screen.getByRole("table", { name: "Datos Aplicativo" })).getAllByRole("row")[1];
  expect(first).toHaveTextContent("901HEMOGRAMA5");
  expect(screen.getByText("Importa un archivo ANNAR LAB para ver el análisis.")).toBeVisible();
  const dialog = await open(true, false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("tab", { name: /^Ser Laboral/ })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Análisis" }));
  first = within(await screen.findByRole("table", { name: "Datos Aplicativo" })).getAllByRole("row")[1];
  expect(first).toHaveTextContent("901HEMOGRAMA9");
  expect(labConsumptionApi.uploadAnnarLab).not.toHaveBeenCalled();
});
it("requires at least one file and starts both uploads in parallel, keeping per-file partial results until retry succeeds", async () => {
  await query();
  let resolve!: (value: ReturnType<typeof ser>) => void;
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  vi.mocked(labConsumptionApi.uploadAnnarLab).mockRejectedValueOnce(new ApiError(422, "Falta Seccion", null));
  const dialog = await open(false, false);
  expect(within(dialog).getByLabelText("CSV Ser Laboral")).toHaveAttribute("accept", ".csv");
  expect(within(dialog).getByLabelText("Excel ANNAR LAB")).toHaveAttribute("accept", ".xls");
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  expect(labConsumptionApi.uploadSerLaboral).not.toHaveBeenCalled();
  expect(labConsumptionApi.uploadAnnarLab).not.toHaveBeenCalled();
  for (const [label, name] of [["CSV Ser Laboral", "test.csv"], ["Excel ANNAR LAB", "test.xls"]]) fireEvent.change(within(dialog).getByLabelText(label), { target: { files: [new File(["data"], name)] } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(labConsumptionApi.uploadAnnarLab).toHaveBeenCalledTimes(1));
  expect(labConsumptionApi.uploadSerLaboral).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole("button", { name: "Importando…" })).toBeDisabled();
  expect(await within(dialog).findByText("Falta Seccion")).toBeVisible();
  await act(async () => resolve(ser()));
  expect(await within(dialog).findByText(/Ser Laboral: 1 registros importados/)).toBeVisible();
  expect(within(dialog).getByText("Advertencia CSV")).toBeVisible();
  expect(dialog).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(labConsumptionApi.uploadSerLaboral).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("tab", { name: /^ANNAR LAB/ })).toHaveAttribute("aria-selected", "true");
  expect(await screen.findByText("GLUCOSA")).toBeVisible();
});
it.each([413, 422])("keeps upload %s details inside the modal and permits Excel alone", async (status) => {
  await query();
  vi.mocked(labConsumptionApi.uploadAnnarLab).mockRejectedValueOnce(new ApiError(status, "Detalle del Excel", null));
  const dialog = await open(false, true);
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  expect(await within(dialog).findByText("Detalle del Excel")).toBeVisible();
  expect(labConsumptionApi.uploadSerLaboral).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("GLUCOSA")).toBeVisible();
});
it("renders 12/6 columns, local pagination and visibility, with grouped exports after Columnas visibles and both tokens", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  report.facturas = Array.from({ length: 11 }, (_, i) => row({ cnsctvo_dcto: `FACT-${i}` }));
  await query();
  const dialog = await open(); fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  for (const [tab, table, count] of [[/^Facturas Detalladas/, "facturas", 12], [/^Admisiones/, "admisiones", 12], [/^Ser Laboral/, "ser_laboral", 12], [/^ANNAR LAB/, "annar_lab", 6]] as const) {
    await user.click(screen.getByRole("tab", { name: tab }));
    const button = await screen.findByRole("button", { name: "Exportar" });
    expect(screen.getAllByRole("columnheader")).toHaveLength(count);
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(table === "annar_lab"
      ? ["Código Centro de Costo", "Nombre Centro de Costos", "Nombre del Examen", "Cantidad", "Empresa", "Punto Atención"]
      : ["Transacción / Factura / Admisión", "CUPS", "Tipo Procedimiento", "Nombre Procedimiento", "Cantidad", "Fecha Ingreso", "Fecha Factura", "Admisión", "Estado Documento", "Empresa", "Tipo Documento", "Sede"]);
    expect(screen.getByRole("button", { name: "Columnas visibles" }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    if (table === "facturas") {
      expect(screen.queryByText("FACT-10")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /siguiente/i }));
      expect(await screen.findByText("FACT-10")).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
      await user.click(screen.getByRole("checkbox", { name: "Sede" }));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("columnheader", { name: "Sede" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
      await user.click(screen.getByRole("checkbox", { name: "Sede" })); await user.keyboard("{Escape}");
    }
    vi.mocked(httpClient.getWithMeta).mockClear();
    await exportCsv(user);
    const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.lastCall![0].split("?")[1]);
    expect(httpClient.getWithMeta).toHaveBeenLastCalledWith(expect.stringContaining(`${path}/export?`), { signal: expect.any(AbortSignal), responseType: "blob" });
    expect(params.getAll("tablas")).toEqual([]);
    expect(params.get("ser_laboral_id")).toBe("ser-token");
    expect(params.get("annar_lab_id")).toBe("annar-token");
    expect(params.getAll("columnas")).toHaveLength(12);
    expect(params.has("lineas")).toBe(false);
  }
  vi.mocked(httpClient.getWithMeta).mockClear();
  await exportCsv(user, "Exportar datos unidos");
  const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.lastCall![0].split("?")[1]);
  expect(params.has("tablas")).toBe(false);
  expect(params.get("ser_laboral_id")).toBe("ser-token");
  expect(params.get("annar_lab_id")).toBe("annar-token");
  expect(downloadBlob).toHaveBeenLastCalledWith(expect.any(Blob), "consumo-laboratorio_2026-01-01_2026-01-31.zip");
  await user.click(screen.getByRole("tab", { name: "Análisis" }));
  const analysis = within(await screen.findByRole("table", { name: "Annar Lab" }));
  expect(analysis.getAllByRole("row")[1]).toHaveTextContent("02AGRUPACIÓN ANNAR7");
});
it.each(["ser_laboral", "annar_lab", "united"] as const)("discards imported data and tokens on grouped %s 410", async (table) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await query(); const dialog = await open(); fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("tab", { name: table === "ser_laboral" ? /^Ser Laboral/ : /^ANNAR LAB/ }));
  vi.mocked(httpClient.getWithMeta).mockRejectedValueOnce(new ApiError(410, "private detail", null));
  await exportCsv(user, table === "united" ? "Exportar datos unidos" : "Exportar");
  await waitFor(() => expect(screen.getAllByRole("alert").some((alert) => /expiró; cárgalo de nuevo/.test(alert.textContent ?? ""))).toBe(true));
  expect(screen.queryByRole("button", { name: "Exportar" })).not.toBeInTheDocument();
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(downloadBlob).not.toHaveBeenCalled();
  await user.click(screen.getByRole("tab", { name: /^Ser Laboral/ }));
  expect(await screen.findByText("Importa un CSV Ser Laboral para ver los registros.")).toBeVisible();
  await user.click(screen.getByRole("tab", { name: /^ANNAR LAB/ }));
  expect(await screen.findByText("Importa un archivo ANNAR LAB para ver los registros.")).toBeVisible();
  vi.mocked(httpClient.getWithMeta).mockClear();
  await exportCsv(user, "Exportar datos unidos");
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
  const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.lastCall![0].split("?")[1]);
  expect(params.has("ser_laboral_id")).toBe(false);
  expect(params.has("annar_lab_id")).toBe(false);
});
it.each([
  ["csv", null, "consumo-laboratorio_2026-01-01_2026-01-31.zip"],
  ["xlsx", null, "consumo-laboratorio_2026-01-01_2026-01-31.xlsx"],
  ["csv", 'attachment; filename="reporte agrupado.zip"', "reporte agrupado.zip"],
  ["xlsx", "attachment; filename=reporte.xlsx", "reporte.xlsx"],
  ["xlsx", "attachment; filename=backup.xlsx; filename*=UTF-8''an%C3%A1lisis.xlsx", "análisis.xlsx"],
  ["csv", "attachment; filename*=UTF-8''%ZZ", "consumo-laboratorio_2026-01-01_2026-01-31.zip"],
] as const)("downloads grouped %s using disposition %s", async (format, disposition, expectedName) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const file = new Blob(["grouped"]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: file, headers: new Headers(disposition ? { "Content-Disposition": disposition } : {}) });
  await query();
  await user.click(screen.getByRole("button", { name: "Exportar datos unidos" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Todas las columnas/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: format === "csv" ? "CSV" : "Excel (.xlsx)" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, expectedName));
  const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.lastCall![0].split("?")[1]);
  expect(params.get("formato")).toBe(format);
  expect(params.has("tablas")).toBe(false);
  expect(params.has("ser_laboral_id")).toBe(false);
  expect(params.has("annar_lab_id")).toBe(false);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
});
it("exports Datos Aplicativo visible columns even from the ANNAR tab", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await query();
  const dialog = await open(); fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("tab", { name: /^Facturas Detalladas/ }));
  await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
  await user.click(screen.getByRole("checkbox", { name: "Sede" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("tab", { name: /^ANNAR LAB/ }));
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /Columnas visibles \(11\)/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "CSV" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
  const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.lastCall![0].split("?")[1]);
  expect(params.getAll("columnas")).toHaveLength(11);
  expect(params.getAll("columnas")).not.toContain("sede:text");
  expect(params.has("tablas")).toBe(false);
  expect(params.get("ser_laboral_id")).toBe("ser-token");
  expect(params.get("annar_lab_id")).toBe("annar-token");
});
it("shows both empty analysis states and backend consultation warnings", async () => {
  report = { facturas: [], admisiones: [], total_facturas: 0, total_admisiones: 0, advertencias: ["No hay líneas de laboratorio."] };
  await query();
  expect(screen.getByText("No hay datos del aplicativo para analizar.")).toBeVisible();
  expect(screen.getByText("Importa un archivo ANNAR LAB para ver el análisis.")).toBeVisible();
  expect(screen.getByText("No hay líneas de laboratorio.")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: /^Facturas Detalladas/ }));
  expect(await screen.findByRole("button", { name: "Exportar" })).toBeDisabled();
  expect(screen.getByText("No hay registros de Facturas Detalladas.")).toBeVisible();
});
it("keeps import disabled after a consultation failure, then enables it on successful retry", async () => {
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.startsWith(`${path}?`)) throw new ApiError(502, "private detail", null);
    return [];
  });
  render(<LabConsumptionPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates(); fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar el informe.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Exportar datos unidos" })).not.toBeInTheDocument();
  vi.mocked(httpClient.get).mockResolvedValue(report);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("table", { name: "Datos Aplicativo" });
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeEnabled();
});
it("aborts a pending import on clear and ignores its late result", async () => {
  await query();
  let resolve!: (value: ReturnType<typeof ser>) => void;
  vi.mocked(labConsumptionApi.uploadSerLaboral).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const dialog = await open(true, false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  const signal = vi.mocked(labConsumptionApi.uploadSerLaboral).mock.lastCall![1]!;
  // Programmatic submit of the page's clear action models a lifecycle reset while the modal is busy.
  fireEvent.click(screen.getByText("Limpiar"));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(ser()));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeDisabled();
});
it("new consultation and clear discard imported rows/tokens and gate the import lifecycle", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await query(); const dialog = await open(); fireEvent.click(within(dialog).getByRole("button", { name: "Importar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeDisabled();
  await screen.findByRole("table", { name: "Datos Aplicativo" });
  fireEvent.click(screen.getByRole("tab", { name: /^Ser Laboral/ }));
  expect(await screen.findByText("Importa un CSV Ser Laboral para ver los registros.")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: /^ANNAR LAB/ }));
  expect(await screen.findByText("Importa un archivo ANNAR LAB para ver los registros.")).toBeVisible();
  await exportCsv(user, "Exportar datos unidos");
  const params = new URLSearchParams(vi.mocked(httpClient.getWithMeta).mock.lastCall![0].split("?")[1]);
  expect(params.has("ser_laboral_id")).toBe(false);
  expect(params.has("annar_lab_id")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Importar archivos" })).toBeDisabled();
});
