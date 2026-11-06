import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import type { RoleOption } from "../types";

export function UserRoleChecklist({ catalog, selected, onChange, loading, error, onRetry, disabled = false }: {
  catalog: RoleOption[]; selected: string[]; onChange: (codes: string[]) => void;
  loading: boolean; error: string | null; onRetry: () => void; disabled?: boolean;
}) {
  const missing = selected.filter(code => !catalog.some(role => role.codigo === code));
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
    <legend className="px-1 text-sm font-medium text-gray-800 dark:text-gray-200">Roles</legend>
    {disabled ? <p className="text-sm text-gray-500 dark:text-gray-400">Necesitas el permiso identity.roles.view para consultar el catálogo y asignar roles.</p> : loading ? <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Cargando roles…</p> : error ? <>
      <InlineAlert variant="error">{error}</InlineAlert>
      <Button type="button" variant="outline" onClick={onRetry}>Reintentar roles</Button>
    </> : <>
      {!catalog.length && <p className="text-sm text-gray-500 dark:text-gray-400">No hay roles disponibles.</p>}
      {catalog.map(role => <Field key={role.id} orientation="horizontal" controlId={`user-role-${role.id}`}>
        <Checkbox checked={selected.includes(role.codigo)} onCheckedChange={checked => onChange(checked ? [...selected, role.codigo] : selected.filter(code => code !== role.codigo))} />
        <Label htmlFor={`user-role-${role.id}`}>{role.nombre} <span className="text-xs text-gray-500 dark:text-gray-400">({role.codigo})</span></Label>
      </Field>)}
      {!!missing.length && <InlineAlert>Roles fuera del catálogo actual (se conservarán): {missing.join(", ")}.</InlineAlert>}
    </>}
  </fieldset>;
}
