export type RoleStatus = "activo" | "inactivo";
export type Role = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  estado: RoleStatus;
  permisos: string[];
  usuarios_asignados: number;
};
export type PermissionOption = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  descripcion: string | null;
};
export type RoleValues = { codigo: string; nombre: string; descripcion: string; estado: RoleStatus };
export type RoleMutableValues = Omit<RoleValues, "codigo">;
export type RoleFieldErrors = Partial<Record<keyof RoleValues, string>>;
