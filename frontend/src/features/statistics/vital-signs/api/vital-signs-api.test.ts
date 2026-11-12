import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { fetchSites, fetchCompanies, fetchProductLines, fetchVitalSigns, downloadVitalSigns } from "./vital-signs-api";
vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
it("loads each dedicated catalog with cancellation", async () => {
  const signal = new AbortController().signal;
  const items = [{ id: 7, nombre: "Catálogo ficticio" }];
  vi.mocked(httpClient.get).mockResolvedValue(items);
  for (const [fetcher, endpoint] of [[fetchSites, "sites"], [fetchCompanies, "companies"], [fetchProductLines, "product-lines"]] as const) {
    expect(await fetcher(signal)).toEqual(items);
    expect(httpClient.get).toHaveBeenLastCalledWith(`/statistics/reports/vital-signs/filters/${endpoint}`, { signal });
  }
});
it.each([{ ids: [] }, { ids: [7] }, { ids: [7, 8] }])("passes dates, repeated filters $ids, pagination, total and cancellation", async ({ ids }) => {
  const signal = new AbortController().signal;
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "123" }) });
  expect(await fetchVitalSigns({ startDate: "2026-01-01", endDate: "2026-01-31", sites: ids, companies: ids, productLines: ids }, { limit: 25, offset: 50, signal })).toEqual({ items: [], total: 123 });
  const [url, options] = vi.mocked(httpClient.getWithMeta).mock.calls[0];
  expect(url.split("?")[0]).toBe("/statistics/reports/vital-signs");
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
  for (const key of ["sedes", "empresas", "lineas"]) expect(params.getAll(key)).toEqual(ids.map(String));
  expect(params.get("limit")).toBe("25");
  expect(params.get("offset")).toBe("50");
  expect(options).toEqual({ signal });
});
it.each(["csv", "xlsx"] as const)("downloads a single %s blob without pagination", async (format) => {
  const signal = new AbortController().signal;
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  expect(await downloadVitalSigns({ startDate: "2026-01-01", endDate: "2026-01-31", sites: [2], companies: [3], productLines: [7, 8] }, [{ id: "nmro_idntfccn", type: "text" }, { id: "teléfono", type: "text" }, { id: "pso", type: "number" }], format, signal)).toBe(file);
  const [url, options] = vi.mocked(httpClient.getBlob).mock.calls[0];
  expect(url.split("?")[0]).toBe("/statistics/reports/vital-signs/export");
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.getAll("formato")).toEqual([format]);
  expect(params.getAll("columnas")).toEqual(["nmro_idntfccn:text", "teléfono:text", "pso:number"]);
  expect(params.getAll("sedes")).toEqual(["2"]);
  expect(params.getAll("empresas")).toEqual(["3"]);
  expect(params.getAll("lineas")).toEqual(["7", "8"]);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
  expect(params.has("limit")).toBe(false);
  expect(params.has("offset")).toBe(false);
  expect(options).toEqual({ signal });
});
