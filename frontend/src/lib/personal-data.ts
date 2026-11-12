/** Same canonical rules as the backend (identity_access personal_data), applied before sending. */
export const normalizeName = (value: string) =>
  value.normalize("NFC").toUpperCase().split(/\s+/).filter(Boolean).join(" ");
export const normalizeEmail = (value: string) => value.normalize("NFC").trim().toLowerCase();
export const normalizeUsername = normalizeEmail;

const NORMALIZERS: Partial<Record<string, (value: string) => string>> = {
  nombre_usuario: normalizeUsername,
  correo: normalizeEmail,
  primer_nombre: normalizeName,
  segundo_nombre: normalizeName,
  primer_apellido: normalizeName,
  segundo_apellido: normalizeName,
};

/** Trims every field; usernames and emails go lowercase, the four name fields uppercase. */
export function normalizeField(field: string, value: string) {
  return (NORMALIZERS[field] ?? ((text: string) => text.trim()))(value);
}
