import type { ReactNode } from "react";
import { cn } from "@/utils";

export type InlineAlertProps = {
  variant?: "error" | "success" | "info";
  children: ReactNode;
  className?: string;
};

const styles = {
  error: "border-red-500/30 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-400",
  success: "border-green-500/30 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-400",
  info: "border-brand-500/30 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/15 dark:text-brand-300",
} as const;

/** Aviso en línea con estilo de alertas de TailAdmin. Los errores se anuncian como `alert`; el resto como `status`. */
export function InlineAlert({ variant = "info", children, className }: InlineAlertProps) {
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", styles[variant], className)}>
      {children}
    </div>
  );
}
