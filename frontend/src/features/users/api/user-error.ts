import { ApiError } from "@/lib/http/api-error";
import type { UserField, UserFieldErrors } from "../types";

const fields = new Set<UserField>(["nombre_usuario", "correo", "primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido", "numero_telefono", "estado", "contrasena"]);
export function userError(error: unknown): { message: string; fields: UserFieldErrors } {
  const result = { message: "No se pudo completar la solicitud. Inténtalo de nuevo.", fields: {} as UserFieldErrors };
  if (!(error instanceof ApiError)) return result;
  if (error.status === 401) result.message = "Tu sesión ha caducado. Inicia sesión de nuevo.";
  else if (error.status === 403 || error.status === 404 || error.status === 409) result.message = error.detail;
  else if (error.status === 0) result.message = "No se pudo conectar con el servidor. Inténtalo de nuevo.";
  else if (error.status === 422) {
    result.message = "Revisa los datos e inténtalo de nuevo.";
    const body = error.body;
    if (body && typeof body === "object" && "detail" in body && Array.isArray(body.detail)) {
      for (const issue of body.detail as unknown[]) {
        if (!issue || typeof issue !== "object" || !("loc" in issue) || !Array.isArray(issue.loc)) continue;
        const field = issue.loc[0] === "body" ? issue.loc[1] as UserField : undefined;
        if (field && fields.has(field)) {
          // Never render FastAPI input/context or raw messages: they may include a password.
          result.fields[field] = field === "contrasena" ? "Revisa la contraseña (entre 12 y 128 caracteres)." : "Revisa este campo.";
        }
      }
    }
  }
  return result;
}
