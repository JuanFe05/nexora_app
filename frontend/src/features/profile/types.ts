export const profileFields = ["primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido", "numero_telefono", "correo"] as const;
export type ProfileField = typeof profileFields[number];
export type ProfileValues = Record<ProfileField, string>;
export type ProfileData = {
  correo: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  numero_telefono: string | null;
};
export type Profile = ProfileData & { id: string; nombre_usuario: string; estado: string; roles: string[] };
export type ProfileChanges = Partial<ProfileValues>;
export type FieldErrors<K extends string> = Partial<Record<K, string>>;
export type PasswordInput = { contrasena_actual: string; contrasena_nueva: string };
export type PasswordValues = PasswordInput & { confirmacion: string };
export type FormFailure<K extends string> = { message: string | null; fields: FieldErrors<K> };
