import { Badge } from "@/components/ui/badge";
export function ProfileStatus({ estado }: { estado: string }) {
  const value = estado.toLowerCase();
  return <Badge variant={value === "activo" ? "success" : value === "inactivo" ? "error" : "neutral"}>{value === "activo" ? "Activo" : value === "inactivo" ? "Inactivo" : estado}</Badge>;
}
