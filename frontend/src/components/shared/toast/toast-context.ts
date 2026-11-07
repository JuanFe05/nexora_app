import { createContext } from "react";
import type { AlertVariant } from "../alert-styles";

export type ToastOptions = {
  /** Título opcional sobre el mensaje. */
  title?: string;
  /** Milisegundos hasta que el aviso se cierra solo; 0 lo mantiene hasta cerrarlo a mano. */
  duration?: number;
};
export type ToastInput = ToastOptions & { variant: AlertVariant; message: string };
export type ToastItem = ToastInput & { id: number };
export type ToastApi = {
  notify: (toast: ToastInput) => number;
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
};

export const DEFAULT_TOAST_DURATION = 5000;
export const ToastContext = createContext<ToastApi | null>(null);
