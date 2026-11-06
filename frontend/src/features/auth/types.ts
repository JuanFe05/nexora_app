export type AuthUser = {
  id: string;
  nombre_usuario: string;
  correo: string;
  nombre_completo: string;
};

export type LoginInput = { identificador: string; contrasena: string };
export type TokenResponse = { access_token: string; token_type: string; expires_in: number };
export type LoginResponse = TokenResponse & { usuario: AuthUser };
export type MeResponse = { usuario: AuthUser; roles: string[]; permisos: string[] };
export type AuthState = {
  status: "loading" | "authenticated" | "anonymous";
  user: AuthUser | null;
  roles: string[];
  permissions: string[];
};
