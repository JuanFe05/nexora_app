import { profileFields, type FieldErrors, type PasswordValues, type ProfileChanges, type ProfileData, type ProfileField, type ProfileValues } from "./types";

export function toProfileValues(profile: ProfileData): ProfileValues {
  return {
    primer_nombre: profile.primer_nombre,
    segundo_nombre: profile.segundo_nombre ?? "",
    primer_apellido: profile.primer_apellido,
    segundo_apellido: profile.segundo_apellido ?? "",
    numero_telefono: profile.numero_telefono ?? "",
    correo: profile.correo,
  };
}

/** Whitelist the closed PATCH contract; omission, unlike null, preserves a value. */
export function changedProfileFields(original: ProfileData, values: ProfileValues): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const field of profileFields) {
    const value = values[field].trim();
    if (value !== (original[field] ?? "")) changes[field] = value;
  }
  return changes;
}

export function validateProfile(values: ProfileValues, original: ProfileData): FieldErrors<ProfileField> {
  const errors: FieldErrors<ProfileField> = {};
  for (const field of profileFields) {
    const value = values[field].trim();
    const required = field === "correo" || field === "primer_nombre" || field === "primer_apellido";
    const max = field === "correo" ? 255 : field === "numero_telefono" ? 30 : 100;
    if (!value) {
      if (required) errors[field] = "Este campo es obligatorio.";
      else if (original[field]) errors[field] = "No se puede vaciar este campo. Introduce un valor o conserva el anterior.";
    } else if (Array.from(value).length > max) {
      errors[field] = `Introduce como máximo ${max} caracteres.`;
    } else if (field === "correo" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      errors[field] = "Introduce un correo electrónico válido.";
    }
  }
  return errors;
}

export function validatePassword(values: PasswordValues): FieldErrors<keyof PasswordValues> {
  const errors: FieldErrors<keyof PasswordValues> = {};
  const actualLength = Array.from(values.contrasena_actual).length;
  const newLength = Array.from(values.contrasena_nueva).length;
  if (!actualLength) errors.contrasena_actual = "Este campo es obligatorio.";
  else if (actualLength > 128) errors.contrasena_actual = "La contraseña actual debe tener como máximo 128 caracteres.";
  if (!newLength) errors.contrasena_nueva = "Este campo es obligatorio.";
  else if (newLength < 12 || newLength > 128) errors.contrasena_nueva = "La contraseña nueva debe tener entre 12 y 128 caracteres.";
  else if (values.contrasena_nueva === values.contrasena_actual) errors.contrasena_nueva = "La contraseña nueva debe ser diferente de la actual.";
  if (!values.confirmacion) errors.confirmacion = "Este campo es obligatorio.";
  else if (values.confirmacion !== values.contrasena_nueva) errors.confirmacion = "Las contraseñas no coinciden.";
  return errors;
}
