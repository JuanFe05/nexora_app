import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { sivigilaApi } from "./sivigila-api";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const path = "/statistics/administrative/sivigila";

it("loads the three dedicated catalogs with cancellation", async () => {
  const signal = new AbortController().signal;
  const items = [{ id: 7, nombre: "Catálogo ficticio" }];
  vi.mocked(httpClient.get).mockResolvedValue(items);
  for (const [fetcher, endpoint] of [[sivigilaApi.fetchSites, "sites"], [sivigilaApi.fetchCompanies, "companies"], [sivigilaApi.fetchProductLines, "product-lines"]] as const) {
    expect(await fetcher(signal)).toEqual(items);
    expect(httpClient.get).toHaveBeenLastCalledWith(`${path}/filters/${endpoint}`, { signal });
  }
  expect(httpClient.get).toHaveBeenCalledTimes(3);
});

it.each([{ ids: [] }, { ids: [7] }, { ids: [7, 8] }])("fetches one report with dates, repeated filters $ids and cancellation", async ({ ids }) => {
  const signal = new AbortController().signal;
  const report = { titulo: "NOTIFICACIÓN SEDE FICTICIA" };
  vi.mocked(httpClient.get).mockResolvedValue(report);
  expect(await sivigilaApi.fetchReport({ startDate: "2026-01-01", endDate: "2026-01-31", sites: ids, companies: ids, productLines: ids }, signal)).toBe(report);
  expect(httpClient.get).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(httpClient.get).mock.calls[0];
  expect(url.split("?")[0]).toBe(path);
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.getAll("fecha_inicial")).toEqual(["2026-01-01"]);
  expect(params.getAll("fecha_final")).toEqual(["2026-01-31"]);
  for (const key of ["sedes", "empresas", "lineas"]) expect(params.getAll(key)).toEqual(ids.map(String));
  expect(params.has("limit")).toBe(false);
  expect(params.has("offset")).toBe(false);
  expect(options).toEqual({ signal });
});

it.each(["csv", "xlsx"] as const)("downloads a single %s blob with event, columns and repeated filters", async (format) => {
  const signal = new AbortController().signal;
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  expect(await sivigilaApi.download({ startDate: "2026-01-01", endDate: "2026-01-31", sites: [2, 3], companies: [4, 5], productLines: [7, 8] }, "ira", ["no_documento", "grupo", "edad"], format, signal)).toBe(file);
  expect(httpClient.getBlob).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(httpClient.getBlob).mock.calls[0];
  expect(url.split("?")[0]).toBe(`${path}/export`);
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.getAll("formato")).toEqual([format]);
  expect(params.getAll("evento")).toEqual(["ira"]);
  expect(params.getAll("columnas")).toEqual(["no_documento", "grupo", "edad"]);
  expect(params.getAll("sedes")).toEqual(["2", "3"]);
  expect(params.getAll("empresas")).toEqual(["4", "5"]);
  expect(params.getAll("lineas")).toEqual(["7", "8"]);
  expect(params.get("fecha_inicial")).toBe("2026-01-01");
  expect(params.get("fecha_final")).toBe("2026-01-31");
  expect(params.has("limit")).toBe(false);
  expect(params.has("offset")).toBe(false);
  expect(options).toEqual({ signal });
});
