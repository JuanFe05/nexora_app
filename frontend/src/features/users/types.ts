export type UserStatus = "activo" | "inactivo";
export type User = {
  id: string;
  nombre_usuario: string;
  correo: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  numero_telefono: string | null;
  estado: UserStatus;
  roles: string[];
};
export type UserCreate = Pick<User, "nombre_usuario" | "correo" | "primer_nombre" | "primer_apellido"> & {
  contrasena: string;
  segundo_nombre?: string;
  segundo_apellido?: string;
  numero_telefono?: string;
};
export type UserPatch = Partial<Omit<UserCreate, "contrasena"> & { estado: UserStatus }>;
export type RoleOption = { id: string; codigo: string; nombre: string };
export type UserValues = Record<keyof UserCreate, string> & { estado: UserStatus };
export type UserField = keyof UserValues;
export type UserFieldErrors = Partial<Record<UserField | "confirmar_contrasena", string>>;
