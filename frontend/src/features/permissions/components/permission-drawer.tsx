import { useRef, useState, type FormEvent } from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createPermission, permissionErrorMessage, updatePermission } from "../api/permissions-api";
import { permissionChanges, permissionFields, permissionValues, validatePermission } from "../hooks/permission-form";
import type { Permission, PermissionErrors } from "../types";

type Props = {
  permission?: Permission;
  onClose: () => void;
  onSaved: (message: string, changed: boolean) => void;
};

export function PermissionDrawer({ permission, onClose, onSaved }: Props) {
  const [values, setValues] = useState(() => permissionValues(permission));
  const [errors, setErrors] = useState<PermissionErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = validatePermission(values, permission);
    setErrors(nextErrors);
    setError(null);
    const firstInvalid = permissionFields.find(field => nextErrors[field.name]);
    if (firstInvalid) {
      (formRef.current?.elements.namedItem(firstInvalid.name) as HTMLInputElement | null)?.focus();
      return;
    }
    if (permission && Object.keys(permissionChanges(permission, values)).length === 0) {
      onSaved("No hay cambios que guardar.", false);
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      if (permission) await updatePermission(permission, values);
      else await createPermission(values);
      onSaved(permission ? "Permiso actualizado correctamente." : "Permiso creado correctamente.", true);
    } catch (cause: unknown) {
      setError(permissionErrorMessage(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <FormDrawer open onOpenChange={open => { if (!open) onClose(); }} title={permission ? "Editar permiso" : "Nuevo permiso"}
      description={permission ? "Actualiza los datos del permiso. El código no se puede modificar." : "Agrega un permiso al catálogo. Los campos con * son obligatorios."}
      formId="permission-form" pending={pending}>
      <form ref={formRef} id="permission-form" noValidate onSubmit={submit} className="space-y-5 py-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        {permissionFields.map(field => {
          const invalid = errors[field.name];
          const id = `permission-${field.name}`;
          const help = field.name === "codigo" ? "Ejemplo: identity.users.view" : field.name === "descripcion" ? "Opcional al crear. Una descripción existente no se puede vaciar." : null;
          return (
            <Field key={field.name} controlId={id} data-invalid={Boolean(invalid)}>
              <FieldLabel>{field.label}{field.required && <span aria-hidden="true" className="text-red-500">*</span>}</FieldLabel>
              <Input name={field.name} value={values[field.name]} disabled={pending} required={field.required}
                readOnly={field.name === "codigo" && Boolean(permission)}
                aria-invalid={Boolean(invalid)} aria-describedby={invalid ? `${id}-error` : help ? `${id}-help` : undefined}
                onChange={event => {
                  const value = event.target.value;
                  setValues(current => ({ ...current, [field.name]: value }));
                  setErrors(current => ({ ...current, [field.name]: undefined }));
                }} />
              {invalid ? <p id={`${id}-error`} className="text-sm text-red-500 dark:text-red-400">{invalid}</p>
                : help ? <p id={`${id}-help`} className="text-xs text-gray-500 dark:text-gray-400">{help}</p> : null}
            </Field>
          );
        })}
      </form>
    </FormDrawer>
  );
}
