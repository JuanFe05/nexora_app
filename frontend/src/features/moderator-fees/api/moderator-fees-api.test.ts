import { afterEach, expect, it, vi } from "vitest";
import { httpClient } from "@/lib/http/http-client";
import { ApiError } from "@/lib/http/api-error";
import { deleteModeratorFees, listModeratorFees, moderatorFeesErrorMessage, saveModeratorFees } from "./moderator-fees-api";

afterEach(() => vi.restoreAllMocks());
const base = "/statistics/administrative/moderator-fees";
const row = { vigencia: 2026, importes: [5000], actualizado_por: null, actualizado_en: "2026-03-01T12:00:00Z" };
it("lists the API array using the shared authenticated client", async () => {
  const get = vi.spyOn(httpClient, "get").mockResolvedValue([row]);
  const signal = new AbortController().signal;
  expect(await listModeratorFees(signal)).toEqual([row]);
  expect(get).toHaveBeenCalledExactlyOnceWith(base, { signal });
});
it("upserts using PUT and sends only the importes body", async () => {
  const put = vi.spyOn(httpClient, "put").mockResolvedValue(row);
  expect(await saveModeratorFees(2026, [5000])).toEqual(row);
  expect(put).toHaveBeenCalledExactlyOnceWith(`${base}/2026`, { body: { importes: [5000] } });
});
it("deletes the vigencia and handles 204 through the shared client", async () => {
  const remove = vi.spyOn(httpClient, "delete").mockResolvedValue(undefined);
  expect(await deleteModeratorFees(2026)).toBeUndefined();
  expect(remove).toHaveBeenCalledExactlyOnceWith(`${base}/2026`);
});
it.each([403, 404, 422])("preserves Spanish backend detail for %s", status => {
  expect(moderatorFeesErrorMessage(new ApiError(status, "Mensaje del servidor.", null))).toBe("Mensaje del servidor.");
});
it("uses safe network/session/unexpected error messages", () => {
  expect(moderatorFeesErrorMessage(new ApiError(0, "network", null))).toBe("No se pudo conectar con el servidor.");
  expect(moderatorFeesErrorMessage(new ApiError(401, "Unauthorized", null))).toBe("Tu sesión ha caducado. Vuelve a iniciar sesión.");
  expect(moderatorFeesErrorMessage(new Error("internal"))).toBe("No se pudo completar la operación. Inténtalo de nuevo.");
});
