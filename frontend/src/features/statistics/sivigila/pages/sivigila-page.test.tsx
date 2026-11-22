// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { downloadBlob } from "@/lib/table-export";
import { SIVIGILA_COLUMN_KEYS, type SivigilaRecord, type SivigilaReport } from "../types";
import SivigilaPage from "./sivigila-page";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);
const path = "/statistics/administrative/sivigila";
const iraHeaders = ["< 1 Año", "1 Año", "2 a 4 Años", "5 a 19 Años", "20 a 39 Años", "40 a 59 Años", ">= 60 Años"];
const edaHeaders = ["< 1 Año", "1 a 4 Años", "5 a 9 Años", "10 a 14 Años", "15 a 19 Años", "20 a 24 Años", "25 a 29 Años", "30 a 34 Años", "35 a 39 Años", "40 a 44 Años", "45 a 49 Años", "50 a 54 Años", "55 a 59 Años", "60 a 64 Años", "65 a 69 Años", "70 a 74 Años", "75 a 79 Años", ">= 80 Años"];
let report: SivigilaReport;

beforeEach(() => {
  vi.resetAllMocks();
  const row = Object.fromEntries(SIVIGILA_COLUMN_KEYS.map((key) => [key, ""])) as SivigilaRecord;
  Object.assign(row, { sede: "Sede ficticia", no_documento: "00123", nombre_completo: "Paciente ficticio", fecha_atencion: "2026-01-02", edad: 3, tipo_edad: "Meses" });
  report = {
    titulo: "NOTIFICACIÓN SEDE FICTICIA", subtitulo: "SEMANA 4 PERIODO 1 2026", semana: 4, periodo: 1, anio: 2026,
    ira: { titulo: "Notificación IRA", columnas: iraHeaders, filas: [
      { etiqueta: "Total Consultas externas y urgencias (IRA)", valores: [1, 0, 0, 0, 0, 0, 0], total: 1 },
      { etiqueta: "Total Consultas externas y urgencias", valores: [1, 0, 0, 0, 0, 0, 0], total: 1 },
    ] },
    eda: { titulo: "Notificación EDA", columnas: edaHeaders, filas: [
      { etiqueta: "F (Femenino)", valores: edaHeaders.map((_, index) => index === 0 ? 1 : 0), total: 1 },
      { etiqueta: "M (Masculino)", valores: edaHeaders.map(() => 0), total: 0 },
      { etiqueta: "Total general", valores: edaHeaders.map((_, index) => index === 0 ? 1 : 0), total: 1 },
    ] },
    pestanas: { general: [row], ira: [{ ...row, grupo: "Menor de 1 Año" }], eda: [{ ...row, grupo: "Menor de 1 Año" }], dengue: [row], varicela: [], rabia: [] },
    advertencias: [], total_registros: 1,
  };
  vi.mocked(httpClient.get).mockImplementation(async (url) => url.startsWith(`${path}?`) ? report : [{ id: 7, nombre: "Catálogo ficticio" }]);
});
function dates(start = "2026-01-01", end = "2026-01-31") {
  for (const [label, iso] of [[/Fecha inicial/, start], [/Fecha final/, end]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(iso, true, "Y-m-d"));
  }
}
const consult = () => screen.getByRole("button", { name: "Consultar" });
const ready = () => waitFor(() => expect(consult()).toBeEnabled());
const reportCalls = () => vi.mocked(httpClient.get).mock.calls.filter(([url]) => url.startsWith(`${path}?`));
async function queryReport() {
  render(<SivigilaPage />);
  await ready();
  dates();
  fireEvent.click(consult());
  await screen.findByRole("table", { name: "Notificación IRA" });
}

it("does not query before Consultar and preserves date validation and filter order", async () => {
  render(<SivigilaPage />);
  await ready();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ }).map((element) => element.getAttribute("aria-label"))).toEqual(["Sede: 0 seleccionadas", "Empresa: 0 seleccionadas", "Línea de Producto: 0 seleccionadas"]);
  expect(reportCalls()).toHaveLength(0);
  dates();
  expect(reportCalls()).toHaveLength(0);
  dates("2026-02-01");
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(reportCalls()).toHaveLength(0);
});

