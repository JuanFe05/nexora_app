import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast/use-toast";
import { deleteModeratorFees, moderatorFeesErrorMessage } from "../api/moderator-fees-api";
import type { ModeratorFees } from "../types";

type Props = { fee: ModeratorFees; onClose: () => void; onDeleted: () => void };

export function ModeratorFeesDeleteDialog({ fee, onClose, onDeleted }: Props) {
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const toast = useToast();
  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      await deleteModeratorFees(fee.vigencia);
      onDeleted();
    } catch (error: unknown) {
      toast.error(moderatorFeesErrorMessage(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return <ConfirmDialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }} title="Eliminar vigencia"
    description={`¿Eliminar las cuotas moderadoras de la vigencia ${fee.vigencia}? Esta acción no se puede deshacer.`}
    confirmLabel="Eliminar" variant="danger" pending={pending} onConfirm={() => { void confirm(); }} />;
}
