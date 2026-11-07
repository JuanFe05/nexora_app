import { ROLE_DESCRIPTION_MAX_LENGTH } from "../constants";
import type { Role, RoleFieldErrors, RoleValues } from "../types";

export function validateRole(values: RoleValues, previous?: Pick<Role, "descripcion"> | null): RoleFieldErrors {
  const errors: RoleFieldErrors = {};
  if (!previous && !/^[A-Z][A-Z0-9_]{1,49}$/.test(values.codigo.trim())) {
    errors.codigo = "Usa de 2 a 50 caracteres: mayúsculas, números o guion bajo; empieza con una letra.";
  }
  const nombre = values.nombre.trim();
  if (!nombre || Array.from(nombre).length > 100) errors.nombre = "El nombre debe tener entre 1 y 100 caracteres.";
  const descripcion = values.descripcion.trim();
  if (Array.from(descripcion).length > ROLE_DESCRIPTION_MAX_LENGTH) errors.descripcion = "La descripción debe tener entre 1 y 255 caracteres.";
  if (previous?.descripcion && !descripcion) errors.descripcion = "No se puede vaciar una descripción existente; escribe una nueva.";
  return errors;
}
