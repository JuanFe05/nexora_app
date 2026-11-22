import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import type { SivigilaReport } from "../types";
import { sivigilaApi } from "./sivigila-api";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn(), post: vi.fn() } }));
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

it.each([["pdf", "exportAnalysisPdf"], ["xlsx", "exportWorkbook"]] as const)("posts the processed report once to render the %s without a new query", async (kind, method) => {
  const signal = new AbortController().signal;
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.post).mockResolvedValue(file);
  const report = { titulo: "NOTIFICACIÓN CORINTO CAUCA", subtitulo: "SEMANA 40 PERIODO 10 2026" } as SivigilaReport;
  expect(await sivigilaApi[method](report, signal)).toBe(file);
  expect(httpClient.post).toHaveBeenCalledTimes(1);
  expect(httpClient.post).toHaveBeenCalledWith(`${path}/export/${kind}`, { body: report, responseType: "blob", signal });
  expect(httpClient.getWithMeta).not.toHaveBeenCalled();
  expect(httpClient.get).not.toHaveBeenCalled();
});
