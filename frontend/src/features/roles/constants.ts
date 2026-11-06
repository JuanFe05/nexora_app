export const SYSTEM_ROLE_CODES: readonly string[] = ["ADMINISTRADOR", "ESTADISTICA", "FACTURACION"];
export const ADMINISTRATOR_CODE = "ADMINISTRADOR";
export const canDeleteRole = (codigo: string) => !SYSTEM_ROLE_CODES.includes(codigo);
