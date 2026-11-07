import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast/use-toast";
import { deletePermission, permissionErrorMessage } from "../api/permissions-api";
import type { Permission } from "../types";

type Props = { permission: Permission; onClose: () => void; onDeleted: () => void };

export function PermissionDeleteDialog({ permission, onClose, onDeleted }: Props) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const submitting = useRef(false);

  async function confirm() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      await deletePermission(permission.id);
      onDeleted();
    } catch (cause: unknown) {
      toast.error(permissionErrorMessage(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <ConfirmDialog open onOpenChange={open => { if (!open && !submitting.current) onClose(); }} title="Eliminar permiso"
      description={<>
        ¿Eliminar el permiso «{permission.nombre}» ({permission.codigo})? Esta acción no se puede deshacer.
      </>}
      confirmLabel="Eliminar" variant="danger" pending={pending} onConfirm={() => { void confirm(); }} />
  );
}
