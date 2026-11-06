type PublicEnv = {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_NAME?: string;
};

export function parseEnv(values: PublicEnv) {
  const apiBaseUrl = values.VITE_API_BASE_URL ?? "/api/v1";
  if (!/^(\/|https?:\/\/)/.test(apiBaseUrl)) {
    throw new Error("VITE_API_BASE_URL debe comenzar con '/' o 'http(s)://'.");
  }
  return Object.freeze({
    apiBaseUrl,
    appName: values.VITE_APP_NAME ?? "NEXORA",
  });
}

export const env = parseEnv(import.meta.env);
