import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import type { PasswordValues } from "../types";

type Props = {
  name: keyof PasswordValues;
  label: string;
  toggleLabel: string;
  error?: string;
  pending: boolean;
  onChange: () => void;
};

export function PasswordField({ name, label, toggleLabel, error, pending, onChange }: Props) {
  const [visible, setVisible] = useState(false);
  const id = `profile-${name}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}<span aria-hidden="true" className="text-red-500">*</span></FieldLabel>
      <InputGroup>
        <InputGroupInput id={id} name={name} type={visible ? "text" : "password"} required disabled={pending}
          autoComplete={name === "contrasena_actual" ? "current-password" : "new-password"}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={onChange} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-sm" disabled={pending} onClick={() => setVisible((previous) => !previous)}
            aria-label={`${visible ? "Ocultar" : "Mostrar"} ${toggleLabel}`} aria-pressed={visible} className="text-gray-500 dark:text-gray-400">
            {visible ? <EyeIcon aria-hidden="true" className="fill-current" /> : <EyeCloseIcon aria-hidden="true" className="fill-current" />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {error && <p id={`${id}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Field>
  );
}
