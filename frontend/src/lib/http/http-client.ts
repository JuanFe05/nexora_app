import { env } from "../../config/env";
import { ApiError } from "./api-error";

const RESPONSE_ERROR = "No se pudo completar la solicitud.";
const NETWORK_ERROR = "No se pudo conectar con el servidor.";

export type HttpOptions = Omit<RequestInit, "method" | "body" | "credentials"> & {
  body?: unknown;
};

export type HttpResult<T> = { data: T; headers: Headers };

type AuthHandlers = {
  getAccessToken?: () => string | null | undefined;
  refreshSession?: () => Promise<void>;
  onForbidden?: () => void | Promise<void>;
  onActivity?: () => void;
  onServerActivity?: () => void;
};

type HttpClientConfig = AuthHandlers & {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

function errorDetail(body: unknown): string {
  if (!body || typeof body !== "object" || !("detail" in body)) {
    return RESPONSE_ERROR;
  }
  if (typeof body.detail === "string") return body.detail;
  if (!Array.isArray(body.detail)) return RESPONSE_ERROR;

  const messages = body.detail.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("msg" in item) || typeof item.msg !== "string") {
      return [];
    }
    const location = "loc" in item && Array.isArray(item.loc)
      ? item.loc.filter((part: unknown) => typeof part === "string" || typeof part === "number").join(".")
      : "";
    return [location ? `${location}: ${item.msg}` : item.msg];
  });
  return messages.join("; ") || RESPONSE_ERROR;
}

export function createHttpClient({ baseUrl, getAccessToken, refreshSession, onForbidden, onActivity, onServerActivity, fetchImpl }: HttpClientConfig) {
  let auth: AuthHandlers = { getAccessToken, refreshSession, onForbidden, onActivity, onServerActivity };

  async function request<T>(method: string, path: string, options: HttpOptions = {}, retried = false): Promise<HttpResult<T>> {
    const isAuthEndpoint = /^auth(?:\/|\?|$)/.test(path.replace(/^\/+/, ""));
    if (!isAuthEndpoint && !retried) auth.onActivity?.();
    const { body, headers: extraHeaders, ...rest } = options;
    const headers = new Headers(extraHeaders);
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const token = auth.getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const url = `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    const init: RequestInit = {
      ...rest,
      method,
      headers,
      credentials: "include",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    };

    let response: Response;
    try {
      response = await (fetchImpl ?? globalThis.fetch)(url, init);
    } catch {
      throw new ApiError(0, NETWORK_ERROR, null);
    }
    if (response.status === 401 && !isAuthEndpoint && !retried && auth.refreshSession) {
      try {
        await auth.refreshSession();
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) throw error;
        throw new ApiError(401, "No autenticado", null, response.headers.get("Retry-After"));
      }
      return request<T>(method, path, options, true);
    }
    if (response.status === 403 && !isAuthEndpoint) {
      try {
        // Notification only: preserve the original error and never retry a forbidden operation.
        void Promise.resolve(auth.onForbidden?.()).catch(() => undefined);
      } catch {
        // A consumer callback must not replace the HTTP error.
      }
    }
    const notifyServerActivity = () => {
      // Ignore anonymous, auth-internal and stale responses from a cleared/rotated bearer.
      if (!isAuthEndpoint && token && token === auth.getAccessToken?.()) auth.onServerActivity?.();
    };
    if (response.status === 204 && response.ok) {
      notifyServerActivity();
      return { data: undefined as T, headers: response.headers };
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(response.status, RESPONSE_ERROR, null, response.headers.get("Retry-After"));
    }
    if (!response.ok) throw new ApiError(response.status, errorDetail(result), result, response.headers.get("Retry-After"));
    notifyServerActivity();
    return { data: result as T, headers: response.headers };
  }

  async function requestData<T>(method: string, path: string, options?: HttpOptions): Promise<T> {
    return (await request<T>(method, path, options)).data;
  }

  return {
    configureAuth: (handlers: AuthHandlers) => { auth = handlers; },
    getWithMeta: <T>(path: string, options?: HttpOptions) => request<T>("GET", path, options),
    get: <T>(path: string, options?: HttpOptions) => requestData<T>("GET", path, options),
    post: <T>(path: string, options?: HttpOptions) => requestData<T>("POST", path, options),
    put: <T>(path: string, options?: HttpOptions) => requestData<T>("PUT", path, options),
    patch: <T>(path: string, options?: HttpOptions) => requestData<T>("PATCH", path, options),
    delete: <T>(path: string, options?: HttpOptions) => requestData<T>("DELETE", path, options),
  };
}

export const httpClient = createHttpClient({ baseUrl: env.apiBaseUrl });
