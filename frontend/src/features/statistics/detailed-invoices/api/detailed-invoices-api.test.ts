import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import {
  downloadDetailedInvoices,
  fetchSites,
  fetchCompanies,
  fetchProductLines,
  fetchDetailedInvoices,
} from "./detailed-invoices-api";
vi.mock("@/lib/http/http-client", () => ({
  httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() },
}));
beforeEach(() => vi.clearAllMocks());
it("loads real catalog ids from the dedicated endpoints with cancellation", async () => {
  const signal = new AbortController().signal;
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 17, nombre: "Sede" }]);
  expect(await fetchSites(signal)).toEqual([{ id: 17, nombre: "Sede" }]);
  await fetchCompanies(signal);
  await fetchProductLines(signal);
  expect(httpClient.get).toHaveBeenCalledWith(
    "/statistics/reports/detailed-invoices/filters/product-lines", { signal },
  );
  expect(httpClient.get).toHaveBeenCalledWith(
    "/statistics/reports/detailed-invoices/filters/sites",
    { signal },
  );
  expect(httpClient.get).toHaveBeenCalledWith(
    "/statistics/reports/detailed-invoices/filters/companies",
    { signal },
  );
});
it("passes inclusive dates, repeated restricted ids, pagination, signal and reads total header", async () => {
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({
    data: [],
    headers: new Headers({ "X-Total-Count": "142" }),
  });
  const signal = new AbortController().signal;
  expect(
    await fetchDetailedInvoices(
      {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        sites: [2, 4],
        companies: [9, 10],
        productLines: [5, 7],
      },
      { limit: 25, offset: 50, signal },
    ),
  ).toEqual({ items: [], total: 142 });
  const [url, options] = vi.mocked(httpClient.getWithMeta).mock.calls[0];
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
  expect(params.getAll("sedes")).toEqual(["2", "4"]);
  expect(params.getAll("empresas")).toEqual(["9", "10"]);
  expect(params.getAll("lineas")).toEqual(["5", "7"]);
  expect(params.get("limit")).toBe("25");
  expect(params.get("offset")).toBe("50");
  expect(options).toEqual({ signal });
});
it("requests one streamed file with filters, columns and a single format, without page limits", async () => {
  const filters = { startDate: "2026-01-01", endDate: "2026-01-31", sites: [2], companies: [], productLines: [5, 7] };
  const signal = new AbortController().signal;
  const file = new Blob(["x"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  expect(
    await downloadDetailedInvoices(
      filters,
      [
        { id: "nmro_dcto", type: "text" },
        { id: "vlr_factrdo", type: "number" },
      ],
      "xlsx",
      signal,
    ),
  ).toBe(file);
  const [url, options] = vi.mocked(httpClient.getBlob).mock.calls[0];
  const params = new URLSearchParams(url.split("?")[1]);
  expect(url.startsWith("/statistics/reports/detailed-invoices/export?")).toBe(true);
  expect(params.getAll("formato")).toEqual(["xlsx"]);
  expect(params.getAll("columnas")).toEqual(["nmro_dcto:text", "vlr_factrdo:number"]);
  expect(params.getAll("sedes")).toEqual(["2"]);
  expect(params.has("empresas")).toBe(false);
  expect(params.getAll("lineas")).toEqual(["5", "7"]);
  expect(params.has("limit")).toBe(false);
  expect(params.has("offset")).toBe(false);
  expect(options).toEqual({ signal });
});
it("omits unrestricted parameters entirely", async () => {
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({
    data: [],
    headers: new Headers(),
  });
  await fetchDetailedInvoices(
    {
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      sites: [],
      companies: [],
      productLines: [],
    },
    { limit: 50, offset: 0, signal: new AbortController().signal },
  );
  const params = new URLSearchParams(
    vi.mocked(httpClient.getWithMeta).mock.calls[0][0].split("?")[1],
  );
  expect(params.has("sedes")).toBe(false);
  expect(params.has("empresas")).toBe(false);
  expect(params.has("lineas")).toBe(false);
});
