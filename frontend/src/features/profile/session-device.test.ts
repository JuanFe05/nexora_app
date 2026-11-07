import { describe, expect, it } from "vitest";
import { parseSessionDevice } from "./session-device";
describe("session device labels", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36", "Chrome · Windows", "desktop"],
    ["Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0", "Edge · Windows", "desktop"],
    ["Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/123.0", "Firefox · Linux", "desktop"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15", "Safari · macOS", "desktop"],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36", "Chrome · Android", "mobile"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1", "Safari · iOS", "mobile"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) CriOS/120.0 Mobile/15E148 Safari/604.1", "Chrome · iOS", "mobile"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) FxiOS/120.0", "Firefox · iOS", "mobile"],
    ["Mozilla/5.0 (Linux; Android 14) Chrome/120.0 EdgA/120.0", "Edge · Android", "mobile"],
    [null, "Dispositivo desconocido", "unknown"],
    ["garbage", "Dispositivo desconocido", "unknown"],
    ["", "Dispositivo desconocido", "unknown"],
  ])("parses %s", (ua, label, type) => { expect(parseSessionDevice(ua)).toEqual({ label, type }); });
});

describe("hostile input", () => {
  it("parses long hostile user agents in bounded time", () => {
    const hostile = `Version/${"1".repeat(200_000)}`;
    const started = performance.now();
    expect(parseSessionDevice(hostile).type).toBe("unknown");
    expect(performance.now() - started).toBeLessThan(250);
  });
  it("only inspects the first 512 characters", () => {
    const padded = `${"x".repeat(600)} Windows NT 10.0 Chrome/120.0`;
    expect(parseSessionDevice(padded).label).toBe("Dispositivo desconocido");
  });
  it("never returns the raw user agent as the label", () => {
    const ua = "Windows NT Chrome/120 <img src=x onerror=alert(1)>";
    expect(parseSessionDevice(ua).label).toBe("Chrome · Windows");
  });
});
