import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import { changePassword, getProfile, listSessions, revokeSession, sessionFailure, passwordFailure, profileFailure, updateProfile } from "./profile-api";

vi.mock("@/lib/http/http-client", () => ({ httpClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const original = { correo: "ana@example.test", primer_nombre: "Ana", segundo_nombre: null, primer_apellido: "Pérez", segundo_apellido: null, numero_telefono: null };

describe("adaptador real /profile", () => {
  it("lista sesiones con señal y normaliza opcionales sin inventar fechas", async () => {
    const item = { id: "s1", direccion_ip: null, agente_usuario: null, fecha_creacion: "2026-01-01T00:00:00Z", fecha_ultima_actividad: "2026-01-02T00:00:00Z", fecha_vencimiento: "2026-01-03T00:00:00Z", actual: true };
    const signal = new AbortController().signal;
    vi.mocked(httpClient.get).mockResolvedValue({ items: [item, { ...item, id: "s2", direccion_ip: "", agente_usuario: "" }] });
    expect(await listSessions(signal)).toEqual([item, { ...item, id: "s2" }]);
    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith("/profile/sessions", { signal });
  });
  it("revoca por DELETE sin cuerpo y conserva errores del cliente", async () => {
    vi.mocked(httpClient.delete).mockResolvedValue(undefined);
    await expect(revokeSession("s/2")).resolves.toBeUndefined();
    expect(httpClient.delete).toHaveBeenCalledExactlyOnceWith("/profile/sessions/s%2F2");
    const failure = new ApiError(404, "interno", null);
    vi.mocked(httpClient.delete).mockRejectedValue(failure);
    await expect(revokeSession("s2")).rejects.toBe(failure);
  });
  it("mapea fallos de sesiones a mensajes seguros en español", () => {
    expect(sessionFailure(new ApiError(404, "interno", null))).toBe("La sesión ya no está disponible.");
    expect(sessionFailure(new ApiError(409, "interno", null))).toBe("Para cerrar la sesión actual, usa «Cerrar sesión».");
    expect(sessionFailure(new ApiError(0, "interno", null))).toBe("No se pudo conectar con el servidor. Intenta de nuevo.");
    expect(sessionFailure(new Error("interno"))).toBe("No se pudo completar la operación de sesiones. Intenta de nuevo.");
  });
  it("GET usa el cliente compartido y señal de cancelación", async () => {
    const signal = new AbortController().signal;
    vi.mocked(httpClient.get).mockResolvedValue(original);
    expect(await getProfile(signal)).toEqual(original);
    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith("/profile", { signal });
  });
  it("PATCH filtra campos, normaliza y envía solo diferencias sin null", async () => {
    vi.mocked(httpClient.patch).mockResolvedValue(original);
    await updateProfile(original, { correo: " nuevo@example.test ", primer_nombre: " Ana ", segundo_nombre: "", primer_apellido: "Pérez", segundo_apellido: "", numero_telefono: "" });
    expect(httpClient.patch).toHaveBeenCalledExactlyOnceWith("/profile", { body: { correo: "nuevo@example.test" } });
  });
  it("POST conserva secretos sin recortar y no envía confirmación", async () => {
    vi.mocked(httpClient.post).mockResolvedValue(undefined);
    await expect(changePassword({ contrasena_actual: " actual ", contrasena_nueva: " Nueva-segura1! " })).resolves.toBeUndefined();
    expect(httpClient.post).toHaveBeenCalledExactlyOnceWith("/profile/password", { body: { contrasena_actual: " actual ", contrasena_nueva: " Nueva-segura1! " } });
  });
  it("preserva ApiError y Retry-After del cliente", async () => {
    const failure = new ApiError(429, "interno", null, "23");
    vi.mocked(httpClient.post).mockRejectedValue(failure);
    await expect(changePassword({ contrasena_actual: "actual", contrasena_nueva: "Nueva-segura-123" })).rejects.toBe(failure);
    expect(passwordFailure(failure)).toEqual({ message: "Demasiados intentos. Intenta de nuevo en 23 segundos.", fields: {} });
  });
  it.each([null, "tomorrow", "-1", "9007199254740992"])("429 con Retry-After inválido %s usa fallback", (retryAfter) => {
    expect(passwordFailure(new ApiError(429, "secreto", null, retryAfter)).message).toBe("Demasiados intentos. Intenta de nuevo más tarde.");
  });
  it("mapea 409 y validaciones 422 a mensajes/campos del perfil sin copiar input", () => {
    expect(profileFailure(new ApiError(409, "El correo ya está en uso", null)).message).toBe("El correo ya está en uso");
    expect(profileFailure(new ApiError(422, "validación", { detail: [{ loc: ["body", "correo"], msg: "Correo inválido", input: "no copiar" }] })).fields).toEqual({ correo: "Correo inválido" });
    expect(profileFailure(new ApiError(422, "Revisa los datos", null)).message).toBe("Revisa los datos");
  });
  it("400 marca solo actual y 422/red/inesperado no exponen detalles de contraseñas", () => {
    expect(passwordFailure(new ApiError(400, "secreto", null))).toEqual({ message: null, fields: { contrasena_actual: "La contraseña actual es incorrecta." } });
    for (const error of [new ApiError(422, "secreto", { detail: "secreto" }), new ApiError(0, "secreto", null), new Error("secreto")]) {
      expect(JSON.stringify(passwordFailure(error))).not.toContain("secreto");
    }
    expect(profileFailure(new ApiError(0, "interno", null)).message).toBe("No se pudo conectar con el servidor. Intenta de nuevo.");
  });
});
