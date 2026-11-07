import type { DataTableColumn } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import type { User } from "../types";

export const userColumns: DataTableColumn<User>[] = [
  { id: "usuario", header: "Usuario", cell: user => <span className="font-medium text-gray-800 dark:text-white/90">{user.nombre_usuario}</span> },
  { id: "nombre_completo", header: "Nombre completo", cell: user => [user.primer_nombre, user.segundo_nombre, user.primer_apellido, user.segundo_apellido].filter(Boolean).join(" ") || "—" },
  { id: "correo", header: "Correo electrónico", cell: user => user.correo },
  { id: "roles", header: "Roles", cell: user => <div className="flex flex-wrap gap-1.5">{user.roles.length ? user.roles.map(code => <Badge key={code} variant="brand">{code}</Badge>) : <span className="text-gray-500 dark:text-gray-400">Sin roles</span>}</div> },
  { id: "estado", header: "Estado", cell: user => <StatusBadge estado={user.estado} /> },
];
