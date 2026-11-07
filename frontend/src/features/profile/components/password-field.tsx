import { type ChangeEventHandler, type ReactNode } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/shared/password-input";
import type { PasswordValues } from "../types";

type Props = {
  name: keyof PasswordValues;
  label: string;
  toggleLabel: string;
  error?: string;
  pending: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  requirements?: ReactNode;
};

export function PasswordField({ name, label, toggleLabel, error, pending, onChange, requirements }: Props) {
  const id = `profile-${name}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}<span aria-hidden="true" className="text-red-500">*</span></FieldLabel>
      <PasswordInput id={id} name={name} toggleLabel={toggleLabel} required disabled={pending}
        autoComplete={name === "contrasena_actual" ? "current-password" : "new-password"}
        aria-invalid={Boolean(error)} aria-describedby={[requirements ? `${id}-requirements` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined} onChange={onChange} />
      {requirements && <div id={`${id}-requirements`}>{requirements}</div>}
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Field>
  );
}
