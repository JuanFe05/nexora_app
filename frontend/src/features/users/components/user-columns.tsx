import type { DataTableColumn } from "@/components/shared/data-table";
import type { User } from "../types";

export const userColumns: DataTableColumn<User>[] = [
  { id: "usuario", header: "Usuario", cell: user => <div><p className="font-medium text-gray-800 dark:text-white/90">{user.nombre_usuario}</p><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{[user.primer_nombre, user.segundo_nombre, user.primer_apellido, user.segundo_apellido].filter(Boolean).join(" ")}</p></div> },
  { id: "correo", header: "Correo", cell: user => user.correo },
  { id: "roles", header: "Roles", cell: user => <div className="flex flex-wrap gap-1.5">{user.roles.length ? user.roles.map(code => <span key={code} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{code}</span>) : <span className="text-gray-500 dark:text-gray-400">Sin roles</span>}</div> },
  { id: "estado", header: "Estado", cell: user => <span className={user.estado === "activo" ? "rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400" : "rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400"}>{user.estado === "activo" ? "Activo" : "Inactivo"}</span> },
];
