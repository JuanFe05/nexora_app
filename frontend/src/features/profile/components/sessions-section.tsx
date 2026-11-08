import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/features/auth/use-auth";
import { ApiError } from "@/lib/http/api-error";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/shared/toast/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClockIcon, DesktopIcon, MobileIcon, RefreshIcon, LogOutIcon } from "@/icons";
import { listSessions, revokeSession, sessionFailure } from "../api/profile-api";
import type { ProfileSession } from "../types";
import { parseSessionDevice } from "../session-device";

const dates = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" });
function sessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dates.format(date);
}
/** Mounted on first visit and retained by the tab panel. Cache is scoped to this profile page. */
export function SessionsSection() {
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<{ items: ProfileSession[]; loading: boolean; error: string | null }>({ items: [], loading: true, error: null });
  const [selected, setSelected] = useState<ProfileSession | null>(null);
  const [pending, setPending] = useState(false);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [logoutAllPending, setLogoutAllPending] = useState(false);
  const { logoutAll } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  async function confirmLogoutAll() {
    if (logoutAllPending) return;
    setLogoutAllPending(true);
    try {
      await logoutAll();
      await navigate("/signin", { replace: true });
    } catch {
      toast.error("No se pudieron cerrar las sesiones. Intenta de nuevo.");
    } finally { setLogoutAllPending(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void listSessions(controller.signal).then(
      (items) => { if (active) setState({ items, loading: false, error: null }); },
      (error: unknown) => { if (active) setState((previous) => ({ ...previous, loading: false, error: sessionFailure(error) })); },
    );
    return () => { active = false; controller.abort(); };
  }, [request]);
  function refresh() {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    setRequest((previous) => previous + 1);
  }
  async function confirm() {
    if (!selected || selected.actual || pending) return;
    setPending(true);
    try {
      await revokeSession(selected.id);
      setState((previous) => ({ ...previous, items: previous.items.filter((item) => item.id !== selected.id) }));
      setSelected(null);
      toast.success("Sesión revocada.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setSelected(null);
        toast.info(sessionFailure(error));
        refresh();
      } else toast.error(sessionFailure(error));
    } finally { setPending(false); }
  }
  return <section aria-labelledby="sessions-title" className="min-w-0">
    <Card className="min-w-0 shadow-theme-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="sessions-title" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90"><DesktopIcon aria-hidden="true" className="size-6" />Sesiones activas</h2>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <Button variant="outline" size="sm" disabled={state.loading || pending} onClick={refresh}><RefreshIcon aria-hidden="true" className="size-5" />Actualizar</Button>
          <Button variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" onClick={() => setLogoutAllOpen(true)}><LogOutIcon aria-hidden="true" className="size-5" />Cerrar todas las sesiones</Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">Consulta los dispositivos con acceso a tu cuenta y revoca los que no reconozcas.</p>
      {state.loading && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Cargando sesiones…</p>}
      {state.error && <div className="space-y-3"><p className="text-sm text-red-600 dark:text-red-400">{state.error}</p><Button variant="outline" size="sm" onClick={refresh}>Reintentar</Button></div>}
      {!state.loading && !state.error && !state.items.length && <p className="text-sm text-gray-500 dark:text-gray-400">No hay sesiones activas disponibles.</p>}
      {!state.loading && !state.error && state.items.length > 0 && <ul aria-label="Sesiones activas" className="space-y-4">
        {state.items.map((item) => {
          const device = parseSessionDevice(item.agente_usuario);
          const Icon = device.type === "mobile" ? MobileIcon : device.type === "desktop" ? DesktopIcon : ClockIcon;
          return <li key={item.id} className="min-w-0 rounded-xl border border-gray-200 p-4 sm:p-5 dark:border-gray-800">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"><Icon aria-hidden="true" className="size-6" /></div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2"><h3 title={item.agente_usuario ?? undefined} className="text-sm font-semibold break-words text-gray-800 dark:text-white/90">{device.label}</h3>{item.actual && <Badge variant="info">Sesión actual</Badge>}</div>
                <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <div className="min-w-0"><dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">Dirección IP</dt><dd className="break-all text-gray-800 dark:text-white/90">{item.direccion_ip || "—"}</dd></div>
                  <div><dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">Inicio de sesión</dt><dd className="text-gray-800 dark:text-white/90"><time dateTime={item.fecha_creacion}>{sessionDate(item.fecha_creacion)}</time></dd></div>
                  <div><dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">Última actividad</dt><dd className="text-gray-800 dark:text-white/90"><time dateTime={item.fecha_ultima_actividad}>{sessionDate(item.fecha_ultima_actividad)}</time></dd></div>
                </dl>
              </div>
              {!item.actual && <Button variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" disabled={pending} onClick={() => setSelected(item)}><LogOutIcon aria-hidden="true" className="size-5" />Revocar</Button>}
            </div>
          </li>;
        })}
      </ul>}
    </Card>
    <ConfirmDialog open={logoutAllOpen} onOpenChange={(next) => { if (!logoutAllPending) setLogoutAllOpen(next); }} title="¿Cerrar todas las sesiones?"
      description="Se cerrarán todas tus sesiones activas y tendrás que iniciar sesión de nuevo." variant="danger"
      confirmLabel="Cerrar sesiones" pendingLabel="Cerrando sesiones…" pending={logoutAllPending} onConfirm={() => void confirmLogoutAll()} />
    <ConfirmDialog open={selected !== null} onOpenChange={(open) => { if (!open && !pending) setSelected(null); }} title="¿Revocar sesión?"
      description="Se cerrará el acceso en este dispositivo. Tendrá que iniciar sesión de nuevo." variant="danger" confirmLabel="Revocar sesión" pendingLabel="Revocando…" pending={pending} onConfirm={() => void confirm()} />
  </section>;
}
