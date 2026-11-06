// Adaptado de TailAdmin Free (MIT), table-three/empty-state.tsx.
import { TableCell, TableRow } from "@/components/ui/table";
import { BoxIcon } from "@/icons/box";

export type EmptyStateText = { title: string; description?: string };
export function EmptyState({ colSpan, title, description }: EmptyStateText & { colSpan: number }) {
  return <TableRow><TableCell colSpan={colSpan} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
    <div className="flex flex-col items-center justify-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800"><BoxIcon aria-hidden="true" className="size-6 text-gray-800 dark:text-white/90" /></div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
  </TableCell></TableRow>;
}
