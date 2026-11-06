import { ApiError } from "../../../lib/http/api-error";
import type { AuthApi } from "../api/auth-api";
import type { AuthState, LoginInput, MeResponse } from "../types";
import type { createTokenStore } from "./token-store";

// The session controller is independent of React, so refresh and HTTP recovery share one flight.
export function createAuthSession(api: AuthApi, store: ReturnType<typeof createTokenStore>) {
  let state: AuthState = { status: "loading", user: null, roles: [], permissions: [] };
  const listeners = new Set<() => void>();
  let generation = 0;
  let refreshFlight: Promise<void> | null = null;
  let restoreFlight: Promise<void> | null = null;
  let principalFlight: Promise<void> | null = null;
  let principalRevision = 0;
  let lastFocusReload = -Infinity;
  let lastForbiddenReload = -Infinity;
  let forbiddenTimer: ReturnType<typeof setTimeout> | undefined;
  const reloadInterval = 30_000;

  function cancelForbiddenReload() {
    clearTimeout(forbiddenTimer);
    forbiddenTimer = undefined;
  }

  function publishPrincipal(principal: MeResponse) {
    ++principalRevision;
    const user = state.user;
    const sameUser = user !== null && (Object.keys(principal.usuario) as (keyof typeof user)[])
      .every((key) => user[key] === principal.usuario[key]);
    const sameCodes = (previous: string[], next: string[]) => previous.length === next.length
      && next.every((code) => previous.includes(code));
    if (state.status === "authenticated" && sameUser
      && sameCodes(state.roles, principal.roles) && sameCodes(state.permissions, principal.permisos)) return;
    publish({ status: "authenticated", user: principal.usuario, roles: principal.roles, permissions: principal.permisos });
  }

  function publish(next: AuthState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  function clear() {
    // Invalidate pending principal reads even when refresh (not explicit logout) clears auth.
    ++principalRevision;
    store.clear();
    principalFlight = null;
    cancelForbiddenReload();
    lastFocusReload = -Infinity;
    lastForbiddenReload = -Infinity;
    publish({ status: "anonymous", user: null, roles: [], permissions: [] });
  }

  async function loadPrincipal(current: number, token: string) {
    if (current !== generation) throw new Error("Sesión cancelada");
    store.setAccessToken(token);
    const principal = await api.me();
    if (current !== generation) throw new Error("Sesión cancelada");
    publishPrincipal(principal);
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

  // /auth/me deliberately bypasses HTTP's automatic 401 retry. Use the same session
  // refresh path here, while keeping transient network/403 failures non-destructive.
  function reloadPrincipal(): Promise<void> {
    if (state.status !== "authenticated") return Promise.resolve();
    if (refreshFlight) return refreshFlight.catch(() => undefined);
    if (principalFlight) return principalFlight;
    const current = generation;
    const revision = principalRevision;
    principalFlight = (async () => {
      try {
        const principal = await api.me();
        if (current === generation && revision === principalRevision) publishPrincipal(principal);
      } catch (error) {
        if (current === generation && error instanceof ApiError && error.status === 401) {
          await refresh().catch(() => undefined);
        }
      } finally {
        if (current === generation) principalFlight = null;
      }
    })();
    return principalFlight;
  }

  function onForbidden() {
    if (state.status !== "authenticated" || Date.now() - lastForbiddenReload < reloadInterval) return;
    cancelForbiddenReload();
    forbiddenTimer = setTimeout(() => {
      forbiddenTimer = undefined;
      lastForbiddenReload = Date.now();
      void reloadPrincipal();
    }, 100);
  }

  function watchPrincipal(target: Window, document: Document) {
    const onVisible = () => {
      if (state.status !== "authenticated" || document.visibilityState !== "visible"
        || Date.now() - lastFocusReload < reloadInterval) return;
      lastFocusReload = Date.now();
      void reloadPrincipal();
    };
    target.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      target.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      cancelForbiddenReload();
    };
  }

  return {
    getSnapshot: () => state,
    reloadPrincipal,
    onForbidden,
    watchPrincipal,
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
