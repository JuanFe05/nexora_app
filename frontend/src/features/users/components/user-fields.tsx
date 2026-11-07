import { type ChangeEvent } from "react";
import { PasswordInput } from "@/components/shared/password-input";
import { PasswordRequirements } from "@/components/shared/password-requirements";
import { evaluatePasswordPolicy, PASSWORD_RULES, type PasswordPolicyEvaluation } from "@/lib/password-policy";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userTextFields } from "../hooks/user-validation";
import type { UserFieldErrors, UserValues } from "../types";

export function UserFields({ values, errors, onChange, editing, personalEditable, statusEditable, evaluation, onPasswordChange, onConfirmationChange, showPasswordErrors, onPasswordBlur, passwordsMatch, onPasswordsMatchChange, secretGeneration }: {
  values: UserValues;
  errors: UserFieldErrors;
  onChange: (name: keyof UserValues, value: string) => void;
  editing: boolean;
  personalEditable: boolean;
  statusEditable: boolean;
  evaluation: PasswordPolicyEvaluation;
  onPasswordChange: (evaluation: PasswordPolicyEvaluation) => void;
  onConfirmationChange: () => void;
  showPasswordErrors: boolean;
  onPasswordBlur: () => void;
  passwordsMatch: boolean | null;
  onPasswordsMatchChange: (matches: boolean | null) => void;
  secretGeneration: number;
}) {
  function updateMatching(event: ChangeEvent<HTMLInputElement>) {
    const form = event.currentTarget.form;
    const password = form?.elements.namedItem("contrasena") as HTMLInputElement | null;
    const confirmation = form?.elements.namedItem("confirmar_contrasena") as HTMLInputElement | null;
    // Compare only at input time: never retain either secret in React state.
    onPasswordsMatchChange(confirmation?.value ? password?.value === confirmation.value : null);
  }
  const confirmationError = errors.confirmar_contrasena || (passwordsMatch === false ? "Las contraseñas no coinciden." : undefined);
  function textField({ name, label, required, max }: typeof userTextFields[number]) {
    return <Field key={name} controlId={`user-${name}`} data-invalid={!!errors[name]}>
      <Label htmlFor={`user-${name}`}>{label}{required && <span aria-hidden="true" className="text-red-500">*</span>}</Label>
      <Input name={name} value={values[name]} readOnly={!personalEditable} onChange={event => { if (personalEditable) onChange(name, event.target.value); }} required={required} aria-invalid={!!errors[name]} aria-describedby={errors[name] ? `user-${name}-error` : undefined} autoComplete={name === "nombre_usuario" ? "off" : name === "correo" ? "email" : undefined} inputMode={name === "correo" ? "email" : name === "numero_telefono" ? "tel" : undefined} maxLength={max * 2} />
      {errors[name] && <p id={`user-${name}-error`} className="text-sm text-red-500 dark:text-red-400">{errors[name]}</p>}
    </Field>;
  }
  return <>
    <fieldset className="space-y-5 border-t border-gray-200 pt-5 dark:border-gray-800">
      <legend className="pe-3 text-sm font-semibold text-gray-800 dark:text-white/90">Cuenta</legend>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {userTextFields.filter(field => field.name === "nombre_usuario" || field.name === "correo").map(textField)}
      </div>
    </fieldset>
    <fieldset className="space-y-5 border-t border-gray-200 pt-5 dark:border-gray-800">
      <legend className="pe-3 text-sm font-semibold text-gray-800 dark:text-white/90">Datos personales</legend>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {userTextFields.filter(field => field.name !== "nombre_usuario" && field.name !== "correo").map(textField)}
      </div>
    </fieldset>
    <fieldset className="space-y-5 border-t border-gray-200 pt-5 dark:border-gray-800">
      <legend className="pe-3 text-sm font-semibold text-gray-800 dark:text-white/90">Acceso</legend>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {!editing && <>
          <Field controlId="user-contrasena" data-invalid={!!errors.contrasena}>
            <Label htmlFor="user-contrasena">Contraseña<span aria-hidden="true" className="text-red-500">*</span></Label>
            <PasswordInput key={secretGeneration} name="contrasena" toggleLabel="contraseña" disabled={!personalEditable} autoComplete="new-password" required aria-invalid={!!errors.contrasena} aria-describedby={`user-password-help user-password-requirements${errors.contrasena ? " user-contrasena-error" : ""}`} onBlur={onPasswordBlur} onChange={event => {
              onPasswordChange(evaluatePasswordPolicy(event.currentTarget.value));
              updateMatching(event);
            }} />
            <p id="user-password-help" className="text-sm text-gray-500 dark:text-gray-400">{PASSWORD_RULES[0].label}.</p>
            <div id="user-password-requirements"><PasswordRequirements evaluation={evaluation} showErrors={showPasswordErrors} sentenceLabels /></div>
            {errors.contrasena && <p id="user-contrasena-error" className="text-sm text-red-500 dark:text-red-400">{errors.contrasena}</p>}
          </Field>
          <Field controlId="user-confirmar-contrasena" data-invalid={!!confirmationError}>
            <Label htmlFor="user-confirmar-contrasena">Confirmar contraseña<span aria-hidden="true" className="text-red-500">*</span></Label>
            <PasswordInput key={secretGeneration} name="confirmar_contrasena" toggleLabel="confirmación de contraseña" disabled={!personalEditable} autoComplete="new-password" required aria-invalid={!!confirmationError} aria-describedby={confirmationError ? "user-confirmar-contrasena-error" : passwordsMatch === true ? "user-password-match" : undefined} onChange={event => {
              onConfirmationChange();
              updateMatching(event);
            }} />
            <div aria-live="polite" aria-atomic="true">
              {confirmationError ? <p id="user-confirmar-contrasena-error" className="text-sm text-red-600 dark:text-red-400">{confirmationError}</p> : passwordsMatch === true && <p id="user-password-match" className="text-sm text-green-600 dark:text-green-400">Las contraseñas coinciden.</p>}
            </div>
          </Field>
        </>}
        {editing && <Field controlId="user-estado" data-invalid={!!errors.estado}>
          <Label htmlFor="user-estado">Estado<span aria-hidden="true" className="text-red-500">*</span></Label>
          <select id="user-estado" name="estado" value={values.estado} disabled={!statusEditable} aria-readonly={!statusEditable} onChange={event => { if (statusEditable) onChange("estado", event.target.value); }} aria-invalid={!!errors.estado} aria-describedby={errors.estado ? "user-estado-error" : undefined} className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
          </select>
          {errors.estado && <p id="user-estado-error" className="text-sm text-red-500 dark:text-red-400">{errors.estado}</p>}
        </Field>}
      </div>
    </fieldset>
  </>;
}
