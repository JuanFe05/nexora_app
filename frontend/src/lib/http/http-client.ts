import { env } from "../../config/env";
import { ApiError } from "./api-error";

const RESPONSE_ERROR = "No se pudo completar la solicitud.";
const NETWORK_ERROR = "No se pudo conectar con el servidor.";

export type HttpOptions = Omit<RequestInit, "method" | "body" | "credentials"> & {
  body?: unknown;
};

type HttpClientConfig = {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
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

export function createHttpClient({ baseUrl, getAccessToken, fetchImpl }: HttpClientConfig) {
  async function request<T>(method: string, path: string, options: HttpOptions = {}): Promise<T> {
    const { body, headers: extraHeaders, ...rest } = options;
    const headers = new Headers(extraHeaders);
    headers.set("Accept", "application/json");
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const token = getAccessToken?.();
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
    if (response.status === 204 && response.ok) return undefined as T;

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new ApiError(response.status, RESPONSE_ERROR, null);
    }
    if (!response.ok) throw new ApiError(response.status, errorDetail(result), result);
    return result as T;
  }

  return {
    get: <T>(path: string, options?: HttpOptions) => request<T>("GET", path, options),
    post: <T>(path: string, options?: HttpOptions) => request<T>("POST", path, options),
    put: <T>(path: string, options?: HttpOptions) => request<T>("PUT", path, options),
    patch: <T>(path: string, options?: HttpOptions) => request<T>("PATCH", path, options),
    delete: <T>(path: string, options?: HttpOptions) => request<T>("DELETE", path, options),
  };
}

export const httpClient = createHttpClient({ baseUrl: env.apiBaseUrl });
