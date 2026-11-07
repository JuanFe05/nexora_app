import { ApiError } from "../../../lib/http/api-error";
import { hasCsrfCookie } from "../api/auth-api";

// Never print backend text: even a short detail can contain credentials.
export function warnRefreshFailure(error: unknown, terminal: boolean) {
  if (!import.meta.env.DEV) return;
  const status = error instanceof ApiError ? error.status : 0;
  const detail = error instanceof ApiError && error.detail.length <= 100 ? error.detail.toLowerCase().trim().replace(/\.$/, "") : "";
  const originDenied = terminal && ["origin not allowed", "origin no permitido", "origen no permitido"].includes(detail);
  const csrfDenied = terminal && (status === 403 || ["solicitud sin token csrf valido", "falta la cookie csrf"].includes(detail));
  const cause = originDenied ? "origen no permitido"
    : csrfDenied && !hasCsrfCookie() ? "se perdió la cookie CSRF"
    : terminal ? "sesión inválida/expirada" : "red";
  console.warn(`[auth] refresh failed: status=${status || "network"} classification=${terminal ? "terminal" : "transient"} cause=${cause}`);
}
