import { PasswordRequirements } from "@/components/shared/password-requirements";
import { evaluatePasswordPolicy, PASSWORD_RULES, type PasswordPolicyEvaluation } from "@/lib/password-policy";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userTextFields } from "../hooks/user-validation";
import type { UserFieldErrors, UserValues } from "../types";

export function UserFields({ values, errors, onChange, editing, personalEditable, statusEditable, evaluation, onPasswordChange }: {
  values: UserValues;
  errors: UserFieldErrors;
  onChange: (name: keyof UserValues, value: string) => void;
  editing: boolean;
  personalEditable: boolean;
  statusEditable: boolean;
  evaluation: PasswordPolicyEvaluation;
  onPasswordChange: (evaluation: PasswordPolicyEvaluation) => void;
}) {
  return <>
    {userTextFields.map(({ name, label, required, max }) => <Field key={name} controlId={`user-${name}`} data-invalid={!!errors[name]}>
      <Label htmlFor={`user-${name}`}>{label}{required && <span aria-hidden="true" className="text-red-500">*</span>}</Label>
      <Input name={name} value={values[name]} readOnly={!personalEditable} onChange={event => { if (personalEditable) onChange(name, event.target.value); }} required={required} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `user-${name}-error` : undefined} autoComplete={name === "nombre_usuario" ? "off" : name === "correo" ? "email" : undefined} inputMode={name === "correo" ? "email" : name === "numero_telefono" ? "tel" : undefined} maxLength={max * 2} />
      {errors[name] && <p id={`user-${name}-error`} className="text-sm text-red-500 dark:text-red-400">{errors[name]}</p>}
    </Field>)}
    {!editing && <Field controlId="user-contrasena" data-invalid={!!errors.contrasena}>
      <Label htmlFor="user-contrasena">Contraseña<span aria-hidden="true" className="text-red-500">*</span></Label>
      <Input name="contrasena" disabled={!personalEditable} type="password" autoComplete="new-password" required aria-invalid={!!errors.contrasena} aria-describedby={`user-password-help user-password-requirements${errors.contrasena ? " user-contrasena-error" : ""}`} onChange={event => onPasswordChange(evaluatePasswordPolicy(event.currentTarget.value))} />
      <p id="user-password-help" className="text-sm text-gray-500 dark:text-gray-400">{PASSWORD_RULES[0].label}. Solo se establece al crear el usuario.</p>
      <div id="user-password-requirements"><PasswordRequirements evaluation={evaluation} /></div>
      {errors.contrasena && <p id="user-contrasena-error" className="text-sm text-red-500 dark:text-red-400">{errors.contrasena}</p>}
    </Field>}
    {editing && <Field controlId="user-estado" data-invalid={!!errors.estado}>
      <Label htmlFor="user-estado">Estado<span aria-hidden="true" className="text-red-500">*</span></Label>
      <select id="user-estado" name="estado" value={values.estado} disabled={!statusEditable} aria-readonly={!statusEditable} onChange={event => { if (statusEditable) onChange("estado", event.target.value); }} aria-invalid={!!errors.estado} aria-describedby={errors.estado ? "user-estado-error" : undefined} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
        <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
      </select>
      {errors.estado && <p id="user-estado-error" className="text-sm text-red-500 dark:text-red-400">{errors.estado}</p>}
    </Field>}
  </>;
}
