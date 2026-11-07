import { ApiError } from "@/lib/http/api-error";
import { httpClient } from "@/lib/http/http-client";
import { profileFields, type FormFailure, type PasswordInput, type PasswordValues, type Profile, type ProfileData, type ProfileField, type ProfileValues, type ProfileSession } from "../types";
import { changedProfileFields } from "../validation";

export const getProfile = (signal?: AbortSignal): Promise<Profile> => httpClient.get<Profile>("/profile", { signal });

export function updateProfile(original: ProfileData, values: ProfileValues): Promise<Profile> {
  return httpClient.patch<Profile>("/profile", { body: changedProfileFields(original, values) });
}

export function changePassword(input: PasswordInput): Promise<void> {
  return httpClient.post<void>("/profile/password", { body: { contrasena_actual: input.contrasena_actual, contrasena_nueva: input.contrasena_nueva } });
}

export async function listSessions(signal?: AbortSignal): Promise<ProfileSession[]> {
  const response = await httpClient.get<{ items: ProfileSession[] }>("/profile/sessions", { signal });
  return response.items.map((item) => ({ ...item, direccion_ip: item.direccion_ip || null, agente_usuario: item.agente_usuario || null }));
}

export function revokeSession(id: string): Promise<void> {
  return httpClient.delete<void>(`/profile/sessions/${encodeURIComponent(id)}`);
}

export function sessionFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 404) return "La sesión ya no está disponible.";
    if (error.status === 409) return "Para cerrar la sesión actual, usa «Cerrar sesión».";
    if (error.status === 0) return "No se pudo conectar con el servidor. Intenta de nuevo.";
  }
  return "No se pudo completar la operación de sesiones. Intenta de nuevo.";
}

export function profileFailure(error: unknown): FormFailure<ProfileField> {
  const fields: FormFailure<ProfileField>["fields"] = {};
  if (error instanceof ApiError) {
    if (error.status === 422) {
      const body = error.body;
      if (body && typeof body === "object" && "detail" in body && Array.isArray(body.detail)) {
        for (const item of body.detail as unknown[]) {
          if (!item || typeof item !== "object" || !("loc" in item) || !Array.isArray(item.loc) || !("msg" in item) || typeof item.msg !== "string") continue;
          const location = item.loc;
          const field = profileFields.find((name) => location.includes(name));
          if (field) fields[field] = item.msg;
        }
      }
      return { message: Object.keys(fields).length ? "Revisa los campos indicados." : error.detail, fields };
    }
    if (error.status === 409) return { message: error.detail, fields };
    if (error.status === 0) return { message: "No se pudo conectar con el servidor. Intenta de nuevo.", fields };
  }
  return { message: "No se pudieron guardar o cargar los datos. Intenta de nuevo.", fields };
}

/** Never surface password error bodies: they may contain submitted secrets. */
export function passwordFailure(error: unknown): FormFailure<keyof PasswordValues> {
  if (error instanceof ApiError) {
    if (error.status === 400) return { message: null, fields: { contrasena_actual: "La contraseña actual es incorrecta." } };
    if (error.status === 429) {
      const value = error.retryAfter;
      const seconds = value && /^\d+$/.test(value) ? Number(value) : NaN;
      return { message: Number.isSafeInteger(seconds) && seconds >= 0
        ? `Demasiados intentos. Intenta de nuevo en ${seconds} segundos.`
        : "Demasiados intentos. Intenta de nuevo más tarde.", fields: {} };
    }
    if (error.status === 422) return { message: "Revisa los campos de contraseña e intenta de nuevo.", fields: {} };
    if (error.status === 0) return { message: "No se pudo conectar con el servidor. Intenta de nuevo.", fields: {} };
  }
  return { message: "No se pudo actualizar la contraseña. Intenta de nuevo.", fields: {} };
}
