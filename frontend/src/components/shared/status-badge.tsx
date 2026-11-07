/**
 * Shared backend estado indicator for admin tables and profile.
 * Activo/Inactivo are case-insensitive; unknown values retain their raw text.
 * @example <StatusBadge estado="ACTIVO" />
 */
import { Badge } from "@/components/ui/badge";

export type StatusBadgeProps = { estado: string };

export function StatusBadge({ estado }: StatusBadgeProps) {
  const value = estado.toLowerCase();
  const variant = value === "activo" ? "success" : value === "inactivo" ? "error" : "neutral";
  const label = value === "activo" ? "Activo" : value === "inactivo" ? "Inactivo" : estado;
  return <Badge variant={variant}>{label}</Badge>;
}
