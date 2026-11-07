import { useState } from "react";
import { useNavigate } from "react-router";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/use-auth";
import { LockIcon, LogOutIcon } from "@/icons";
import { PasswordForm } from "./password-form";

export function SecuritySection() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const { logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  async function confirm() {
    if (pending) return;
    setPending(true);
    try {
      await logoutAll();
      await navigate("/signin", { replace: true });
    } catch {
      toast.error("No se pudieron cerrar las sesiones. Intenta de nuevo.");
    } finally { setPending(false); }
  }

  return <section aria-labelledby="security-title">
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="security-title" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
          <LockIcon aria-hidden="true" className="size-6" />Seguridad
        </h2>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Gestiona el acceso a tu cuenta.</p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PasswordForm />
        <div className="flex min-w-0 flex-col gap-4 border-t border-gray-200 pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6 dark:border-gray-800" aria-labelledby="logout-all-title">
          <h3 id="logout-all-title" className="text-lg font-semibold text-gray-800 dark:text-white/90">Cerrar todas las sesiones</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Cierra el acceso en todos tus dispositivos, incluido este.</p>
          <Button variant="outline" size="sm" className="w-full sm:w-auto sm:self-start"
            onClick={() => setOpen(true)}><LogOutIcon aria-hidden="true" className="size-5" />Cerrar todas las sesiones</Button>
        </div>
      </div>
    </Card>
    <ConfirmDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }} title="¿Cerrar todas las sesiones?"
      description="Se cerrarán todas tus sesiones activas y tendrás que iniciar sesión de nuevo." variant="danger"
      confirmLabel="Cerrar sesiones" pendingLabel="Cerrando sesiones…" pending={pending} onConfirm={() => void confirm()} />
  </section>;
}
