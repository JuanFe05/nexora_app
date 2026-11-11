// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
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
function dates(start = "2026-01-01", end = "2026-01-31") {
  fireEvent.change(screen.getByLabelText(/Fecha inicial/), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText(/Fecha final/), {
    target: { value: end },
  });
}
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
  await waitFor(() => expect(httpClient.get).toHaveBeenCalledTimes(2));
  dates();
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText("101 registros encontrados")).toBeVisible();
  expect(screen.getByText("PAGADO")).toHaveAttribute("data-variant", "success");
  expect(screen.getByText("02/01/2026")).toBeVisible();
  expect(screen.getByText("1.200")).toBeVisible();
  expect(lastParams().get("fecha_inicial")).toBe("2026-01-01");
  expect(lastParams().has("sedes")).toBe(false);
  expect(lastParams().has("empresas")).toBe(false);
  const count = vi.mocked(httpClient.getWithMeta).mock.calls.length;
  dates("2026-01-02", "2026-01-31");
  await user.click(screen.getByRole("button", { name: /Sede/ }));
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: /Empresa/ }));
  await user.click(screen.getByRole("button", { name: "Seleccionar todas" }));
  await user.keyboard("{Escape}");
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(count);
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await waitFor(() =>
    expect(httpClient.getWithMeta).toHaveBeenCalledTimes(count + 1),
  );
  expect(lastParams().has("sedes")).toBe(false);
  expect(lastParams().has("empresas")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(screen.getByLabelText(/Fecha inicial/)).toHaveValue("");
  expect(screen.getByLabelText(/Fecha final/)).toHaveValue("");
  expect(screen.getAllByText("0 seleccionadas")).toHaveLength(2);
  expect(
    screen.getByText("Selecciona un período y presiona Consultar."),
  ).toBeVisible();
  expect(
    screen.queryByText("101 registros encontrados"),
  ).not.toBeInTheDocument();
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(count + 1);
});
it("sends restricted ids as repeated parameters and uses server pagination without reapplying draft dates", async () => {
  const user = userEvent.setup();
  mount();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Sede/ })).toBeEnabled(),
  );
  dates();
  for (const label of ["Sede", "Empresa"]) {
    await user.click(screen.getByRole("button", { name: new RegExp(label) }));
    await user.click(screen.getByRole("option", { name: "Norte" }));
    await user.click(screen.getByRole("option", { name: "Sur" }));
    await user.keyboard("{Escape}");
  }
  await user.click(screen.getByRole("button", { name: "Consultar" }));
  await screen.findByText("101 registros encontrados");
  expect(lastParams().getAll("sedes")).toEqual(["11", "22"]);
  expect(lastParams().getAll("empresas")).toEqual(["11", "22"]);
  dates("2026-01-20", "2026-01-31");
  await user.click(screen.getByRole("button", { name: "Página siguiente" }));
  await waitFor(() => expect(lastParams().get("offset")).toBe("50"));
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
});
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
    expect(await screen.findByText("101 registros encontrados")).toBeVisible();
    expect(httpClient.getWithMeta).toHaveBeenCalledTimes(2);
  },
);
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
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Sede/ })).toBeEnabled(),
  );
  dates("2026-01-01", "2026-01-01");
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText("0 registros encontrados")).toBeVisible();
  expect(screen.getByText("No hay facturas para este período.")).toBeVisible();
});
