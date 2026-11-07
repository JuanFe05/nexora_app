import { useState, type SubmitEvent } from "react";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export function PasswordForm() {
  const [pending, setPending] = useState(false);
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
    form.reset(); setGeneration((previous) => previous + 1);
    try {
      const request = changePassword({ contrasena_actual: values.contrasena_actual, contrasena_nueva: values.contrasena_nueva });
      values.contrasena_actual = ""; values.contrasena_nueva = ""; values.confirmacion = "";
      data.delete("contrasena_actual"); data.delete("contrasena_nueva"); data.delete("confirmacion");
      await request;
      toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
    } catch (error) {
      const failure = passwordFailure(error);
      setErrors(failure.fields);
      if (failure.message) toast.error(failure.message);
      focusField(fields.find(({ name }) => failure.fields[name])?.name);
    } finally { setPending(false); }
  }

  return (
    <Card className="min-w-0" aria-labelledby="password-title">
      <h2 id="password-title" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
        <LockIcon aria-hidden="true" className="size-6" />Cambiar contraseña
      </h2>
      <p id="password-hint" className="text-sm text-gray-500 dark:text-gray-400">Usa entre 12 y 128 caracteres y una contraseña diferente de la actual. Al cambiarla, se cerrarán tus otras sesiones; esta sesión seguirá activa.</p>
      <form ref={formRef} noValidate onSubmit={submit} aria-labelledby="password-title" aria-describedby="password-hint" aria-busy={pending} className="max-w-xl space-y-5">
        {fields.map((field) => <PasswordField key={`${generation}-${field.name}`} {...field} pending={pending} error={errors[field.name]} onChange={() => {
          // New password and confirmation validation depend on each other.
          setErrors({});
        }} />)}
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Actualizando…" : "Actualizar contraseña"}</Button>
      </form>
    </Card>
  );
}
