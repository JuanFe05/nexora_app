import { useContext } from "react";
import { ToastContext } from "./toast-context";

/** API única para mostrar avisos flotantes desde cualquier módulo: `toast.success("…")`. */
export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast debe usarse dentro de ToastProvider");
  return api;
}
