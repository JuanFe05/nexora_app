import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import {
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
