import { ApiError } from "../../lib/http/api-error";

export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Credenciales invalidas";
    if (error.status === 429) {
      const value = error.retryAfter;
      const seconds = value && /^\d+$/.test(value) ? Number(value) : NaN;
      if (Number.isSafeInteger(seconds) && seconds >= 0) {
        return `Demasiados intentos. Intenta de nuevo en ${seconds} segundos.`;
      }
      return "Demasiados intentos. Intenta de nuevo más tarde.";
    }
    if (error.status === 422) return "Revisa el usuario o correo y la contraseña.";
    if (error.status === 0) return "No se pudo conectar con el servidor. Intenta de nuevo.";
  }
  return "No se pudo iniciar sesión. Intenta de nuevo.";
}
