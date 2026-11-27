// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { downloadBlob } from "@/lib/table-export";
import IncapacitiesPage from "./incapacities-page";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));

const endpoint = "/statistics/administrative/disability-management";
const headers = [
  "Tipo de identificación", "Identificación", "Primer nombre", "Segundo nombre", "Primer apellido", "Segundo apellido",
  "Fecha de solicitud", "Código IPS", "Descripción IPS", "Fecha de inicio", "Fecha de fin", "Duración", "Prórroga",
  "Origen de la patología", "Tipo de identificación médico", "Número de identificación del médico", "Número del registro médico",
  "Nombre del médico", "Especialidad del médico", "Fecha probable de parto", "Fecha probable de nacimiento", "Código del diagnóstico",
  "Descripción del diagnóstico", "Lateralidad", "Modalidad de atención", "Estado de la incapacidad", "Número de la solicitud",
];
const exportKeys = [
  "tipo_idntfccn:text", "nmro_idntfccn:text", "prmr_nmbre:text", "sgndo_nmbre:text", "prmr_aplldo:text", "sgndo_aplldo:text",
  "fcha_atncn:date", "idntfccn_sde:text", "sede:text", "fcha_incpcdd:date", "fcha_fin_incpcdd:date", "ds_incpcdd:number", "prrga:text",
  "Contingencia:text", "tpo_idntfccn_prfsnl:text", "idntfccn_prfsnl:text", "rgstro_mdco:text", "nombre_medico:text", "especialidad:text",
  "fecha_probable_parto:text", "fecha_probable_nacimiento:text", "cdgo_dgnstco:text", "diagnostico:text", "lateralidad:text",
  "clse_atencn:text", "estado_incapacidad:text", "cnsctvo_incpcdds:text",
];
const cells = [
  "CC", "000123", "Persona", "Prueba", "Uno", "Dos", "02/01/2024", "0004", "IPS CLINICA SALUD FLORIDA SEDE FLORIDA VALLE",
  "03/01/2024", "05/01/2024", "3", "I", "EG", "CC", "000789", "0008", "Profesional Prueba", "General", "", "", "Z00",
  "Diagnóstico ficticio", "", "Ambulatoria electiva", "Inicial", "123",
];

afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 11, nombre: "Empresa A" }, { id: 22, nombre: "Empresa B" }, { id: 33, nombre: "Empresa C" }]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({
    data: [Object.fromEntries(exportKeys.map((key, index) => [key.split(":")[0], index === 11 ? 3 : cells[index]]))],
    headers: new Headers({ "X-Total-Count": "11" }),
  });
  vi.mocked(httpClient.getBlob).mockResolvedValue(new Blob(["synthetic"]));
});

function dates(start = "2024-01-01", end = "2024-01-31") {
  for (const [label, value] of [[/Fecha inicial/, start], [/Fecha final/, end]] as const) {
    const input = screen.getByLabelText(label) as HTMLInputElement & { _flatpickr: { setDate(date: string, trigger: boolean, format: string): void } };
    act(() => input._flatpickr.setDate(value, true, "Y-m-d"));
  }
}
const consult = () => screen.getByRole("button", { name: "Consultar" });
async function mount() {
  render(<IncapacitiesPage />);
  await waitFor(() => expect(consult()).toBeEnabled());
}
function parse(url: string) {
  return new URL(url, "https://example.test");
}

it("loads only companies and rejects missing or inverted dates without querying", async () => {
  await mount();
  expect(screen.getByRole("heading", { name: "Gestión de Incapacidades" })).toBeVisible();
  expect(httpClient.get).toHaveBeenCalledExactlyOnceWith(`${endpoint}/filters/companies`, { signal: expect.any(AbortSignal) });
  expect(screen.getAllByRole("combobox").map((field) => field.getAttribute("aria-label"))).toEqual(["Empresa: 0 seleccionadas"]);
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2024-02-01");
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("shows all transformed values, scrolls horizontally and pages the applied filters", async () => {
  const user = userEvent.setup();
  await mount();
  dates();
  fireEvent.click(consult());
  await screen.findByText("000123");
  const table = screen.getByRole("table", { name: "Resultados" });
  expect(table.closest(".overflow-x-auto")).not.toBeNull();
  expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(headers);
  expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(cells);
  dates("2024-01-20");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2));
  const url = parse(vi.mocked(httpClient.getWithMeta).mock.lastCall![0]);
  expect(url.pathname).toBe(endpoint);
  expect(url.searchParams.toString()).toBe("fecha_inicial=2024-01-01&fecha_final=2024-01-31&limit=10&offset=10");
  await user.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("debounces search, resets pagination and omits a blank search", async () => {
  const user = userEvent.setup();
  await mount();
  dates();
  fireEvent.click(consult());
  await screen.findByText("000123");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2));
  expect(parse(vi.mocked(httpClient.getWithMeta).mock.lastCall![0]).searchParams.get("offset")).toBe("10");
  await screen.findByText("000123");

  const search = screen.getByRole("searchbox", { name: "Buscar en Resultados" });
  fireEvent.change(search, { target: { value: "Álv" } });
  fireEvent.change(search, { target: { value: "  Álvarez & 001  " } });
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Exportar" })).toBeDisabled();
  await waitFor(() => expect(httpClient.getWithMeta).toHaveBeenCalledTimes(3));
  const params = parse(vi.mocked(httpClient.getWithMeta).mock.lastCall![0]).searchParams;
  expect(params.get("search")).toBe("Álvarez & 001");
  expect(params.get("offset")).toBe("0");
  expect(params.get("fecha_inicial")).toBe("2024-01-01");
  expect(params.get("fecha_final")).toBe("2024-01-31");
  await screen.findByText("000123");

  fireEvent.change(search, { target: { value: "   " } });
  await waitFor(() => expect(httpClient.getWithMeta).toHaveBeenCalledTimes(4));
  expect(parse(vi.mocked(httpClient.getWithMeta).mock.lastCall![0]).searchParams.has("search")).toBe(false);
  expect(httpClient.getBlob).not.toHaveBeenCalled();
});

it.each(["csv", "xlsx"] as const)("exports all 27 columns to %s with the same applied company/date filters and search even after hiding a column", async (format) => {
  const user = userEvent.setup();
  await mount();
  dates();
  await user.click(screen.getByRole("combobox", { name: /Empresa:/ }));
  for (const name of ["Empresa A", "Empresa B"]) {
    await user.click(await screen.findByRole("option", { name }));
  }
  await user.keyboard("{Escape}");
  fireEvent.click(consult());
  await screen.findByText("000123");
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en Resultados" }), { target: { value: "  Álvarez & 001  " } });
  await waitFor(() => expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2));
  const list = parse(vi.mocked(httpClient.getWithMeta).mock.lastCall![0]);
  expect(list.searchParams.getAll("empresas")).toEqual(["11", "22"]);
  expect(list.searchParams.get("search")).toBe("Álvarez & 001");
  await screen.findByText("000123");
  await user.click(screen.getByRole("button", { name: /Columnas visibles/ }));
  expect(screen.getAllByRole("checkbox")).toHaveLength(27);
  await user.click(screen.getByRole("checkbox", { name: "Descripción IPS" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("columnheader", { name: "Descripción IPS" })).not.toBeInTheDocument();
  dates("2024-01-20");
  await user.click(screen.getByRole("button", { name: "Exportar" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Todas las columnas (27)" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: format === "csv" ? "CSV" : "Excel (.xlsx)" }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), `incapacidades_2024-01-01_2024-01-31.${format}`));
  const [path, options] = vi.mocked(httpClient.getBlob).mock.lastCall!;
  const exported = parse(path);
  expect(exported.pathname).toBe(`${endpoint}/export`);
  for (const key of ["fecha_inicial", "fecha_final", "empresas", "search"]) {
    expect(exported.searchParams.getAll(key)).toEqual(list.searchParams.getAll(key));
  }
  expect(exported.searchParams.get("formato")).toBe(format);
  expect(exported.searchParams.getAll("columnas")).toEqual(exportKeys);
  const actualKeys = new Set<string>();
  exported.searchParams.forEach((_, key) => actualKeys.add(key));
  expect(actualKeys).toEqual(new Set(["fecha_inicial", "fecha_final", "empresas", "search", "formato", "columnas"]));
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});
