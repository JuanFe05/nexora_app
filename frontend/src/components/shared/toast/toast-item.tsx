import { useEffect, useState } from "react";
import { XIcon } from "@/icons";
import { cn } from "@/utils";
import { alertStyles } from "../alert-styles";
import type { ToastItem } from "./toast-context";

export function Toast({ toast, duration, onDismiss }: { toast: ToastItem; duration: number; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const time = toast.duration ?? duration;
  useEffect(() => {
    if (paused || time <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), time);
    return () => clearTimeout(timer);
  }, [paused, time, toast.id, onDismiss]);
  return (
    <li data-toast data-variant={toast.variant} role={toast.variant === "error" || toast.variant === "warning" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      className={cn("pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-theme-lg backdrop-blur-sm", alertStyles[toast.variant])}>
      <div className="min-w-0 flex-1 break-words">
        {toast.title && <p className="font-semibold">{toast.title}</p>}
        <p>{toast.message}</p>
      </div>
      <button type="button" aria-label="Cerrar notificación" onClick={() => onDismiss(toast.id)}
        className="-me-1 shrink-0 rounded-md p-1 opacity-70 transition hover:opacity-100 focus-visible:ring-3 focus-visible:ring-current/30 focus-visible:outline-hidden">
        <XIcon aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}
