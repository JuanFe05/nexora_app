import type { Permission, PermissionErrors, PermissionPatch, PermissionValues } from "../types";

export const permissionFields = [
  { name: "codigo", label: "Código", required: true, maxLength: 100 },
  { name: "nombre", label: "Nombre", required: true, maxLength: 100 },
  { name: "modulo", label: "Módulo", required: true, maxLength: 50 },
  { name: "descripcion", label: "Descripción", required: false, maxLength: 255 },
] as const;

export function permissionValues(permission?: Permission): PermissionValues {
  return permission
    ? { codigo: permission.codigo, nombre: permission.nombre, modulo: permission.modulo, descripcion: permission.descripcion ?? "" }
    : { codigo: "", nombre: "", modulo: "", descripcion: "" };
}

export function normalizedValues(values: PermissionValues): PermissionValues {
  return { codigo: values.codigo.trim(), nombre: values.nombre.trim(), modulo: values.modulo.trim(), descripcion: values.descripcion.trim() };
}

export function permissionChanges(original: Permission, values: PermissionValues): PermissionPatch {
  const normalized = normalizedValues(values);
  const changes: PermissionPatch = {};
  for (const field of ["nombre", "modulo", "descripcion"] as const) {
    if (normalized[field] !== (original[field] ?? "")) changes[field] = normalized[field];
  }
  return changes;
}

export function validatePermission(values: PermissionValues, original?: Permission): PermissionErrors {
  const data = normalizedValues(values);
  const errors: PermissionErrors = {};
  if (!data.codigo) errors.codigo = "El código es obligatorio.";
  else if (data.codigo.length > 100) errors.codigo = "El código no puede superar 100 caracteres.";
  else if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(data.codigo)) {
    errors.codigo = "Usa segmentos en minúsculas separados por puntos, por ejemplo identity.users.view.";
  }
  if (!data.nombre) errors.nombre = "El nombre es obligatorio.";
  else if (Array.from(data.nombre).length > 100) errors.nombre = "El nombre no puede superar 100 caracteres.";
  if (!data.modulo) errors.modulo = "El módulo es obligatorio.";
  else if (Array.from(data.modulo).length > 50) errors.modulo = "El módulo no puede superar 50 caracteres.";
  if (Array.from(data.descripcion).length > 255) errors.descripcion = "La descripción no puede superar 255 caracteres.";
  else if (original?.descripcion && !data.descripcion) errors.descripcion = "La descripción no puede quedar vacía al editarla.";
  return errors;
}
