import { useEffect, useRef, useState, type FormEvent } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PERMISSIONS } from "@/features/auth/permissions";
import { useAuth } from "@/features/auth/use-auth";
import { loadPermissionOptions } from "../api/permission-options";
import { roleErrorMessage } from "../api/roles-api";
import { ADMINISTRATOR_CODE, ROLE_DESCRIPTION_MAX_LENGTH } from "../constants";
import { validateRole } from "../hooks/role-validation";
import { useRoleSave } from "../hooks/use-role-save";
import type { PermissionOption, Role, RoleFieldErrors, RoleValues } from "../types";
import { PermissionChecklist } from "./permission-checklist";

type Props = { role: Role | null; onClose: () => void; onReload: () => void; onSuccess: (created: boolean) => void };
export function RoleDrawer({ role, onClose, onReload, onSuccess }: Props) {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.rolesCreate);
  const canUpdate = hasPermission(PERMISSIONS.rolesUpdate);
  const canAssign = hasPermission(PERMISSIONS.rolesAssignPermissions);
  const canViewCatalog = hasPermission(PERMISSIONS.permissionsView);
  // Creation only offers a catalog when selection is authorized; editing can show it read-only.
  const needsCatalog = canViewCatalog && (!!role || canAssign);
  const [values, setValues] = useState<RoleValues>({ codigo: role?.codigo ?? "", nombre: role?.nombre ?? "", descripcion: role?.descripcion ?? "", estado: role?.estado ?? "activo" });
  const [selected, setSelected] = useState(new Set(role?.permisos ?? []));
  const [errors, setErrors] = useState<RoleFieldErrors>({});
  const [catalog, setCatalog] = useState<{ items: PermissionOption[]; loading: boolean; error: string | null }>({ items: [], loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const mutation = useRoleSave(role, { create: canCreate, update: canUpdate, assignPermissions: canAssign && canViewCatalog }, onReload, onSuccess);
  const toast = useToast();
  useEffect(() => { if (mutation.error) toast.error(mutation.error); }, [mutation.error, toast]);
  const administrator = mutation.savedRole?.codigo === ADMINISTRATOR_CODE;
  const canEditFields = mutation.savedRole ? canUpdate : canCreate;
  const canEditPermissions = canAssign && canViewCatalog && !administrator;
  const readOnly = !canEditFields && !canEditPermissions;

  useEffect(() => {
    if (!needsCatalog) return;
    const controller = new AbortController();
    void loadPermissionOptions(controller.signal).then(items => {
      if (!controller.signal.aborted) setCatalog({ items, loading: false, error: null });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setCatalog({ items: [], loading: false, error: `No se pudo cargar el catálogo de permisos. ${roleErrorMessage(failure)}` });
    });
    return () => controller.abort();
  }, [revision, needsCatalog]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.pending) return;
    if (readOnly) { onClose(); return; }
    const next = canEditFields ? validateRole(values, mutation.savedRole) : {};
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    if (canEditPermissions && (catalog.loading || catalog.error)) return;
    void mutation.save(values, selected, catalog.items);
  }
  function update(field: keyof RoleValues, value: string) {
    if (!canEditFields || mutation.pending || (field === "codigo" && mutation.savedRole) || (field === "estado" && administrator)) return;
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  }
  const descriptionLength = Array.from(values.descripcion.trim()).length;
  return <FormDialog className="sm:max-w-3xl" open onOpenChange={open => { if (!open && !mutation.pending) onClose(); }} title={role ? "Editar rol" : "Nuevo rol"} description="Administra los datos del rol y sus permisos." formId="role-form" submitLabel={readOnly ? "Cerrar" : "Guardar"} pending={mutation.pending}>
    <form id="role-form" ref={form} onSubmit={submit} noValidate className="space-y-6 py-4">
      <fieldset disabled={mutation.pending} className="space-y-6">
        <div className="grid grid-cols-1 items-start gap-5 sm:grid-cols-2">
        {([['codigo', 'Código'], ['nombre', 'Nombre']] as const).map(([field, label]) => <Field key={field} controlId={`role-${field}`} data-invalid={!!errors[field]}>
          <FieldLabel>{label}</FieldLabel>
          <Input name={field} value={values[field]} readOnly={!canEditFields || (field === "codigo" && !!mutation.savedRole)} onChange={event => update(field, event.target.value)} aria-invalid={!!errors[field]} aria-describedby={errors[field] ? `role-${field}-error` : field === "codigo" ? "role-code-hint" : undefined} />
          {field === "codigo" && <p id="role-code-hint" className="text-xs text-gray-500 dark:text-gray-400">{mutation.savedRole ? "El código no se puede modificar." : "De 2 a 50 caracteres: mayúsculas, números o guion bajo."}</p>}
          {errors[field] && <p id={`role-${field}-error`} className="text-sm text-red-500 dark:text-red-400">{errors[field]}</p>}
        </Field>)}
        </div>
        <Field controlId="role-descripcion" data-invalid={!!errors.descripcion}>
          <FieldLabel>Descripción</FieldLabel>
          <Textarea name="descripcion" value={values.descripcion} maxLength={ROLE_DESCRIPTION_MAX_LENGTH} readOnly={!canEditFields} onChange={event => update("descripcion", event.target.value)} aria-invalid={!!errors.descripcion} aria-describedby={`role-description-counter${errors.descripcion ? " role-descripcion-error" : ""}`} />
          <p id="role-description-counter" aria-live="polite" aria-atomic="true" className={`text-right text-xs tabular-nums ${descriptionLength >= ROLE_DESCRIPTION_MAX_LENGTH ? "text-red-500 dark:text-red-400" : descriptionLength >= Math.ceil(ROLE_DESCRIPTION_MAX_LENGTH * 0.9) ? "text-warning-600 dark:text-warning-400" : "text-gray-500 dark:text-gray-400"}`}>{descriptionLength}/{ROLE_DESCRIPTION_MAX_LENGTH}</p>
          {errors.descripcion && <p id="role-descripcion-error" className="text-sm text-red-500 dark:text-red-400">{errors.descripcion}</p>}
        </Field>
        {mutation.savedRole && <Field controlId="role-estado">
          <FieldLabel>Estado</FieldLabel>
          <select id="role-estado" name="estado" value={values.estado} disabled={!canUpdate || administrator || mutation.pending} onChange={event => update("estado", event.target.value)} aria-describedby={administrator ? "role-status-hint" : undefined} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:ring-2 focus:ring-brand-500 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
          </select>
          {administrator && <p id="role-status-hint" className="text-xs text-gray-500 dark:text-gray-400">ADMINISTRADOR no se puede desactivar.</p>}
        </Field>}
        {administrator && <InlineAlert>Los permisos de ADMINISTRADOR están protegidos por el sistema.</InlineAlert>}
        {canAssign && !canViewCatalog && <section aria-label="Permisos del rol" aria-disabled="true" className="space-y-2">
          <h3 className="font-medium text-gray-800 dark:text-white/90">Permisos</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Se requiere identity.permissions.view para consultar el catálogo y seleccionar permisos.</p>
        </section>}
        {needsCatalog && (catalog.loading ? <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Cargando permisos…</p> : catalog.error ? <div className="space-y-3"><InlineAlert variant="error">{catalog.error}</InlineAlert><Button type="button" variant="outline" onClick={() => { setCatalog({ items: [], loading: true, error: null }); setRevision(value => value + 1); }}>Reintentar catálogo</Button></div> : <PermissionChecklist options={catalog.items} selected={selected} onChange={next => { if (canEditPermissions && !mutation.pending) setSelected(next); }} disabled={!canEditPermissions || mutation.pending} />)}
      </fieldset>
    </form>
  </FormDialog>;
}
