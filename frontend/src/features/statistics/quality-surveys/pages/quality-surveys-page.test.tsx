// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { downloadBlob } from "@/lib/table-export";
import QualitySurveysPage from "./quality-surveys-page";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getBlob: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);

const path = "/statistics/administrative/quality-surveys";
const headers = ["Sede", "Tipo Id. Paciente", "Número Id. Paciente", "Nombre", "Sexo", "Teléfono", "Empresa", "Profesional Realiza", "CUPS Servicio", "Servicio", "Tipo Servicio"];
const queryCalls = () => vi.mocked(httpClient.get).mock.calls.filter(([url]) => url.startsWith(`${path}?`));

beforeEach(() => {
  vi.resetAllMocks();
  const rows = Array.from({ length: 11 }, (_, index) => ({ sede: `Sede de prueba ${index + 1}` }));
  vi.mocked(httpClient.get).mockImplementation(async (url) => url.startsWith(`${path}?`) ? { rows, total: rows.length } : []);
});

function dates(start = "2024-01-01", end = "2024-01-31") {
  for (const [label, value] of [[/Fecha inicial/, start], [/Fecha final/, end]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(value, true, "Y-m-d"));
  }
}

async function openPage() {
  render(<QualitySurveysPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
}

async function consult() {
  await openPage();
  dates();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  return within(await screen.findByRole("table", { name: "Resultados" }));
}

it("loads only site and company catalogs and requires valid dates before requesting rows", async () => {
  await openPage();
  expect(vi.mocked(httpClient.get).mock.calls.map(([url]) => url).sort()).toEqual([
    `${path}/filters/companies`, `${path}/filters/sites`,
  ]);
  expect(screen.queryByRole("combobox", { name: /Línea de Producto/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2024-02-01");
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(queryCalls()).toHaveLength(0);
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
});

it("applies site and company values without applying product-line filters", async () => {
  const user = userEvent.setup();
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 3, nombre: "Norte" }, { id: 4, nombre: "Sur" }, { id: 5, nombre: "Centro" }]);
  await openPage();
  for (const label of ["Sede", "Empresa"]) {
    await user.click(screen.getByRole("combobox", { name: `${label}: 0 seleccionadas` }));
    await user.click(screen.getByRole("option", { name: "Norte" }));
    await user.click(screen.getByRole("option", { name: "Sur" }));
    await user.keyboard("{Escape}");
  }
  vi.mocked(httpClient.get).mockResolvedValueOnce({ rows: [], total: 0 });
  dates();
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByText("No hay encuestas de calidad para este período.");
  expect(queryCalls().map(([url]) => url)).toEqual([
    `${path}?fecha_inicial=2024-01-01&fecha_final=2024-01-31&sedes=3&sedes=4&empresas=3&empresas=4`,
  ]);
});

it("shows exactly the report columns and searches and pages without refetching", async () => {
  const table = await consult();
  expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(headers);
  expect(table.getByText("Sede de prueba 1")).toBeVisible();
  expect(table.queryByText("Sede de prueba 11")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
  expect(table.getByText("Sede de prueba 11")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SEDE DE PRUEBA 1" } });
  expect(table.getAllByRole("row")).toHaveLength(4);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "sin coincidencias" } });
  expect(table.getByText("No se encontraron resultados")).toBeVisible();
  expect(queryCalls()).toHaveLength(1);
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

it.each([["csv", "CSV"], ["xlsx", "Excel (.xlsx)"]] as const)("exports only the selected columns as %s with the applied filters", async (format, label) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  const table = await consult();
  await user.click(screen.getByRole("button", { name: "Columnas visibles" }));
  await user.click(screen.getByRole("button", { name: "Quitar todas las columnas" }));
  await user.click(screen.getByRole("checkbox", { name: /^Servicio$/ }));
  await user.click(screen.getByRole("checkbox", { name: "Nombre" }));
  await user.keyboard("{Escape}");
  expect(table.getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Sede", "Servicio", "Nombre"]);
  dates("2024-01-10", "2024-01-20");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "11" } });
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  expect((await screen.findAllByRole("menuitem")).map((item) => item.textContent)).toEqual(["CSV", "Excel (.xlsx)"]);
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(file, `encuestas-de-calidad_2024-01-01_2024-01-31.${format}`));
  expect(httpClient.getBlob).toHaveBeenCalledTimes(1);
  const [url] = vi.mocked(httpClient.getBlob).mock.calls[0];
  const [endpoint, params] = url.split("?");
  const applied = new URLSearchParams(queryCalls()[0][0].split("?")[1]);
  expect(endpoint).toBe(`${path}/export`);
  expect(Array.from(new URLSearchParams(params))).toEqual([
    ...applied, ["formato", format], ["columnas", "sede:text"], ["columnas", "procedimiento:text"], ["columnas", "nombre_completo:text"],
  ]);
  expect(queryCalls()).toHaveLength(1);
});

it("handles a failed query, retries, and clears an empty result", async () => {
  await openPage();
  vi.mocked(httpClient.get).mockRejectedValueOnce(new Error("detalle privado"));
  dates();
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar el informe. Intenta de nuevo.");
  expect(screen.queryByText("detalle privado")).not.toBeInTheDocument();
  vi.mocked(httpClient.get).mockResolvedValueOnce({ rows: [], total: 0 });
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("No hay encuestas de calidad para este período.")).toBeVisible();
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  expect(queryCalls().map(([url]) => url)).toEqual(Array(2).fill(`${path}?fecha_inicial=2024-01-01&fecha_final=2024-01-31`));
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
});
