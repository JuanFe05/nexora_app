import { httpClient } from "../../../lib/http/http-client";
import type { LoginInput, LoginResponse, MeResponse, TokenResponse } from "../types";

function csrfHeaders(): HeadersInit {
  const cookie = typeof document === "undefined" ? "" : document.cookie;
  const value = cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("nexora_csrf_token="))?.slice("nexora_csrf_token=".length);
  if (!value) return {};
  try {
    return { "X-CSRF-Token": decodeURIComponent(value) };
  } catch {
    return {};
  }
}

export function createAuthApi(client = httpClient) {
  return {
    login: (input: LoginInput) => client.post<LoginResponse>("/auth/login", { body: input }),
    refresh: () => client.post<TokenResponse>("/auth/refresh", { headers: csrfHeaders(), signal: AbortSignal.timeout(10_000) }),
    logout: () => client.post<void>("/auth/logout", { headers: csrfHeaders() }),
    logoutAll: () => client.post<void>("/auth/logout-all", { headers: csrfHeaders() }),
    me: () => client.get<MeResponse>("/auth/me"),
  };
}

export const authApi = createAuthApi();
export type AuthApi = ReturnType<typeof createAuthApi>;
