// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { generalConsumptionApi } from "./general-consumption-api";

vi.mock("@/features/auth/session/session", () => ({ authSession: { refresh: vi.fn(), onForbidden: vi.fn(), onActivity: vi.fn(), onServerActivity: vi.fn() } }));
vi.mock("@/features/auth/session/token-store", () => ({ tokenStore: { getAccessToken: () => "synthetic-access" } }));
afterEach(() => vi.unstubAllGlobals());

it("POSTs the raw File as text/csv, with credentials and authentication, and returns the API result", async () => {
  const result = { ser_laboral_id: "opaque-token", filas: [], total: 0, omitidas: 1, advertencias: [] };
  const fetch = vi.fn().mockResolvedValue(Response.json(result));
  vi.stubGlobal("fetch", fetch);
  const file = new File(["estado\nABIERTO"], "ser-laboral.csv", { type: "text/csv" });
  const signal = new AbortController().signal;
  expect(await generalConsumptionApi.uploadSerLaboral(file, signal)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toMatch(/\/statistics\/administrative\/general-consumption\/ser-laboral$/);
  expect(init.method).toBe("POST");
  expect(init.body).toBe(file);
  expect(init.headers.get("Content-Type")).toBe("text/csv");
  expect(init.headers.get("Authorization")).toBe("Bearer synthetic-access");
  expect(init.credentials).toBe("include");
  expect(init.signal).toBe(signal);
});

it.each([422, 413])("preserves the API %s detail", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Detalle CSV" }, { status })));
  await expect(generalConsumptionApi.uploadSerLaboral(new File(["csv"], "test.csv"))).rejects.toEqual(new ApiError(status, "Detalle CSV", { detail: "Detalle CSV" }));
});
