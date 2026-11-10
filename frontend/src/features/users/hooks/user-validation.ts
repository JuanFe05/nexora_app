import { passwordMeetsPolicy, PASSWORD_VALIDATION_MESSAGE } from "@/lib/password-policy";
import { PHONE_VALIDATION_MESSAGE, phoneIsValid } from "@/lib/phone";
import type { User, UserCreate, UserFieldErrors, UserPatch, UserValues } from "../types";

export const userTextFields = [
  { name: "nombre_usuario", label: "Nombre de usuario", max: 50, required: true },
  { name: "correo", label: "Correo", max: 255, required: true },
  { name: "primer_nombre", label: "Primer nombre", max: 100, required: true },
  { name: "segundo_nombre", label: "Segundo nombre", max: 100, required: false },
  { name: "primer_apellido", label: "Primer apellido", max: 100, required: true },
  { name: "segundo_apellido", label: "Segundo apellido", max: 100, required: false },
  { name: "numero_telefono", label: "Teléfono", max: 10, required: false },
] as const;

export function userValues(user?: User | null): UserValues {
  return { nombre_usuario: user?.nombre_usuario ?? "", correo: user?.correo ?? "", primer_nombre: user?.primer_nombre ?? "", primer_apellido: user?.primer_apellido ?? "", segundo_nombre: user?.segundo_nombre ?? "", segundo_apellido: user?.segundo_apellido ?? "", numero_telefono: user?.numero_telefono ?? "", estado: user?.estado ?? "activo", contrasena: "" };
}

export function validateUser(values: UserValues, original: User | null): UserFieldErrors {
  const errors: UserFieldErrors = {};
  for (const field of userTextFields) {
    const value = values[field.name].trim();
    if (!value && field.required) errors[field.name] = "Este campo es obligatorio.";
    else if (!value && original?.[field.name]) errors[field.name] = "El backend no permite vaciar este campo; conserva su valor o escribe uno nuevo.";
    else if (field.name === "numero_telefono") { if (value && value !== (original?.numero_telefono ?? "") && !phoneIsValid(value)) errors[field.name] = PHONE_VALIDATION_MESSAGE; }
    else if (Array.from(value).length > field.max) errors[field.name] = `Usa como máximo ${field.max} caracteres.`;
  }
  if (!original && !passwordMeetsPolicy(values.contrasena)) {
    errors.contrasena = PASSWORD_VALIDATION_MESSAGE;
  }
  if (values.estado !== "activo" && values.estado !== "inactivo") errors.estado = "Selecciona un estado válido.";
  return errors;
}

/** PATCH does not accept null or empty strings, including for optional fields. */
export function changedUserFields(user: User, values: UserValues): UserPatch {
  const body: UserPatch = {};
  for (const { name } of userTextFields) {
    const value = values[name].trim();
    if (value && value !== (user[name] ?? "")) body[name] = value;
  }
  if (values.estado !== user.estado) body.estado = values.estado;
  return body;
}

export function createUserBody(values: UserValues): UserCreate {
  const body: UserCreate = { nombre_usuario: values.nombre_usuario.trim(), correo: values.correo.trim(), primer_nombre: values.primer_nombre.trim(), primer_apellido: values.primer_apellido.trim(), contrasena: values.contrasena };
  for (const name of ["segundo_nombre", "segundo_apellido", "numero_telefono"] as const) {
    const value = values[name].trim();
    if (value) body[name] = value;
  }
  return body;
}
