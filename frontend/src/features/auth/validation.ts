import type { LoginInput } from "./types";

export type SignInErrors = Partial<Record<keyof LoginInput, string>>;

export function validateSignIn(input: LoginInput): SignInErrors {
  const errors: SignInErrors = {};
  if (!input.identificador.trim()) errors.identificador = "Introduce tu usuario o correo electrónico.";
  if (!input.contrasena) errors.contrasena = "Introduce tu contraseña.";
  return errors;
}
