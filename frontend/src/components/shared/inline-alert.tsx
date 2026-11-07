import type { ReactNode } from "react";
import { cn } from "@/utils";
import { alertStyles, type AlertVariant } from "./alert-styles";

export type InlineAlertProps = {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
};

/** Aviso en línea con estilo de alertas de TailAdmin. Errores y advertencias se anuncian como `alert`; el resto como `status`. */
export function InlineAlert({ variant = "info", children, className }: InlineAlertProps) {
  return (
    <div role={variant === "error" || variant === "warning" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", alertStyles[variant], className)}>
      {children}
    </div>
  );
}
