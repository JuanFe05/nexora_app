import type { AuthApi } from "../api/auth-api";
import type { AuthState, LoginInput } from "../types";
import type { createTokenStore } from "./token-store";

// The session controller is independent of React, so refresh and HTTP recovery share one flight.
export function createAuthSession(api: AuthApi, store: ReturnType<typeof createTokenStore>) {
  let state: AuthState = { status: "loading", user: null, roles: [], permissions: [] };
  const listeners = new Set<() => void>();
  let generation = 0;
  let refreshFlight: Promise<void> | null = null;
  let restoreFlight: Promise<void> | null = null;

  function publish(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function clear() {
    store.clear();
    publish({ status: "anonymous", user: null, roles: [], permissions: [] });
  }

  async function loadPrincipal(current: number, token: string) {
    if (current !== generation) throw new Error("Sesión cancelada");
    store.setAccessToken(token);
    const principal = await api.me();
    if (current !== generation) throw new Error("Sesión cancelada");
    publish({ status: "authenticated", user: principal.usuario, roles: principal.roles, permissions: principal.permisos });
  }

  function refresh(): Promise<void> {
    if (refreshFlight) return refreshFlight;
    // Once anonymous, only an explicit login can establish a new session.
    if (state.status === "anonymous") return Promise.reject(new Error("Sesión no disponible"));
    const current = generation;
    refreshFlight = (async () => {
      try {
        const result = await api.refresh();
        await loadPrincipal(current, result.access_token);
      } catch (error) {
        if (current === generation) clear();
        throw error;
      } finally {
        refreshFlight = null;
      }
    })();
    return refreshFlight;
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
    restore: () => {
      restoreFlight ??= refresh().catch(() => undefined);
      return restoreFlight;
    },
    login: async (input: LoginInput) => {
      const current = ++generation;
      clear();
      try {
        // Finish a previous cookie rotation before starting another authentication operation.
        await refreshFlight?.catch(() => undefined);
        if (current !== generation) return;
        const result = await api.login(input);
        await loadPrincipal(current, result.access_token);
      } catch (error) {
        if (current === generation) clear();
        throw error;
      }
    },
    logout: async () => {
      ++generation;
      clear();
      try {
        await refreshFlight?.catch(() => undefined);
        await api.logout();
      } catch {
        // Local logout is unconditional, including when the server is unavailable.
      }
    },
    hasPermission: (permission: string) => state.status === "authenticated" && state.permissions.includes(permission),
  };
}
