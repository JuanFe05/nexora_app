import { beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { managementSecretariatApi } from "./management-secretariat-api";

vi.mock("@/lib/http/http-client", () => ({
  httpClient: { get: vi.fn(), getWithMeta: vi.fn(), getBlob: vi.fn() },
}));

beforeEach(() => vi.resetAllMocks());
const filters = { startDate: "2026-01-01", endDate: "2026-01-31", sites: [], companies: [], productLines: [] };

it("uses the same literal search for the server page and full filtered export", async () => {
  const signal = new AbortController().signal;
  vi.mocked(httpClient.getWithMeta).mockResolvedValue({ data: [], headers: new Headers({ "X-Total-Count": "0" }) });
  vi.mocked(httpClient.getBlob).mockResolvedValue(new Blob(["ok"]));
  await managementSecretariatApi.fetchPage(filters, { q: "  0007  ", limit: 25, offset: 0, signal });
  await managementSecretariatApi.download(filters, [{ id: "factura", type: "text" }], "csv", signal, "0007");
  const pageUrl = vi.mocked(httpClient.getWithMeta).mock.calls[0][0];
  const exportUrl = vi.mocked(httpClient.getBlob).mock.calls[0][0];
  expect(new URLSearchParams(pageUrl.split("?")[1]).get("buscar")).toBe("0007");
  expect(new URLSearchParams(exportUrl.split("?")[1]).get("buscar")).toBe("0007");
  expect(new URLSearchParams(exportUrl.split("?")[1]).has("offset")).toBe(false);
});
