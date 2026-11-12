// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import DetailedInvoicesPage from "./detailed-invoices-page";
vi.mock("@/lib/http/http-client", () => ({
  httpClient: { get: vi.fn(), getWithMeta: vi.fn() },
}));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(httpClient.get).mockResolvedValue([
    { id: 11, nombre: "Norte" },
    { id: 22, nombre: "Sur" },
    { id: 33, nombre: "Centro" },
  ]);
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({
    data: [
      {
        sede: "Norte",
        estdo_pgo_pcnte: "PAGADO",
        fcha_dcto: "2026-01-02",
        vlr_factrdo: 1200,
      },
    ],
    headers: new Headers({ "X-Total-Count": "101" }),
  });
});
function mount() {
  render(<DetailedInvoicesPage />);
}
it("orders filters and uses a responsive five-filter grid", async () => {
  mount();
  await filterReady(/Línea de Producto/);
  expect(screen.getAllByRole("combobox", { name: /seleccionadas/ }).map((element) => element.getAttribute("aria-label"))).toEqual([
    "Sede: 0 seleccionadas", "Empresa: 0 seleccionadas", "Línea de Producto: 0 seleccionadas",
  ]);
  expect(screen.getByLabelText(/Fecha inicial/).closest(".grid")).toHaveClass("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "2xl:grid-cols-5");
});
it("retries product-line catalog failures with an accessible icon button", async () => {
  vi.mocked(httpClient.get).mockImplementation(async (url) => {
    if (url.endsWith("product-lines")) throw new Error("private detail");
    return [{ id: 11, nombre: "Norte" }];
  });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las líneas de producto.");
  expect(screen.getByRole("button", { name: "Consultar" })).toBeDisabled();
  const retry = screen.getByRole("button", { name: "Reintentar Línea de Producto" });
  expect(retry.querySelector("svg")).not.toBeNull();
  expect(retry).not.toHaveTextContent("Reintentar");
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 11, nombre: "Norte" }]);
  fireEvent.click(retry);
  await filterReady(/Línea de Producto/);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled();
});
function pickDate(label: RegExp, iso: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement & {
    _flatpickr: { setDate(date: string, trigger: boolean, format: string): void };
  };
  act(() => input._flatpickr.setDate(iso, true, "Y-m-d"));
}
function dates(start = "2026-01-01", end = "2026-01-31") {
  pickDate(/Fecha inicial/, start);
  pickDate(/Fecha final/, end);
}
const filter = (label: RegExp) => screen.getByRole("combobox", { name: label });
const filterReady = (label: RegExp) =>
  waitFor(() =>
    expect(filter(label)).not.toHaveAttribute("aria-disabled", "true"),
  );
