export type Permission = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  descripcion: string | null;
};

export type PermissionValues = {
  codigo: string;
  nombre: string;
  modulo: string;
  descripcion: string;
};

export type PermissionCreate = Omit<PermissionValues, "descripcion"> & { descripcion?: string };
export type PermissionPatch = Partial<Pick<PermissionValues, "nombre" | "modulo" | "descripcion">>;
export type PermissionErrors = Partial<Record<keyof PermissionValues, string>>;
