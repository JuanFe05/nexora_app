import { useState, type SubmitEvent } from "react";
import { PasswordRequirements } from "@/components/shared/password-requirements";
import { evaluatePasswordPolicy, PASSWORD_VALIDATION_MESSAGE } from "@/lib/password-policy";
import { useToast } from "@/components/shared/toast/use-toast";
import { FormDialog } from "@/components/shared/form-dialog";
import { Button } from "@/components/ui/button";
import { LockIcon } from "@/icons";
import { changePassword, passwordFailure } from "../api/profile-api";
import { useFormFocus } from "../hooks/use-form-focus";
import type { FieldErrors, PasswordValues } from "../types";
import { validatePassword } from "../validation";
import { PasswordField } from "./password-field";

const fields = [
  { name: "contrasena_actual", label: "Contraseña actual", toggleLabel: "contraseña actual" },
  { name: "contrasena_nueva", label: "Nueva contraseña", toggleLabel: "nueva contraseña" },
  { name: "confirmacion", label: "Confirmar contraseña", toggleLabel: "confirmación de contraseña" },
] as const;

const description = `${PASSWORD_VALIDATION_MESSAGE} Usa una contraseña diferente de la actual. Al cambiarla, se cerrarán tus otras sesiones; esta sesión seguirá activa.`;

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  return <>
    <div className="flex min-w-0 flex-col gap-4 py-5 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6" aria-labelledby="password-title">
      <div className="min-w-0 space-y-1">
        <h3 id="password-title" className="text-base font-medium text-gray-800 dark:text-white/90">Cambiar contraseña</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">Actualiza la contraseña de tu cuenta.</p>
      </div>
      <Button variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => setOpen(true)}><LockIcon aria-hidden="true" className="size-5" />Cambiar contraseña</Button>
    </div>
    {open && <PasswordEditor onClose={() => setOpen(false)} />}
  </>;
}

function PasswordEditor({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [evaluation, setEvaluation] = useState(() => evaluatePasswordPolicy(""));
  const [errors, setErrors] = useState<FieldErrors<keyof PasswordValues>>({});
  const toast = useToast();
  const [generation, setGeneration] = useState(0);
  const { formRef, focusField } = useFormFocus(pending);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    // Uncontrolled inputs: never store passwords in React state or error messages.
    const data = new FormData(form);
    function readField(name: keyof PasswordValues) {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    }
    const values: PasswordValues = {
      contrasena_actual: readField("contrasena_actual"),
      contrasena_nueva: readField("contrasena_nueva"),
      confirmacion: readField("confirmacion"),
    };
    const invalid = validatePassword(values);
    setErrors(invalid);
    const first = fields.find(({ name }) => invalid[name]);
    if (first) { focusField(first.name); return; }
    setPending(true);
    // Clear the DOM and visibility immediately; keep only the in-flight request body.
    form.reset(); setEvaluation(evaluatePasswordPolicy("")); setGeneration((previous) => previous + 1);
    try {
      const request = changePassword({ contrasena_actual: values.contrasena_actual, contrasena_nueva: values.contrasena_nueva });
      values.contrasena_actual = ""; values.contrasena_nueva = ""; values.confirmacion = "";
      data.delete("contrasena_actual"); data.delete("contrasena_nueva"); data.delete("confirmacion");
      await request;
      toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
      onClose();
    } catch (error) {
      const failure = passwordFailure(error);
      setErrors(failure.fields);
      if (failure.message) toast.error(failure.message);
      focusField(fields.find(({ name }) => failure.fields[name])?.name);
    } finally { setPending(false); }
  }

  return (
    <FormDialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Cambiar contraseña"
      description={description} formId="password-form" pending={pending} pendingLabel="Actualizando…">
      <form id="password-form" ref={formRef} noValidate onSubmit={submit} onReset={() => setEvaluation(evaluatePasswordPolicy(""))} aria-label="Cambiar contraseña" aria-busy={pending} className="space-y-5">
        {fields.map((field) => <PasswordField key={`${generation}-${field.name}`} {...field} pending={pending} error={errors[field.name]}
          requirements={field.name === "contrasena_nueva" ? <PasswordRequirements evaluation={evaluation} /> : undefined}
          onChange={(event) => {
            if (field.name === "contrasena_nueva") setEvaluation(evaluatePasswordPolicy(event.currentTarget.value));
            // New password and confirmation validation depend on each other.
            setErrors({});
          }} />)}
      </form>
    </FormDialog>
  );
}