function lastParams() {
  const calls = vi.mocked(httpClient.getWithMeta).mock.calls;
  return new URLSearchParams(calls[calls.length - 1][0].split("?")[1]);
}
it("does not query before Consultar and blocks missing or reversed dates without requesting", async () => {
  mount();
  expect(
    screen.getByText("Selecciona un período y presiona Consultar."),
  ).toBeVisible();
  expect(screen.queryByText("Punto Atención Factura")).not.toBeInTheDocument();
  expect(screen.queryByText("Tipo documento")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(screen.getByText("La fecha inicial es obligatoria.")).toBeVisible();
  expect(screen.getByText("La fecha final es obligatoria.")).toBeVisible();
  dates("2026-02-01", "2026-01-31");
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(
    screen.getByText(
      "La fecha inicial no puede ser posterior a la fecha final.",
    ),
  ).toBeVisible();
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
});
it("queries only applied filters, omits none/all selections, reports count/status and resets with Limpiar", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() => expect(httpClient.get).toHaveBeenCalledTimes(3));
  dates();
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText("PAGADO")).toBeVisible();
  expect(screen.queryByText(/registros encontrados/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 1 a 10 de 101 registros");
  expect(screen.getByText("PAGADO")).not.toHaveAttribute("data-variant");
  expect(screen.getByText("02/01/2026")).toBeVisible();
  expect(screen.getByText("1.200")).toBeVisible();
  expect(lastParams().get("fecha_inicial")).toBe("2026-01-01");
  expect(lastParams().get("limit")).toBe("10");
  expect(lastParams().get("offset")).toBe("0");
  expect(screen.getByRole("columnheader", { name: "Empresa" })).toHaveClass(
    "text-xs",
  );
  expect(lastParams().has("sedes")).toBe(false);
  expect(lastParams().has("empresas")).toBe(false);
  expect(lastParams().has("lineas")).toBe(false);
  const count = vi.mocked(httpClient.getWithMeta).mock.calls.length;
  dates("2026-01-02", "2026-01-31");
  await user.click(filter(/Sede/));
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
  );
  await user.click(filter(/Empresa/));
  await user.click(
    await screen.findByRole("button", { name: "Seleccionar todas" }),
  );
  await user.keyboard("{Escape}");
  await user.click(filter(/Línea de Producto/));
  await user.click(await screen.findByRole("button", { name: "Seleccionar todas" }));
  await user.keyboard("{Escape}");
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(count);
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await waitFor(() =>
    expect(httpClient.getWithMeta).toHaveBeenCalledTimes(count + 1),
  );
  expect(lastParams().has("sedes")).toBe(false);
  expect(lastParams().has("empresas")).toBe(false);
  expect(lastParams().has("lineas")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.getByLabelText(/Fecha inicial/)).toHaveValue("");
  expect(screen.getByLabelText(/Fecha final/)).toHaveValue("");
  expect(screen.getAllByText(/^Seleccionar (sedes|empresas|líneas de producto)$/)).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Limpiar" })).toBeDisabled();
  expect(
    screen.getByText("Selecciona un período y presiona Consultar."),
  ).toBeVisible();
  expect(
    screen.queryByText("101 registros encontrados"),
  ).not.toBeInTheDocument();
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(count + 1);
}, 15000);
it("sends restricted ids as repeated parameters and uses server pagination without reapplying draft dates", async () => {
  const user = userEvent.setup();
  mount();
  await filterReady(/Sede/);
  dates();
  for (const label of ["Sede", "Empresa", "Línea de Producto"]) {
    await user.click(filter(new RegExp(label)));
    await user.click(await screen.findByRole("option", { name: "Norte" }));
    await user.click(screen.getByRole("option", { name: "Sur" }));
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
    );
  }
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByText("PAGADO");
  expect(lastParams().getAll("sedes")).toEqual(["11", "22"]);
  expect(lastParams().getAll("empresas")).toEqual(["11", "22"]);
  expect(lastParams().getAll("lineas")).toEqual(["11", "22"]);
  dates("2026-01-20", "2026-01-31");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => expect(lastParams().get("offset")).toBe("10"));
  expect(lastParams().get("fecha_inicial")).toBe("2026-01-01");
  fireEvent.change(
    screen.getByRole("combobox", { name: "Registros por página" }),
    { target: { value: "25" } },
  );
  await waitFor(() => expect(lastParams().get("limit")).toBe("25"));
  expect(lastParams().get("offset")).toBe("0");
  await user.click(screen.getByRole("button", { name: /Columnas visibles/ }));
  await user.click(screen.getByRole("checkbox", { name: "Empresa" }));
  expect(
    screen.queryByRole("columnheader", { name: "Empresa" }),
  ).not.toBeInTheDocument();
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(3);
}, 15000);
it.each([502, 503])(
  "shows a safe error for %s and retries the same applied request",
  async (status) => {
    vi.mocked(httpClient.getWithMeta).mockRejectedValueOnce(
      new ApiError(status, "private infrastructure detail", null),
    );
    mount();
    dates();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo consultar el informe. La fuente de datos no está disponible. Intenta de nuevo.",
    );
    expect(
      screen.queryByText(/private infrastructure/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("PAGADO")).toBeVisible();
    expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2);
  },
);
it("enables Limpiar only when there is something to clear and shows a spinner while consulting", async () => {
  let resolve!: (value: { data: never[]; headers: Headers }) => void;
  vi.mocked(httpClient.getWithMeta).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  mount();
  const clear = screen.getByRole("button", { name: "Limpiar" });
  expect(clear).toBeDisabled();
  expect(
    screen.queryByText(/no se restringe la sede o la empresa/),
  ).not.toBeInTheDocument();
  dates();
  expect(clear).toBeEnabled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  const busy = await screen.findByRole("button", { name: "Consultando…" });
  expect(busy).toBeDisabled();
  expect(busy).toHaveAttribute("aria-busy", "true");
  resolve({ data: [], headers: new Headers({ "X-Total-Count": "0" }) });
  expect(
    await screen.findByRole("button", { name: "Consultar" }),
  ).toBeEnabled();
  fireEvent.click(clear);
  expect(clear).toBeDisabled();
});
it("retries catalog failures inline and shows an empty successful result", async () => {
  vi.mocked(httpClient.get).mockRejectedValueOnce(new Error("internal"));
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({
    data: [],
    headers: new Headers({ "X-Total-Count": "0" }),
  });
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "No se pudieron cargar las sedes.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Reintentar Sede" }));
  await filterReady(/Sede/);
  dates("2026-01-01", "2026-01-01");
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText("No hay facturas para este período.")).toBeVisible();
  expect(screen.queryByText(/registros encontrados/)).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 0 a 0 de 0 registros");
  expect(screen.getByText("No hay facturas para este período.")).toBeVisible();
});
