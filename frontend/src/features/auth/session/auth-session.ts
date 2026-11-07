import { ApiError } from "../../../lib/http/api-error";
import type { AuthApi } from "../api/auth-api";
import type { AuthState, LoginInput, MeResponse, TokenResponse } from "../types";
import type { createTokenStore } from "./token-store";
import { warnRefreshFailure } from "./refresh-diagnostics";

function jwtExpiresAt(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")));
    if (!claims || typeof claims !== "object" || !("exp" in claims)
      || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp < 0) return undefined;
    const expiry = claims.exp * 1000;
    return Number.isFinite(expiry) ? expiry : undefined;
  } catch { return undefined; }
}

type RefreshLocks = { request: (name: string, callback: () => Promise<void>) => Promise<void> };
type LogoutChannel = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (data: unknown) => void;
  close: () => void;
};
type SessionOptions = {
  locks?: RefreshLocks | null;
  createChannel?: () => LogoutChannel | undefined;
};

// React-free: HTTP recovery, proactive renewal and principal reads share one flight.
export function createAuthSession(api: AuthApi, store: ReturnType<typeof createTokenStore>, options: SessionOptions = {}) {
  let state: AuthState = { status: "loading", user: null, roles: [], permissions: [] };
  const listeners = new Set<() => void>();
  const expiredListeners = new Set<() => void>();
  let generation = 0;
  let refreshRevision = 0;
  let refreshFlight: Promise<void> | null = null;
  let restoreFlight: Promise<void> | null = null;
  let principalFlight: Promise<void> | null = null;
  let principalRevision = 0;
  let lastFocusReload = -Infinity;
  let lastForbiddenReload = -Infinity;
  let forbiddenTimer: ReturnType<typeof setTimeout> | undefined;
  const reloadInterval = 30_000;
  let expiresAt = Infinity;
  let renewalFailures = 0;
  let active = false;
  let lastActivity = -Infinity;
  let renewalTimer: ReturnType<typeof setTimeout> | undefined;
  let startWatch: (() => void) | undefined;
  let stopWatch: (() => void) | undefined;
  let channel: LogoutChannel | undefined;
  const pendingWaits = new Set<() => void>();

  function cancelPendingRefresh() {
    ++refreshRevision;
    pendingWaits.forEach((done) => done());
  }

  function cancelForbiddenReload() {
    clearTimeout(forbiddenTimer);
    forbiddenTimer = undefined;
  }

  function cancelRenewal() {
    clearTimeout(renewalTimer);
    renewalTimer = undefined;
  }

  function scheduleRenewal() {
    cancelRenewal();
    if (!stopWatch || state.status !== "authenticated" || !Number.isFinite(expiresAt)
      || (renewalFailures > 0 && (!active || Date.now() >= expiresAt))) return;
    renewalTimer = setTimeout(() => {
      renewalTimer = undefined;
      if (active && (renewalFailures === 0 || Date.now() < expiresAt)) void refresh().catch(() => undefined);
    }, renewalFailures > 0
      ? Math.min(15_000 * 2 ** Math.min(renewalFailures - 1, 2), Math.max(0, expiresAt - Date.now()))
      : Math.max(0, expiresAt - Date.now() - 30_000));
  }

  function onActivity() {
    if (state.status !== "authenticated") return;
    // The first activity after renewal must not be lost to the previous cycle's throttle.
    if (active && Date.now() - lastActivity < 1000) return;
    lastActivity = Date.now();
    active = true;
    if (!refreshFlight && renewalTimer === undefined) scheduleRenewal();
  }

  function acceptToken(result: TokenResponse) {
    store.setAccessToken(result.access_token);
    expiresAt = typeof result.expires_in === "number" && Number.isFinite(result.expires_in) && result.expires_in >= 0
      && Number.isFinite(Date.now() + result.expires_in * 1000)
      ? Date.now() + result.expires_in * 1000
      // This is a scheduling estimate, not a token lifetime or an authorization verdict.
      : jwtExpiresAt(result.access_token) ?? Date.now() + 510_000;
  }

  function broadcastLogout() {
    try { channel?.postMessage({ type: "logout" }); } catch { /* Optional cross-tab transport. */ }
  }

  async function retryTransient<T>(operation: () => Promise<T>, current: number, revision: number, definitive: (error: unknown) => boolean): Promise<T> {
    for (let attempt = 0; ; ++attempt) {
      if (current !== generation) throw new Error("Sesión cancelada");
      if (revision !== refreshRevision) throw new ApiError(0, "Renovación interrumpida. Intenta de nuevo.", null);
      try { return await operation(); } catch (error) {
        if (current !== generation || definitive(error)) throw error;
        if (attempt === 2) throw error;
        await new Promise<void>((resolve) => {
          const done = () => { clearTimeout(timer); pendingWaits.delete(done); resolve(); };
          const timer = setTimeout(done, attempt === 0 ? 250 : 500);
          pendingWaits.add(done);
        });
      }
    }
  }

  function publishPrincipal(principal: MeResponse) {
    ++principalRevision;
    startWatch?.();
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
    // Invalidate every pending read/rotation before publishing an anonymous principal.
    ++generation;
    ++principalRevision;
    cancelRenewal();
    pendingWaits.forEach((done) => done());
    stopWatch?.();
    active = false;
    expiresAt = Infinity;
    renewalFailures = 0;
    lastActivity = -Infinity;
    store.clear();
    principalFlight = null;
    cancelForbiddenReload();
    lastFocusReload = -Infinity;
    lastForbiddenReload = -Infinity;
    publish({ status: "anonymous", user: null, roles: [], permissions: [] });
  }

  async function loadPrincipal(current: number, result: TokenResponse, renewing = false, revision = refreshRevision) {
    if (current !== generation) throw new Error("Sesión cancelada");
    acceptToken(result);
    const principal = renewing
      ? await retryTransient(api.me, current, revision, (error) => error instanceof ApiError && error.status === 401)
      : await api.me();
    if (current !== generation) throw new Error("Sesión cancelada");
    publishPrincipal(principal);
    renewalFailures = 0;
    scheduleRenewal();
  }

  function refresh(): Promise<void> {
    if (refreshFlight) return refreshFlight;
    // Once anonymous, only an explicit login can establish a new session.
    if (state.status === "anonymous") return Promise.reject(new Error("Sesión no disponible"));
    const current = generation;
    const revision = refreshRevision;
    cancelRenewal();
    // Successful renewal consumes prior activity; failures retain it for bounded recovery.
    const hadActivity = active;
    active = false;
    const rotate = async () => {
      if (current !== generation) throw new Error("Sesión cancelada");
      let refreshing = true;
      try {
        const result = await retryTransient(api.refresh, current, revision,
          (error) => error instanceof ApiError && (error.status === 401 || error.status === 403));
        refreshing = false;
        await loadPrincipal(current, result, true, revision);
      } catch (error) {
        const invalid = error instanceof ApiError && (error.status === 401 || (refreshing && error.status === 403));
        if (current === generation && revision === refreshRevision) {
          warnRefreshFailure(error, invalid);
          if (invalid) {
            broadcastLogout();
            clear();
            expiredListeners.forEach((listener) => listener());
          } else {
            renewalFailures = Math.min(renewalFailures + 1, 3);
            active ||= hadActivity;
            scheduleRenewal();
          }
        }
        if (invalid || current !== generation) throw error;
        throw new ApiError(0, "No se pudo renovar la sesión. Intenta de nuevo.", null);
      }
    };
    refreshFlight = (async () => {
      try {
        const locks = options.locks === undefined
          ? (typeof navigator === "undefined" ? undefined : navigator.locks) : options.locks;
        if (locks) await locks.request("nexora-auth-refresh", rotate);
        else await rotate();
      } catch (error) {
        if (error instanceof ApiError || current !== generation) throw error;
        throw new ApiError(0, "No se pudo renovar la sesión. Intenta de nuevo.", null);
      }
    })().finally(() => { refreshFlight = null; });
    return refreshFlight;
  }

  // /auth/me bypasses HTTP's 401 retry. Network/403 failures remain non-destructive.
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
    stopWatch?.();
    const events = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"];
    const onVisible = () => {
      if (state.status !== "authenticated" || document.visibilityState !== "visible") return;
      // Focus must not bypass a pending transient backoff or revive an expired retry cycle.
      if (renewalFailures > 0) return;
      if (expiresAt - Date.now() <= 30_000) {
        // A focus event alone must not renew an idle tab through /me's 401 recovery.
        if (active) void refresh().catch(() => undefined);
        return;
      }
      if (Date.now() - lastFocusReload < reloadInterval) return;
      lastFocusReload = Date.now();
      void reloadPrincipal();
    };
    const start = () => {
      if (stopWatch) return;
      try {
        channel = options.createChannel ? options.createChannel()
          : typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("nexora-auth-session");
        if (channel) channel.onmessage = ({ data }) => {
          if (data && typeof data === "object" && "type" in data && data.type === "logout") clear();
        };
      } catch { channel = undefined; }
      target.addEventListener("focus", onVisible);
      document.addEventListener("visibilitychange", onVisible);
      events.forEach((event) => target.addEventListener(event, onActivity, { passive: true, capture: true }));
      stopWatch = () => {
        cancelPendingRefresh();
        target.removeEventListener("focus", onVisible);
        document.removeEventListener("visibilitychange", onVisible);
        events.forEach((event) => target.removeEventListener(event, onActivity, true));
        if (channel) { channel.onmessage = null; channel.close(); channel = undefined; }
        cancelRenewal();
        cancelForbiddenReload();
        stopWatch = undefined;
      };
    };
    startWatch = start;
    if (state.status === "authenticated") { start(); scheduleRenewal(); }
    return () => {
      if (startWatch !== start) return;
      if (stopWatch) stopWatch();
      else cancelPendingRefresh();
      startWatch = undefined;
    };
  }

  return {
    getSnapshot: () => state,
    onActivity,
    subscribeExpired: (listener: () => void) => {
      expiredListeners.add(listener);
      return () => { expiredListeners.delete(listener); };
    },
    reloadPrincipal,
    onForbidden,
    watchPrincipal,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
    restore: () => {
      const revision = refreshRevision;
      restoreFlight ??= refresh().catch(async () => {
        // StrictMode can remount while the first restoration is being cancelled.
        if (state.status === "loading" && revision !== refreshRevision && startWatch) {
          await refresh().catch(() => undefined);
        }
        // A transient/cancelled restoration is not a permanent anonymous verdict.
        if (state.status === "loading") restoreFlight = null;
      });
      return restoreFlight;
    },
    login: async (input: LoginInput) => {
      clear();
      const current = generation;
      try {
        // Finish a previous cookie rotation before starting another authentication operation.
        await refreshFlight?.catch(() => undefined);
        if (current !== generation) return;
        const result = await api.login(input);
        await loadPrincipal(current, result);
      } catch (error) {
        if (current === generation) clear();
        throw error;
      }
    },
    logoutAll: async () => {
      const current = generation;
      await refreshFlight?.catch(() => undefined);
      if (current !== generation) throw new Error("Sesión cancelada");
      await api.logoutAll();
      if (current === generation) { broadcastLogout(); clear(); }
    },
    logout: async () => {
      broadcastLogout();
      clear();
      try {
        await refreshFlight?.catch(() => undefined);
        await api.logout();
      } catch {
        // Local logout remains unconditional, including when the server is unavailable.
      }
    },
    hasPermission: (permission: string) => state.status === "authenticated" && state.permissions.includes(permission),
  };
}
