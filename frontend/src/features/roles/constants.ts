export const SYSTEM_ROLE_CODES: readonly string[] = ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION"];
export const ADMINISTRATOR_CODE = "ADMINISTRADOR";
// RoleCreate/RoleUpdate's Description contract in the backend IAM HTTP schemas.
export const ROLE_DESCRIPTION_MAX_LENGTH = 255;
export const canDeleteRole = (codigo: string) => !SYSTEM_ROLE_CODES.includes(codigo);
