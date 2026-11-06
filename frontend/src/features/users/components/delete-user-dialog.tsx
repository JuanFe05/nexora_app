import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineAlert } from "@/components/shared/inline-alert";
import { deleteUser } from "../api/users-api";
import { userError } from "../api/user-error";
import type { User } from "../types";

export function DeleteUserDialog({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await deleteUser(user.id);
      onDeleted();
    } catch (failure: unknown) {
      setError(userError(failure).message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <ConfirmDialog open onOpenChange={open => { if (!open && !pending) onClose(); }} title="Eliminar usuario" description={<>
    <span className="block">¿Eliminar al usuario «{user.nombre_usuario}»? Esta acción no se puede deshacer.</span>
    {error && <InlineAlert variant="error" className="mt-3">{error}</InlineAlert>}
  </>} confirmLabel="Eliminar" variant="danger" pending={pending} onConfirm={() => { void confirm(); }} />;
}