it("feeds ordered tabs and both analysis tables from one request, without Inicio", async () => {
  await queryReport();
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent?.replace(/\d+$/, ""))).toEqual(["Análisis", "General", "Evento IRA", "Evento EDA", "Dengue", "Varicela", "Exposición Rábica"]);
  expect(screen.queryByText("Inicio")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: report.titulo })).toBeVisible();
  expect(screen.getByText(report.subtitulo)).toBeVisible();
  expect(screen.getAllByRole("table")).toHaveLength(2);
  for (const tableData of [report.ira, report.eda]) {
    const table = within(screen.getByRole("table", { name: tableData.titulo }));
    expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([tableData.titulo, ...tableData.columnas, "Total"]);
    for (const row of tableData.filas) {
      const rendered = within(table.getByRole("rowheader", { name: row.etiqueta }).closest("tr")!);
      expect(rendered.getByRole("rowheader")).toHaveTextContent(row.etiqueta);
      expect(rendered.getAllByRole("cell").map((cell) => cell.textContent)).toEqual([...row.valores, row.total].map(String));
    }
  }
  expect(reportCalls()).toHaveLength(1);
  const [url, options] = reportCalls()[0];
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
});

it("switches event group headers locally and shows an empty tab title", async () => {
  const user = userEvent.setup();
  await queryReport();
  for (const [label, header] of [["General", "Grupo"], ["Evento IRA", "Grupo IRA"], ["Evento EDA", "Grupo EDA"], ["Dengue", "Grupo"]]) {
    await user.click(screen.getByRole("tab", { name: new RegExp(`^${label}`) }));
    expect(await screen.findByRole("columnheader", { name: header })).toBeVisible();
    expect(screen.getByText("00123")).toBeVisible();
    expect(screen.getByText("02/01/2026")).toBeVisible();
    if (label.startsWith("Evento")) expect(screen.getByText("Menor de 1 Año")).toBeVisible();
  }
  await user.click(screen.getByRole("tab", { name: /^Varicela/ }));
  expect(await screen.findByText("No hay atenciones de Varicela para este período.")).toBeVisible();
  expect(reportCalls()).toHaveLength(1);
});

it("shows the safe 502 error and retries the same report", async () => {
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.startsWith(`${path}?`)) throw new ApiError(502, "private detail", null);
    return [];
  });
  render(<SivigilaPage />);
  await ready();
  dates();
  fireEvent.click(consult());
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(reportCalls()).toHaveLength(1);
  vi.mocked(httpClient.get).mockResolvedValue(report);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("table", { name: "Notificación IRA" })).toBeVisible();
  expect(reportCalls()).toHaveLength(2);
});

it("offers only PDF and Excel exports, from Análisis, using the processed report without a new query", async () => {
  const user = userEvent.setup();
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.post).mockResolvedValue(file);
  await queryReport();
  expect(screen.getByRole("heading", { name: "Resultados" })).toBeVisible();
  expect(screen.getAllByRole("button", { name: /^Exportar/ }).map((button) => button.textContent)).toEqual(["Exportar a PDF", "Exportar a Excel"]);
  await user.click(screen.getByRole("button", { name: "Exportar a PDF" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, "NOTIFICACION_SEDE_FICTICIA.pdf"));
  expect(httpClient.post).toHaveBeenLastCalledWith(`${path}/export/pdf`, expect.objectContaining({ body: report, responseType: "blob" }));
  await user.click(screen.getByRole("button", { name: "Exportar a Excel" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, "NOTIFICACION_SEDE_FICTICIA.xlsx"));
  expect(httpClient.post).toHaveBeenLastCalledWith(`${path}/export/xlsx`, expect.objectContaining({ body: report, responseType: "blob" }));
  expect(reportCalls()).toHaveLength(1);
  for (const label of ["General", "Evento IRA", "Evento EDA", "Dengue"]) {
    await user.click(screen.getByRole("tab", { name: new RegExp(`^${label}`) }));
    expect(await screen.findByRole("columnheader", { name: /^Grupo/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Exportar/ })).not.toBeInTheDocument();
  }
});

it("reports an export failure without leaking details", async () => {
  const user = userEvent.setup();
  vi.mocked(httpClient.post).mockRejectedValue(new ApiError(500, "private detail", null));
  await queryReport();
  await user.click(screen.getByRole("button", { name: "Exportar a PDF" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo exportar la información. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  expect(downloadBlob).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Exportar a PDF" })).toBeEnabled();
});
