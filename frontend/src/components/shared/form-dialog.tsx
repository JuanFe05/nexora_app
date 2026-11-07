import type { ReactNode } from "react";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type FormDialogProps = {
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
  /** Optional dialog sizing; other consumers retain sm:max-w-xl. */
  className?: string;
};

/**
 * TailAdmin «Dialog with Form»: diálogo modal con encabezado, cuerpo con scroll y pie Cancelar/Guardar.
 * No se cierra (Escape, clic fuera, botón X) mientras guarda.
 */
export function FormDialog({ open, onOpenChange, title, description, formId, submitLabel = "Guardar", pendingLabel = "Guardando…", pending = false, children, className }: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-xl", className)} aria-busy={pending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="-mx-2 overflow-y-auto px-2 py-1">{children}</div>
        <DialogFooter className="border-t border-gray-200 pt-4 dark:border-gray-800">
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit" form={formId} disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
