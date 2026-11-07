export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 24;

export const PASSWORD_RULES = [
  { id: "length", label: `Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres` },
  { id: "uppercase", label: "Al menos una letra mayúscula" },
  { id: "lowercase", label: "Al menos una letra minúscula" },
  { id: "digit", label: "Al menos un número" },
  { id: "special", label: "Al menos un carácter especial (@, #, $, %, &, !…)" },
] as const;

export type PasswordPolicyEvaluation = Readonly<Record<(typeof PASSWORD_RULES)[number]["id"], boolean>>;

export const PASSWORD_VALIDATION_MESSAGE = `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres, al menos una letra mayúscula, una minúscula, un número y un carácter especial.`;

/** Unicode code points, without trimming. The backend remains authoritative. */
export function evaluatePasswordPolicy(value: string): PasswordPolicyEvaluation {
  const length = Array.from(value).length;
  return {
    length: length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH,
    uppercase: /\p{Lu}/u.test(value),
    lowercase: /\p{Ll}/u.test(value),
    digit: /\p{Nd}/u.test(value),
    special: /[\p{P}\p{S}]/u.test(value),
  };
}

export function passwordMeetsPolicy(value: string): boolean {
  const evaluation = evaluatePasswordPolicy(value);
  return PASSWORD_RULES.every(rule => evaluation[rule.id]);
}
