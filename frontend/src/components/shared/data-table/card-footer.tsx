// Adaptado de TailAdmin Free (MIT), table-three/card-footer.tsx.
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

function pageNumbers(current: number, total: number): (number | "start" | "end")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "end", total];
  if (current >= total - 3) return [1, "start", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "start", current - 1, current, current + 1, "end", total];
}

export function CardFooter({ total, page, pageSize, onPageChange, loading }: { total: number; page: number; pageSize: number; onPageChange: (page: number) => void; loading: boolean }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-4 border-t border-gray-100 px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between dark:border-gray-800">
      <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-gray-500 dark:text-gray-400">Mostrando {first} a {last} de {total} registros</p>
      <Pagination>
        <PaginationContent>
          <PaginationItem><PaginationPrevious disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)} /></PaginationItem>
          {pageNumbers(page, totalPages).map(item => <PaginationItem key={item}>
            {typeof item === "number" ? <PaginationLink aria-label={`Página ${item}`} isActive={item === page} disabled={loading} onClick={() => onPageChange(item)}>{item}</PaginationLink> : <PaginationEllipsis />}
          </PaginationItem>)}
          <PaginationItem><PaginationNext disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)} /></PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
