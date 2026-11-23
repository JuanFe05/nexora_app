import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { generalConsumptionExportColumns } from "../columns";
import { generalConsumptionApi } from "./general-consumption-api";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), getBlob: vi.fn(), post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
const path = "/statistics/administrative/general-consumption";
const filters = { startDate: "2026-01-01", endDate: "2026-01-31", sites: [7, 8], companies: [9], productLines: [10, 11] };
const signal = new AbortController().signal;

it("reuses the three report catalogs and cancellation", async () => {
  vi.mocked(httpClient.get).mockResolvedValue([]);
  for (const [fetcher, catalog] of [[generalConsumptionApi.fetchSites, "sites"], [generalConsumptionApi.fetchCompanies, "companies"], [generalConsumptionApi.fetchProductLines, "product-lines"]] as const) {
    expect(await fetcher(signal)).toEqual([]);
    expect(httpClient.get).toHaveBeenLastCalledWith(`${path}/filters/${catalog}`, { signal });
  }
  expect(httpClient.get).toHaveBeenCalledTimes(3);
});

it("gets one complete report with repeated filters and without pagination", async () => {
  const report = { indicadores: [], facturas: [], admisiones: [], advertencias: [], total_facturas: 0, total_admisiones: 0 };
  vi.mocked(httpClient.get).mockResolvedValue(report);
  expect(await generalConsumptionApi.fetchReport(filters, signal)).toBe(report);
  expect(httpClient.get).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(httpClient.get).mock.calls[0];
  expect(url.split("?")[0]).toBe(path);
  const params = new URLSearchParams(url.split("?")[1]);
  expect([...params.entries()]).toEqual([["fecha_inicial", filters.startDate], ["fecha_final", filters.endDate], ["sedes", "7"], ["sedes", "8"], ["empresas", "9"], ["lineas", "10"], ["lineas", "11"]]);
  expect(options).toEqual({ signal });
});

it.each(["csv", "xlsx"] as const)("downloads one combined %s with all 40 unified columns and filter serialization", async (format) => {
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.getBlob).mockResolvedValue(file);
  expect(await generalConsumptionApi.download(filters, generalConsumptionExportColumns, format, signal)).toBe(file);
  expect(httpClient.getBlob).toHaveBeenCalledTimes(1);
  const [url, options] = vi.mocked(httpClient.getBlob).mock.calls[0];
  expect(url.split("?")[0]).toBe(`${path}/export`);
  const params = new URLSearchParams(url.split("?")[1]);
  expect(params.get("formato")).toBe(format);
  expect(params.getAll("columnas")).toEqual(generalConsumptionExportColumns.map(({ id, type }) => `${id}:${type}`));
  expect(params.getAll("sedes")).toEqual(["7", "8"]);
  expect(params.getAll("empresas")).toEqual(["9"]);
  expect(params.getAll("lineas")).toEqual(["10", "11"]);
  expect(params.get("fecha_inicial")).toBe(filters.startDate);
  expect(params.get("fecha_final")).toBe(filters.endDate);
  expect(params.has("limit")).toBe(false);
  expect(params.has("offset")).toBe(false);
  expect(options).toEqual({ signal });
});

it.each(["csv", "xlsx"] as const)("includes the optional Ser Laboral token in combined %s exports", async (format) => {
  await generalConsumptionApi.download(filters, generalConsumptionExportColumns, format, signal, "opaque-token");
  const params = new URLSearchParams(vi.mocked(httpClient.getBlob).mock.calls[0][0].split("?")[1]);
  expect(params.get("ser_laboral_id")).toBe("opaque-token");
  expect(params.getAll("columnas")).toHaveLength(40);
});

it.each(["pdf", "xlsx"] as const)("POSTs only indicators for analysis %s", async (format) => {
  const file = new Blob(["synthetic"]);
  vi.mocked(httpClient.post).mockResolvedValue(file);
  const indicadores = [{ clave: "venta_particular", etiqueta: "Total Venta Particular", valor: 1234567 }];
  expect(await generalConsumptionApi.exportAnalysis(indicadores, format, signal)).toBe(file);
  expect(httpClient.post).toHaveBeenCalledExactlyOnceWith(`${path}/export/analysis/${format}`, { body: { indicadores }, responseType: "blob", signal });
  expect(httpClient.get).not.toHaveBeenCalled();
  expect(httpClient.getBlob).not.toHaveBeenCalled();
});
