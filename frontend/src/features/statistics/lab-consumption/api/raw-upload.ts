import { env } from "@/config/env";
import { createHttpClient } from "@/lib/http/http-client";
import type { AnnarLabReport, SerLaboralReport } from "../types";

/** Feature-local raw transport, retaining the shared client's auth, refresh and error handling. */
async function upload<T>(file: File, endpoint: string, contentType: string, signal?: AbortSignal) {
  const [{ authSession }, { tokenStore }] = await Promise.all([
    import("@/features/auth/session/session"),
    import("@/features/auth/session/token-store"),
  ]);
  const client = createHttpClient({
    baseUrl: env.apiBaseUrl,
    getAccessToken: tokenStore.getAccessToken,
    refreshSession: authSession.refresh,
    onForbidden: authSession.onForbidden,
    onActivity: authSession.onActivity,
    onServerActivity: authSession.onServerActivity,
    fetchImpl: (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Content-Type", contentType);
      return globalThis.fetch(url, { ...init, headers, body: file });
    },
  });
  return client.post<T>(`/statistics/administrative/lab-consumption/${endpoint}`, { signal });
}
export const uploadSerLaboral = (file: File, signal?: AbortSignal) => upload<SerLaboralReport>(file, "ser-laboral", "text/csv", signal);
export const uploadAnnarLab = (file: File, signal?: AbortSignal) => upload<AnnarLabReport>(file, "annar-lab", file.name.toLowerCase().endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel", signal);
