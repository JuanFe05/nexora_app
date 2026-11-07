import { StatusBadge } from "@/components/shared/status-badge";

export function ProfileStatus({ estado }: { estado: string }) {
  return <StatusBadge estado={estado} />;
}
