// Adaptado de TailAdmin Free (MIT), src/components/ui/pagination.tsx.
// Botones nativos: la paginación cambia estado, no navega a una URL.
import type { ComponentProps } from "react";
import { Button } from "./button";
import { cn } from "@/utils";
import { ChevronLeftIcon } from "@/icons/chevron-left";

function Pagination({ className, ...props }: ComponentProps<"nav">) {
  return <nav aria-label="Paginación" className={cn("flex justify-center", className)} {...props} />;
}
function PaginationContent({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex flex-wrap items-center gap-1.5", className)} {...props} />;
}
function PaginationItem(props: ComponentProps<"li">) {
  return <li {...props} />;
}
function PaginationLink({ isActive, ...props }: ComponentProps<typeof Button> & { isActive?: boolean }) {
  return <Button type="button" size="icon" variant={isActive ? "default" : "outline"} aria-current={isActive ? "page" : undefined} {...props} />;
}
function PaginationPrevious(props: ComponentProps<typeof PaginationLink>) {
  return <PaginationLink aria-label="Página anterior" {...props}><ChevronLeftIcon aria-hidden="true" /></PaginationLink>;
}
function PaginationNext(props: ComponentProps<typeof PaginationLink>) {
  return <PaginationLink aria-label="Página siguiente" {...props}><ChevronLeftIcon aria-hidden="true" className="rotate-180" /></PaginationLink>;
}
function PaginationEllipsis() {
  return <span aria-hidden="true" className="flex size-8 items-center justify-center text-gray-500 dark:text-gray-400">…</span>;
}
export { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis };
