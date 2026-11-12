// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import VitalSignsPage from "./vital-signs-page";
vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
vi.mock("@/lib/table-export", async (original) => ({ ...await original<typeof import("@/lib/table-export")>(), downloadBlob: vi.fn() }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 11, nombre: "Línea ficticia A" }, { id: 22, nombre: "Línea ficticia B" }, { id: 33, nombre: "Línea ficticia C" }]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [{ sede: "Sede ficticia", nmro_idntfccn: "00123", fcha_atncn: "2026-01-02", pso: 72.5 }], headers: new Headers({ "X-Total-Count": "101" }) });
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
it("starts without a query, validates exact date messages and orders the filters", async () => {
  render(<VitalSignsPage />);
  await ready();
  expect(screen.getByText("Selecciona un período y presiona Consultar.")).toBeVisible();
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ }).map((element) => element.getAttribute("aria-label"))).toEqual(["Sede: 0 seleccionadas", "Empresa: 0 seleccionadas", "Línea de Producto: 0 seleccionadas"]);
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2026-02-01", "2026-01-31");
  fireEvent.click(consult());
  expect(screen.getByText("La fecha inicial no puede ser posterior a la fecha final.")).toBeVisible();
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
});
it.each([1, 2, 3])("applies %s product lines, omits all, paginates applied filters and clears", async (count) => {
  const user = userEvent.setup();
  render(<VitalSignsPage />);
  await ready();
  dates();
  await user.click(screen.getByRole("combobox", { name: /Línea de Producto/ }));
  expect(await screen.findByRole("combobox", { name: /Buscar/ })).toBeVisible();
  if (count === 3) await user.click(await screen.findByRole("button", { name: "Seleccionar todas" }));
  else for (const label of ["Línea ficticia A", "Línea ficticia B"].slice(0, count)) await user.click(await screen.findByRole("option", { name: label }));
  await user.keyboard("{Escape}");
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
  await user.click(consult());
  expect(await screen.findByText("00123")).toBeVisible();
  expect(screen.getByText("02/01/2026")).toBeVisible();
  expect(screen.getByText("72,5")).toBeVisible();
  expect(params().getAll("lineas")).toEqual(count === 3 ? [] : ["11", "22"].slice(0, count));
  expect(params().has("sedes")).toBe(false);
  expect(params().has("empresas")).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 a 10 de 101 registros");
  expect(screen.queryByText(/registros encontrados/)).not.toBeInTheDocument();
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
it("retries a product-line catalog failure via an icon and enables Consultar", async () => {
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.endsWith("product-lines")) throw new Error("private detail");
    return [];
  });
  render(<VitalSignsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las líneas de producto.");
  expect(consult()).toBeDisabled();
  const retry = screen.getByRole("button", { name: "Reintentar Línea de Producto" });
  expect(retry.querySelector("svg")).not.toBeNull();
  expect(retry).not.toHaveTextContent("Reintentar");
  vi.mocked(httpClient.get).mockResolvedValue([]);
  fireEvent.click(retry);
  await ready();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it.each([502, 503, 422, 500])("shows safe %s errors, icon retry and an empty result", async (status) => {
  vi.mocked(httpClient.getWithMeta).mockRejectedValueOnce(new ApiError(status, "private detail", null)).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "0" }) });
  render(<VitalSignsPage />);
  await ready();
  dates();
  fireEvent.click(consult());
  expect(await screen.findByRole("alert")).toHaveTextContent(status === 502 || status === 503 ? "No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo." : status === 422 ? "Revisa el período seleccionado. La fecha inicial no puede ser posterior a la fecha final." : "No se pudo consultar el informe. Intenta de nuevo.");
  expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  const retry = screen.getByRole("button", { name: "Reintentar" });
  expect(retry.querySelector("svg")).not.toBeNull();
  fireEvent.click(retry);
  expect(await screen.findByText("No hay signos vitales para este período.")).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 0 a 0 de 0 registros");
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2);
});
