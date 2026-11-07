import { useState } from "react";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LayoutGridIcon, UsersIcon } from "@/icons";
import type { PermissionOption } from "../types";
import { groupPermissionOptions } from "./permission-grid";

// Presentation only: the seeded backend catalog currently has one module, identity.
const modulePresentation = new Map([
  ["identity", { description: "Usuarios, roles y permisos de acceso.", Icon: UsersIcon }],
]);

type Props = {
  options: PermissionOption[];
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  disabled?: boolean;
};
export function PermissionChecklist({ options, selected, onChange, disabled = false }: Props) {
  const groups = groupPermissionOptions(options);
  // Both create and edit start collapsed; selection changes never override user navigation.
  const [expanded, setExpanded] = useState<string[]>([]);
  const count = options.filter(permission => selected.has(permission.codigo)).length;
  const allSelected = options.length > 0 && count === options.length;
  function toggle(codes: string[], checked: boolean) {
    if (disabled) return;
    const next = new Set(selected);
    for (const code of codes) { if (checked) next.add(code); else next.delete(code); }
    onChange(next);
  }
  return <section aria-label="Permisos del rol" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold text-gray-800 dark:text-white/90">Permisos</h3>
      <span aria-live="polite" aria-atomic="true" className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium tabular-nums text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">{count} de {options.length} seleccionados</span>
    </div>
    <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona acciones independientes para cada módulo.</p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="xs" disabled={disabled || !options.length} onClick={() => toggle(options.map(permission => permission.codigo), !allSelected)}>{allSelected ? "Deseleccionar todos" : "Seleccionar todos"}</Button>
      <Button type="button" variant="ghost" size="xs" disabled={!options.length} onClick={() => setExpanded(groups.map(([module]) => module))}>Expandir todos</Button>
      <Button type="button" variant="ghost" size="xs" disabled={!options.length} onClick={() => setExpanded([])}>Contraer todos</Button>
    </div>
    {!options.length && <p className="text-sm text-gray-500 dark:text-gray-400">No hay permisos en el catálogo.</p>}
    <Accordion multiple value={expanded} onValueChange={setExpanded}>
      {groups.map(([module, permissions]) => {
        const moduleCount = permissions.filter(permission => selected.has(permission.codigo)).length;
        const presentation = modulePresentation.get(module);
        const Icon = presentation?.Icon ?? LayoutGridIcon;
        return <AccordionItem key={module} value={module} role="group" aria-label={module}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:pr-4">
            <AccordionHeader className="sm:flex-1">
              <AccordionTrigger aria-label={module}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-400"><Icon data-slot="module-icon" aria-hidden="true" className="size-5" /></span>
                <span className="min-w-0 flex-1"><span className="block break-words font-semibold">{module}</span><span className="mt-1 block text-xs font-normal text-gray-500 dark:text-gray-400">{presentation?.description ?? `Permisos del módulo ${module}`}</span></span>
              </AccordionTrigger>
            </AccordionHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-4 sm:shrink-0 sm:flex-col sm:items-end sm:px-0 sm:pb-0">
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">{moduleCount} de {permissions.length} seleccionados</span>
              <Label className="text-xs">
                <Checkbox aria-label={`Seleccionar todos de ${module}`} checked={moduleCount === permissions.length} indeterminate={moduleCount > 0 && moduleCount < permissions.length} disabled={disabled} className="data-indeterminate:border-brand-500 data-indeterminate:bg-brand-50 dark:data-indeterminate:bg-brand-500/20" onCheckedChange={checked => toggle(permissions.map(permission => permission.codigo), checked)} />
                {moduleCount === permissions.length ? "Deseleccionar todos" : "Seleccionar todos"}
              </Label>
            </div>
          </div>
          <AccordionPanel>
            <div data-slot="permission-grid" className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              {permissions.map(permission => <Label key={permission.id} htmlFor={`role-permission-${permission.id}`} className={`min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 leading-normal transition-colors has-focus-visible:ring-3 has-focus-visible:ring-brand-500/20 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-50 ${selected.has(permission.codigo) ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10" : "border-gray-200 bg-white hover:border-brand-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-brand-500 dark:hover:bg-gray-800"}`}>
                <Checkbox id={`role-permission-${permission.id}`} aria-label={permission.nombre} checked={selected.has(permission.codigo)} disabled={disabled} onCheckedChange={checked => toggle([permission.codigo], checked)} />
                <span className="min-w-0 break-words font-semibold text-gray-800 dark:text-white/90">{permission.nombre}</span>
              </Label>)}
            </div>
          </AccordionPanel>
        </AccordionItem>;
      })}
    </Accordion>
  </section>;
}
