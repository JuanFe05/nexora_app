export type SessionDevice = { label: string; type: "desktop" | "mobile" | "unknown" };
/** A display hint only, never a device identity or a security decision. */
const MAX_UA_LENGTH = 512;
export function parseSessionDevice(ua: string | null): SessionDevice {
  const unknown: SessionDevice = { label: "Dispositivo desconocido", type: "unknown" };
  if (!ua) return unknown;
  // Entrada acotada: el agente es dato del cliente; evita costes superlineales con cadenas hostiles.
  ua = ua.slice(0, MAX_UA_LENGTH);
  const os = /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Windows NT/i.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "macOS"
    : /Linux|X11/i.test(ua) ? "Linux" : null;
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? "Edge"
    : /Firefox\/|FxiOS\//i.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//i.test(ua) ? "Chrome"
    : /Version\/[\d.]+.*Safari\//i.test(ua) ? "Safari" : null;
  if (!os || !browser) return unknown;
  return { label: `${browser} · ${os}`, type: os === "iOS" || os === "Android" ? "mobile" : "desktop" };
}
