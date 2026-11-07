import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { CSSProperties } from "react";
import type { PermissionOption } from "../types";
import { permissionGridLayout } from "./permission-grid";

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
      const layout = permissionGridLayout(permissions.length);
      let offset = 0;
      const columns = layout.columnSizes.map(size => {
        const column = permissions.slice(offset, offset + size);
        offset += size;
        return column;
      });
      const gridStyle = {
        "--permission-sm-columns": `repeat(${Math.min(2, layout.columns)}, minmax(0, 1fr))`,
        "--permission-lg-columns": `repeat(${Math.min(3, layout.columns)}, minmax(0, 1fr))`,
        "--permission-xl-columns": `repeat(${Math.min(4, layout.columns)}, minmax(0, 1fr))`,
      } as CSSProperties;
      return <fieldset key={module} disabled={disabled} className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{module}</legend>
        <Card size="sm">
          <Label className="flex-wrap leading-normal">
            <Checkbox aria-label={`Seleccionar todos de ${module}`} checked={count === permissions.length} indeterminate={count > 0 && count < permissions.length} disabled={disabled} onCheckedChange={checked => toggle(permissions.map(permission => permission.codigo), checked)} />
            Seleccionar todos
            <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{count} de {permissions.length} seleccionados</span>
          </Label>
          <div data-slot="permission-grid" style={gridStyle} className="grid grid-cols-1 items-start gap-3 border-t border-gray-100 pt-4 sm:grid-cols-[var(--permission-sm-columns)] lg:grid-cols-[var(--permission-lg-columns)] xl:grid-cols-[var(--permission-xl-columns)] dark:border-gray-800">
            {columns.map((column, index) => <div key={index} className="grid min-w-0 gap-3">
              {column.map(permission => <Label key={permission.id} htmlFor={`role-permission-${permission.id}`} className={`min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 leading-normal transition-colors has-focus-visible:ring-3 has-focus-visible:ring-brand-500/20 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50 ${selected.has(permission.codigo) ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10" : "border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-gray-800"}`}>
                <Checkbox id={`role-permission-${permission.id}`} aria-label={permission.nombre} checked={selected.has(permission.codigo)} disabled={disabled} onCheckedChange={checked => toggle([permission.codigo], checked)} />
                <span className="min-w-0"><span className="block break-words font-semibold text-gray-800 dark:text-white/90">{permission.nombre}</span><span className="block break-all text-xs font-normal text-gray-500 dark:text-gray-400">{permission.codigo}</span></span>
              </Label>)}
            </div>)}
          </div>
        </Card>
      </fieldset>;
    })}
  </section>;
}
