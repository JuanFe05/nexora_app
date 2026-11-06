import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type FormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** `id` del <form> que renderiza la página dentro de `children`; el botón de guardar lo envía. */
  formId: string;
  submitLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  children: ReactNode;
};

/** Panel lateral para crear/editar: encabezado, cuerpo con scroll y pie con Cancelar/Guardar. No se cierra mientras guarda. */
export function FormDrawer({ open, onOpenChange, title, description, formId, submitLabel = "Guardar", pendingLabel = "Guardando…", pending = false, children }: FormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <SheetContent className="w-full sm:max-w-lg" aria-busy={pending}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="-mx-2 flex-1 overflow-y-auto px-2">{children}</div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form={formId} disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
