import { env } from "@/config/env";
import { createHttpClient } from "@/lib/http/http-client";
import type { SerLaboralReport } from "../types";

/** Feature-local raw-body transport; reuse HTTP auth/retry/error invariants without changing JSON callers. */
export async function uploadSerLaboral(file: File, signal?: AbortSignal) {
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
      headers.set("Content-Type", "text/csv");
      return globalThis.fetch(url, { ...init, headers, body: file });
    },
  });
  return client.post<SerLaboralReport>("/statistics/administrative/general-consumption/ser-laboral", { signal });
}
