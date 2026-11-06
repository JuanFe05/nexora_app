import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  pending?: boolean;
  pendingLabel?: string;
};

/** La página controla cierre/errores; confirmar no cierra antes de terminar la mutación. */
export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, confirmLabel = "Confirmar", cancelLabel = "Cancelar", variant = "default", pending = false, pendingLabel = "Eliminando…" }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-100 bg-black/50 backdrop-blur-xs dark:bg-black/70" />
        <AlertDialog.Popup initialFocus={cancelRef} className="fixed top-1/2 left-1/2 z-101 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg outline-none dark:border-gray-800 dark:bg-gray-900" aria-busy={pending}>
          <AlertDialog.Title className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-gray-500 dark:text-gray-400">{description}</AlertDialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <AlertDialog.Close render={<Button ref={cancelRef} type="button" variant="outline" disabled={pending} />}>{cancelLabel}</AlertDialog.Close>
            <Button type="button" variant={variant === "danger" ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>{pending ? pendingLabel : confirmLabel}</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
