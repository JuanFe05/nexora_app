import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import type { ModeratorFees } from "../types";

const base = "/statistics/administrative/moderator-fees";

export function listModeratorFees(signal?: AbortSignal): Promise<ModeratorFees[]> {
  return httpClient.get<ModeratorFees[]>(base, { signal });
}

export function saveModeratorFees(vigencia: number, importes: number[]): Promise<ModeratorFees> {
  return httpClient.put<ModeratorFees>(`${base}/${vigencia}`, { body: { importes } });
}

export function deleteModeratorFees(vigencia: number): Promise<void> {
  return httpClient.delete<void>(`${base}/${vigencia}`);
}

export function moderatorFeesErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "No se pudo conectar con el servidor.";
    if (error.status === 401) return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    if ([403, 404, 409, 422].includes(error.status)) return error.detail;
  }
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}
