import type { ReactNode } from "react";
import { cn } from "@/utils";

export type AlertVariant = "error" | "success" | "warning" | "info";

export type InlineAlertProps = {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
};

/** Colores de alerta de TailAdmin; los reutilizan el aviso en línea y los toasts. */
export const alertStyles = {
  error: "border-red-500/30 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
  success: "border-green-500/30 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  warning: "border-orange-500/30 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-400",
  info: "border-brand-500/30 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300",
} as const;

/** Aviso en línea con estilo de alertas de TailAdmin. Errores y advertencias se anuncian como `alert`; el resto como `status`. */
export function InlineAlert({ variant = "info", children, className }: InlineAlertProps) {
  return (
    <div role={variant === "error" || variant === "warning" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", alertStyles[variant], className)}>
      {children}
    </div>
  );
}
