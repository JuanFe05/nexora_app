import { useId, useRef, useState, type FormEvent } from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useRoleOptions } from "../hooks/use-role-options";
import { useUserSave } from "../hooks/use-user-save";
import { userValues, validateUser } from "../hooks/user-validation";
import type { User, UserFieldErrors, UserValues } from "../types";
import { UserFields } from "./user-fields";
import { UserRoleChecklist } from "./user-role-checklist";

export function UserDrawer({ user, onClose, onSaved, onFailed }: {
  user: User | null; onClose: () => void; onSaved: () => void; onFailed: () => void;
}) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState(() => userValues(user));
  const [selected, setSelected] = useState(user?.roles ?? []);
  const [errors, setErrors] = useState<UserFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const catalog = useRoleOptions(!!user);
  const { save, pending } = useUserSave(user);

  function focusError(nextErrors: UserFieldErrors) {
    const first = Array.from(formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? []).find(input => nextErrors[input.name as keyof UserValues]);
    first?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const password = form.elements.namedItem("contrasena") as HTMLInputElement | null;
    const submitted = { ...values, contrasena: password?.value ?? "" };
    const nextErrors = validateUser(submitted, user);
    setErrors(nextErrors);
    setMessage(null);
    if (Object.keys(nextErrors).length) { focusError(nextErrors); return; }
    if (!catalog.ready) { setMessage("Carga el catálogo completo de roles antes de guardar."); return; }
    const result = await save(submitted, selected, catalog.items);
    if (password) password.value = "";
    if (result.ok) onSaved();
    else {
      setErrors(result.fields);
      setMessage(result.message);
      focusError(result.fields);
      onFailed();
    }
  }

  return <FormDrawer open onOpenChange={open => { if (!open) onClose(); }} title={user ? `Editar usuario: ${user.nombre_usuario}` : "Nuevo usuario"} description={user ? "Edita los datos personales, el estado y los roles. Los cambios se guardan por pasos; no se cambia la contraseña." : "Los campos con * son obligatorios."} formId={formId} pending={pending}>
    <form id={formId} ref={formRef} onSubmit={event => { void submit(event); }} noValidate className="space-y-5 py-4">
      {message && <InlineAlert variant="error">{message}</InlineAlert>}
      <fieldset disabled={pending} className="space-y-5">
        <UserFields values={values} errors={errors} editing={!!user} onChange={(name, value) => {
          setValues(current => ({ ...current, [name]: value }));
          setErrors(current => ({ ...current, [name]: undefined }));
        }} />
        {user && <>
          <p className="text-sm text-gray-500 dark:text-gray-400">Los campos opcionales ya guardados no pueden vaciarse: el backend no admite valores nulos.</p>
          <UserRoleChecklist catalog={catalog.items} selected={selected} onChange={setSelected} loading={catalog.loading} error={catalog.error} onRetry={catalog.retry} />
        </>}
      </fieldset>
    </form>
  </FormDrawer>;
}
