import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {catalog.map(role => <Label key={role.id} htmlFor={`user-role-${role.id}`} className={`min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-brand-500/20 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50 ${selected.includes(role.codigo) ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10" : "border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-gray-800"}`}>
          <Checkbox id={`user-role-${role.id}`} className="mt-0.5" checked={selected.includes(role.codigo)} onCheckedChange={checked => onChange(checked ? [...selected, role.codigo] : selected.filter(code => code !== role.codigo))} />
          <span className="min-w-0 space-y-1 leading-normal">
            <span className="block break-words font-semibold text-gray-800 dark:text-white/90">{role.nombre}</span>{" "}
            <span className="block break-all text-xs font-normal text-gray-500 dark:text-gray-400">({role.codigo})</span>
          </span>
        </Label>)}
      </div>
      {!!missing.length && <InlineAlert>Roles fuera del catálogo actual (se conservarán): {missing.join(", ")}.</InlineAlert>}
    </>}
  </fieldset>;
}
