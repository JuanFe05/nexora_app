import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordEditor } from "@/features/profile/components/password-form";
import { useAuth } from "../use-auth";

export function RequiredPasswordChange() {
  const { logout, reloadPrincipal } = useAuth();
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);

  async function confirmChange() {
    setChecking(true);
    try {
      await reloadPrincipal();
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-12">
      <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">Cambio de contraseña obligatorio</h1>
      {!saved ? <>
        <p className="text-sm text-gray-600 dark:text-gray-300">Para continuar, reemplaza tu contraseña temporal por una contraseña personal.</p>
        <PasswordEditor onSaved={() => {
          setSaved(true);
          void confirmChange();
        }} />
      </> : <>
        <p role="status" className="text-sm text-gray-600 dark:text-gray-300">
          {checking ? "Verificando tu sesión…" : "No se pudo confirmar el acceso. Vuelve a verificar o inicia sesión con tu nueva contraseña."}
        </p>
        <Button type="button" disabled={checking} onClick={() => void confirmChange()}>Verificar acceso</Button>
      </>}
      <Button type="button" variant="outline" onClick={() => void logout()}>Cerrar sesión</Button>
    </main>
  );
}
