import { useId, useRef, useState, type FormEvent } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { useUserPermissions } from "../hooks/use-user-permissions";
import { useToast } from "@/components/shared/toast/use-toast";
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
  const toast = useToast();
  const permissions = useUserPermissions();
  const { save, pending, createdUser } = useUserSave(user, permissions);
  const personalEditable = user ? permissions.update : permissions.create && !createdUser;
  const canSave = user ? permissions.update || permissions.deactivate || permissions.editRoles : permissions.create;
  const catalog = useRoleOptions(permissions.editRoles);

  function focusError(nextErrors: UserFieldErrors) {
    const first = Array.from(formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select") ?? []).find(input => nextErrors[input.name as keyof UserValues]);
    first?.focus();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!canSave) { onClose(); return; }
    const form = event.currentTarget;
    const password = form.elements.namedItem("contrasena") as HTMLInputElement | null;
    const submitted = { ...values, contrasena: password?.value ?? "" };
    const nextErrors = validateUser(submitted, user ?? createdUser);
    if (user) {
      for (const name of Object.keys(nextErrors) as (keyof UserValues)[]) {
        if (name === "estado" ? !permissions.deactivate : !permissions.update) delete nextErrors[name];
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { focusError(nextErrors); return; }
    if (!catalog.ready) { toast.error("Carga el catálogo completo de roles antes de guardar."); return; }
    const result = await save(submitted, selected, catalog.items);
    if (password) password.value = "";
    if (result.ok) onSaved();
    else {
      setErrors(result.fields);
      toast.error(result.message);
      focusError(result.fields);
      onFailed();
    }
  }

  return <FormDialog open onOpenChange={open => { if (!open) onClose(); }} title={user ? `Editar usuario: ${user.nombre_usuario}` : "Nuevo usuario"} description={user ? "Edita los datos personales, el estado y los roles. Los cambios se guardan por pasos; no se cambia la contraseña." : "Los campos con * son obligatorios."} formId={formId} pending={pending} submitLabel={canSave ? "Guardar" : "Cerrar"}>
    <form id={formId} ref={formRef} onSubmit={event => { void submit(event); }} noValidate className="space-y-5 py-4">
      <fieldset disabled={pending} className="space-y-5">
        <UserFields values={values} errors={errors} editing={!!user} personalEditable={personalEditable} statusEditable={permissions.deactivate} onChange={(name, value) => {
          setValues(current => ({ ...current, [name]: value }));
          setErrors(current => ({ ...current, [name]: undefined }));
        }} />
        {user && personalEditable && <p className="text-sm text-gray-500 dark:text-gray-400">Los campos opcionales ya guardados no pueden vaciarse: el backend no admite valores nulos.</p>}
        {(permissions.editRoles || (!!user && permissions.assignRoles)) && <UserRoleChecklist catalog={catalog.items} selected={selected} onChange={setSelected} loading={catalog.loading} error={catalog.error} onRetry={catalog.retry} disabled={!permissions.editRoles} />}
      </fieldset>
    </form>
  </FormDialog>;
}
