import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { PermissionOption } from "../types";

type Props = {
  options: PermissionOption[];
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  disabled?: boolean;
};
export function PermissionChecklist({ options, selected, onChange, disabled = false }: Props) {
  const groups = new Map<string, PermissionOption[]>();
  for (const option of options) groups.set(option.modulo, [...(groups.get(option.modulo) ?? []), option]);
  function toggle(codes: string[], checked: boolean) {
    const next = new Set(selected);
    for (const code of codes) { if (checked) next.add(code); else next.delete(code); }
    onChange(next);
  }
  return <section aria-label="Permisos del rol" className="space-y-4">
    <h3 className="font-medium text-gray-800 dark:text-white/90">Permisos</h3>
    {!options.length && <p className="text-sm text-gray-500 dark:text-gray-400">No hay permisos en el catálogo.</p>}
    {[...groups].sort(([a], [b]) => a.localeCompare(b, "es")).map(([module, permissions]) => {
      const count = permissions.filter(permission => selected.has(permission.codigo)).length;
      return <fieldset key={module} disabled={disabled} className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{module}</legend>
        <Card size="sm">
          <Label className="flex-wrap leading-normal">
            <Checkbox aria-label={`Seleccionar todos de ${module}`} checked={count === permissions.length} indeterminate={count > 0 && count < permissions.length} disabled={disabled} onCheckedChange={checked => toggle(permissions.map(permission => permission.codigo), checked)} />
            Seleccionar todos
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{count} de {permissions.length} seleccionados</span>
          </Label>
          <div className="space-y-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            {permissions.map(permission => <Label key={permission.id} className="items-start leading-normal">
              <Checkbox aria-label={permission.nombre} checked={selected.has(permission.codigo)} disabled={disabled} onCheckedChange={checked => toggle([permission.codigo], checked)} />
              <span className="min-w-0"><span className="block">{permission.nombre}</span><span className="block break-all text-xs font-normal text-gray-500 dark:text-gray-400">{permission.codigo}</span></span>
            </Label>)}
          </div>
        </Card>
      </fieldset>;
    })}
  </section>;
}
