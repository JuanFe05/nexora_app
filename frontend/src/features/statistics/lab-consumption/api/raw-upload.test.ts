// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { labConsumptionApi } from "./lab-consumption-api";
vi.mock("@/features/auth/session/session", () => ({ authSession: { refresh: vi.fn(), onForbidden: vi.fn(), onActivity: vi.fn(), onServerActivity: vi.fn() } }));
vi.mock("@/features/auth/session/token-store", () => ({ tokenStore: { getAccessToken: () => "synthetic-access" } }));
afterEach(() => vi.unstubAllGlobals());
const uploads = [
  { name: "ser-laboral", type: "text/csv", extension: "csv", upload: labConsumptionApi.uploadSerLaboral, result: { ser_laboral_id: "ser-token", filas: [], total: 0, omitidas: 1, advertencias: [] } },
  { name: "annar-lab", type: "application/vnd.ms-excel", extension: "xls", upload: labConsumptionApi.uploadAnnarLab, result: { annar_lab_id: "annar-token", filas: [], total: 0, advertencias: [], analisis_annar: [] } },
] as const;
it.each(uploads)("POSTs $name as a raw authenticated file with the exact Content-Type", async ({ name, type, extension, upload, result }) => {
  const fetch = vi.fn().mockResolvedValue(Response.json(result));
  vi.stubGlobal("fetch", fetch);
  const file = new File(["synthetic"], `test.${extension}`, { type });
  const signal = new AbortController().signal;
  expect(await upload(file, signal)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url).toMatch(new RegExp(`/statistics/administrative/lab-consumption/${name}$`));
  expect(init.method).toBe("POST");
  expect(init.body).toBe(file);
  expect(init.headers.get("Content-Type")).toBe(type);
  expect(init.headers.get("Authorization")).toBe("Bearer synthetic-access");
  expect(init.credentials).toBe("include");
  expect(init.signal).toBe(signal);
});
it("sends XLS binary bytes unchanged even when the browser supplies no MIME type", async () => {
  const result = uploads[1].result;
  const fetch = vi.fn().mockResolvedValue(Response.json(result));
  vi.stubGlobal("fetch", fetch);
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const file = new File([bytes], "ANNAR.XLS");
  expect(file.type).toBe("");
  expect(await labConsumptionApi.uploadAnnarLab(file)).toEqual(result);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [, init] = fetch.mock.calls[0];
  expect(init.method).toBe("POST");
  expect(init.body).toBe(file);
  expect(init.headers.get("Content-Type")).toBe("application/vnd.ms-excel");
  expect(init.headers.get("Authorization")).toBe("Bearer synthetic-access");
});
it.each(uploads)("preserves 422 and 413 detail for $name", async ({ upload, extension }) => {
  for (const status of [422, 413]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "Detalle del archivo" }, { status })));
    await expect(upload(new File(["data"], `test.${extension}`))).rejects.toEqual(new ApiError(status, "Detalle del archivo", { detail: "Detalle del archivo" }));
  }
});
