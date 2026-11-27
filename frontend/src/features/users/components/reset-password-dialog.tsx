import { useState, type SubmitEvent } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/shared/password-input";
import { ApiError } from "@/lib/http/api-error";
import { passwordMeetsPolicy, PASSWORD_VALIDATION_MESSAGE } from "@/lib/password-policy";
import { resetUserPassword } from "../api/users-api";
import type { User } from "../types";

function resetFailure(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "No tienes permiso para restablecer la contraseña de este usuario.";
    if (error.status === 404) return "El usuario ya no está disponible.";
    if (error.status === 422) return PASSWORD_VALIDATION_MESSAGE;
  }
  return "No se pudo confirmar el restablecimiento de la contraseña. Intenta de nuevo.";
}

export function ResetPasswordDialog({ user, onClose, onReset }: { user: User; onClose: () => void; onReset: () => void }) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [invalid, setInvalid] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const input = event.currentTarget.elements.namedItem("contrasena_temporal");
    if (!(input instanceof HTMLInputElement)) return;
    if (!passwordMeetsPolicy(input.value)) {
      setInvalid(true);
      setFailure(PASSWORD_VALIDATION_MESSAGE);
      input.focus();
      return;
    }
    setPending(true);
    setFailure("");
    try {
      const request = resetUserPassword(user.id, input.value);
      input.value = "";
      await request;
      onReset();
    } catch (error) {
      // Never render server details: validation responses can contain submitted values.
      setFailure(resetFailure(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <FormDialog open onOpenChange={open => { if (!open) onClose(); }} title="Restablecer contraseña"
      description={`Asigna una contraseña temporal a ${user.nombre_usuario}. Se cerrarán sus sesiones y deberá cambiarla al iniciar sesión. Comunícasela por un canal seguro: no se mostrará después de guardarla.`}
      formId="reset-user-password" submitLabel="Restablecer" pendingLabel="Restableciendo…" pending={pending}>
      <form id="reset-user-password" onSubmit={submit} noValidate className="space-y-3">
        <Field>
          <FieldLabel htmlFor="temporary-password">Contraseña temporal</FieldLabel>
          <PasswordInput id="temporary-password" name="contrasena_temporal" autoComplete="off" required disabled={pending}
            toggleLabel="contraseña temporal" aria-invalid={invalid} aria-describedby="temporary-password-policy"
            onChange={() => { setInvalid(false); setFailure(""); }} />
          <p id="temporary-password-policy" className="text-sm text-gray-500 dark:text-gray-400">{PASSWORD_VALIDATION_MESSAGE}</p>
        </Field>
        {failure && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{failure}</p>}
      </form>
    </FormDialog>
  );
}
