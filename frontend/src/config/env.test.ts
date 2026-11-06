import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("frontend environment", () => {
  it("uses public defaults", () => {
    expect(parseEnv({})).toEqual({ apiBaseUrl: "/api/v1", appName: "NEXORA" });
  });

  it.each(["/api/v2", "https://api.example.test/v1", "http://localhost:45335/api/v1"])(
    "accepts %s and a configured name",
    (baseUrl) => {
      expect(parseEnv({ VITE_API_BASE_URL: baseUrl, VITE_APP_NAME: "Mi aplicación" }))
        .toEqual({ apiBaseUrl: baseUrl, appName: "Mi aplicación" });
    },
  );

  it.each(["api/v1", "ftp://example.test", "", "javascript:alert(1)"])(
    "rejects invalid base URL %s",
    (baseUrl) => {
      expect(() => parseEnv({ VITE_API_BASE_URL: baseUrl })).toThrow(
        "VITE_API_BASE_URL debe comenzar con '/' o 'http(s)://'.",
      );
    },
  );

  it("validates the application export on import", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "invalid");
    vi.resetModules();
    await expect(import("./env")).rejects.toThrow("VITE_API_BASE_URL");
  });
});
