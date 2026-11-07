import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TOAST_DURATION, ToastContext, type ToastApi, type ToastItem } from "./toast-context";
import { Toast } from "./toast-item";

const MAX_VISIBLE = 5;

/** Proveedor global: monta la región flotante y expone `useToast`. `duration` es el tiempo por defecto (ms). */
export function ToastProvider({ children, duration = DEFAULT_TOAST_DURATION }: { children: ReactNode; duration?: number }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const api = useMemo<ToastApi>(() => {
    const notify: ToastApi["notify"] = (input) => {
      const id = ++counter.current;
      setToasts((current) => [...current, { ...input, id }].slice(-MAX_VISIBLE));
      return id;
    };
    return {
      notify, dismiss,
      success: (message, options) => notify({ ...options, variant: "success", message }),
      error: (message, options) => notify({ ...options, variant: "error", message }),
      warning: (message, options) => notify({ ...options, variant: "warning", message }),
      info: (message, options) => notify({ ...options, variant: "info", message }),
    };
  }, [dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <section aria-label="Notificaciones" className="pointer-events-none fixed inset-x-4 top-4 z-99999 sm:inset-x-auto sm:end-6 sm:top-6 sm:w-full sm:max-w-sm">
        <ol className="flex flex-col gap-3">
          {toasts.map((toast) => <Toast key={toast.id} toast={toast} duration={duration} onDismiss={dismiss} />)}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}
