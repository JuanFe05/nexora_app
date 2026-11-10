/** Teléfono colombiano: exactamente 10 dígitos (0-9), como texto para conservar ceros iniciales. */
export const PHONE_LENGTH = 10;
export const PHONE_VALIDATION_MESSAGE = "El teléfono debe tener exactamente 10 dígitos numéricos, sin espacios, signos ni prefijos.";

export function phoneIsValid(value: string): boolean {
  return /^[0-9]{10}$/.test(value);
}
