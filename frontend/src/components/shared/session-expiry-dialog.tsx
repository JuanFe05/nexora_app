import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { authSession } from "@/features/auth/session/session";

type WarningSession = Pick<typeof authSession, "subscribe" | "getSnapshot" | "subscribeWarning" | "getWarningSnapshot" | "refresh" | "logout">;

/** Sibling overlay: warning updates never change auth status or replace protected routes. */
export function SessionExpiryDialog({ session = authSession }: { session?: WarningSession }) {
  const auth = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const warning = useSyncExternalStore(session.subscribeWarning, session.getWarningSnapshot);
  if (auth.status !== "authenticated" || !warning.open) return null;
  return <WarningDialog key={warning.deadlineAt} session={session} deadlineAt={warning.deadlineAt} />;
}

function WarningDialog({ session, deadlineAt }: { session: WarningSession; deadlineAt: number }) {
  const [now, setNow] = useState(Date.now);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const continueRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);
  const remaining = Math.max(0, Math.ceil((deadlineAt - now) / 1000));
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  async function continueSession() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try { await session.refresh(); } catch {
      if (mounted.current) setError("No se pudo renovar la sesión. Intenta de nuevo.");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return (
    // Controlled open: Escape and outside interaction are deliberately no action.
    <AlertDialog.Root open onOpenChange={() => undefined}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-100 bg-black/50 backdrop-blur-xs dark:bg-black/70" />
        <AlertDialog.Popup initialFocus={continueRef} className="fixed top-1/2 left-1/2 z-101 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-lg outline-none dark:border-gray-800 dark:bg-gray-900" aria-busy={pending}>
          <AlertDialog.Title className="text-lg font-semibold text-gray-800 dark:text-white/90">Tu sesión está por expirar. ¿Deseas continuar trabajando?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Tiempo restante: <span role="timer" aria-live="off" aria-label="Tiempo restante de sesión" className="font-semibold tabular-nums">{countdown}</span>
          </AlertDialog.Description>
          {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => { void session.logout(); }}>Cerrar sesión</Button>
            <Button ref={continueRef} type="button" disabled={pending} onClick={() => { void continueSession(); }}>Continuar sesión</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
