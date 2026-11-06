import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormDrawer } from "@/components/shared/form-drawer";
import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loadPermissionOptions } from "../api/permission-options";
import { roleErrorMessage } from "../api/roles-api";
import { ADMINISTRATOR_CODE } from "../constants";
import { validateRole } from "../hooks/role-validation";
import { useRoleSave } from "../hooks/use-role-save";
import type { PermissionOption, Role, RoleFieldErrors, RoleValues } from "../types";
import { PermissionChecklist } from "./permission-checklist";

type Props = { role: Role | null; onClose: () => void; onReload: () => void; onSuccess: (created: boolean) => void };
export function RoleDrawer({ role, onClose, onReload, onSuccess }: Props) {
  const [values, setValues] = useState<RoleValues>({ codigo: role?.codigo ?? "", nombre: role?.nombre ?? "", descripcion: role?.descripcion ?? "", estado: role?.estado ?? "activo" });
  const [selected, setSelected] = useState(new Set(role?.permisos ?? []));
  const [errors, setErrors] = useState<RoleFieldErrors>({});
  const [catalog, setCatalog] = useState<{ items: PermissionOption[]; loading: boolean; error: string | null }>({ items: [], loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const mutation = useRoleSave(role, onReload, onSuccess);
  const administrator = mutation.savedRole?.codigo === ADMINISTRATOR_CODE;

  useEffect(() => {
    const controller = new AbortController();
    void loadPermissionOptions(controller.signal).then(items => {
      if (!controller.signal.aborted) setCatalog({ items, loading: false, error: null });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setCatalog({ items: [], loading: false, error: `No se pudo cargar el catálogo de permisos. ${roleErrorMessage(failure)}` });
    });
    return () => controller.abort();
  }, [revision]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.pending) return;
    const next = validateRole(values, mutation.savedRole);
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (catalog.loading || catalog.error) return;
    void mutation.save(values, selected, catalog.items);
  }
  function update(field: keyof RoleValues, value: string) {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  }
  return <FormDrawer open onOpenChange={open => { if (!open) onClose(); }} title={role ? "Editar rol" : "Nuevo rol"} description="Administra los datos del rol y sus permisos." formId="role-form" pending={mutation.pending}>
    <form id="role-form" ref={form} onSubmit={submit} noValidate className="space-y-5 py-4">
      {mutation.error && <InlineAlert variant="error">{mutation.error}</InlineAlert>}
      <fieldset disabled={mutation.pending} className="space-y-5">
        {([['codigo', 'Código'], ['nombre', 'Nombre'], ['descripcion', 'Descripción']] as const).map(([field, label]) => <Field key={field} controlId={`role-${field}`} data-invalid={!!errors[field]}>
          <FieldLabel>{label}</FieldLabel>
          <Input name={field} value={values[field]} readOnly={field === "codigo" && !!mutation.savedRole} onChange={event => update(field, event.target.value)} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `role-${field}-error` : field === "codigo" ? "role-code-hint" : undefined} />
          {field === "codigo" && <p id="role-code-hint" className="text-xs text-gray-500 dark:text-gray-400">{mutation.savedRole ? "El código no se puede modificar." : "De 2 a 50 caracteres: mayúsculas, números o guion bajo."}</p>}
          {errors[field] && <p id={`role-${field}-error`} className="text-sm text-red-500 dark:text-red-400">{errors[field]}</p>}
        </Field>)}
        {mutation.savedRole && <Field controlId="role-estado">
          <FieldLabel>Estado</FieldLabel>
          <select id="role-estado" name="estado" value={values.estado} disabled={administrator || mutation.pending} onChange={event => update("estado", event.target.value)} aria-describedby={administrator ? "role-status-hint" : undefined} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:ring-2 focus:ring-brand-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
          </select>
          {administrator && <p id="role-status-hint" className="text-xs text-gray-500 dark:text-gray-400">ADMINISTRADOR no se puede desactivar.</p>}
        </Field>}
        {administrator && <InlineAlert>Los permisos de ADMINISTRADOR están protegidos por el sistema.</InlineAlert>}
        {catalog.loading ? <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Cargando permisos…</p> : catalog.error ? <div className="space-y-3"><InlineAlert variant="error">{catalog.error}</InlineAlert><Button type="button" variant="outline" onClick={() => { setCatalog({ items: [], loading: true, error: null }); setRevision(value => value + 1); }}>Reintentar catálogo</Button></div> : <PermissionChecklist options={catalog.items} selected={selected} onChange={setSelected} disabled={administrator || mutation.pending} />}
      </fieldset>
    </form>
  </FormDrawer>;
}
