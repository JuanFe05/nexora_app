import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import {
  fetchAllDetailedInvoices,
  fetchSites,
  fetchCompanies,
  fetchDetailedInvoices,
} from "./detailed-invoices-api";
vi.mock("@/lib/http/http-client", () => ({
  httpClient: { get: vi.fn(), getWithMeta: vi.fn() },
}));
beforeEach(() => vi.clearAllMocks());
it("loads real catalog ids from the dedicated endpoints with cancellation", async () => {
  const signal = new AbortController().signal;
  vi.mocked(httpClient.get).mockResolvedValue([{ id: 17, nombre: "Sede" }]);
  expect(await fetchSites(signal)).toEqual([{ id: 17, nombre: "Sede" }]);
  await fetchCompanies(signal);
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
  expect(params.get("limit")).toBe("25");
  expect(params.get("offset")).toBe("50");
  expect(options).toEqual({ signal });
});
it("exports every page of the applied query and refuses results above the limit", async () => {
  const filters = { startDate: "2026-01-01", endDate: "2026-01-31", sites: [2], companies: [] };
  const signal = new AbortController().signal;
  const page = (n: number, total: number) => ({
    data: Array.from({ length: n }, (_, i) => ({ nmro_dcto: i })),
    headers: new Headers({ "X-Total-Count": String(total) }),
  });
  vi.mocked(httpClient.getWithMeta)
    .mockResolvedValueOnce(page(100, 230))
    .mockResolvedValueOnce(page(100, 230))
    .mockResolvedValueOnce(page(30, 230));
  expect(await fetchAllDetailedInvoices(filters, signal)).toHaveLength(230);
  const calls = vi.mocked(httpClient.getWithMeta).mock.calls.map(
    ([url]) => new URLSearchParams(url.split("?")[1]),
  );
  expect(calls.map((p) => [p.get("limit"), p.get("offset")])).toEqual([
    ["100", "0"],
    ["100", "100"],
    ["100", "200"],
  ]);
  expect(calls[2].getAll("sedes")).toEqual(["2"]);
  vi.mocked(httpClient.getWithMeta).mockClear();
  vi.mocked(httpClient.getWithMeta).mockResolvedValueOnce(page(100, 20001));
  await expect(fetchAllDetailedInvoices(filters, signal)).rejects.toThrow(/límite/);
  expect(httpClient.getWithMeta).toHaveBeenCalledTimes(1);
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
    },
    { limit: 50, offset: 0, signal: new AbortController().signal },
  );
  const params = new URLSearchParams(
    vi.mocked(httpClient.getWithMeta).mock.calls[0][0].split("?")[1],
  );
  expect(params.has("sedes")).toBe(false);
  expect(params.has("empresas")).toBe(false);
});
