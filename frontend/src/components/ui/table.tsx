// Adaptado de TailAdmin Free (MIT), src/components/ui/table.tsx.
import type { ComponentProps } from "react";
import { cn } from "@/utils";

function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("min-w-full", className)} {...props} />;
}
function TableHeader(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}
function TableBody(props: ComponentProps<"tbody">) {
  return <tbody {...props} />;
}
function TableRow(props: ComponentProps<"tr">) {
  return <tr {...props} />;
}
function TableCell({ isHeader = false, ...props }: ComponentProps<"td"> & { isHeader?: boolean }) {
  return isHeader ? <th scope="col" {...props} /> : <td {...props} />;
}
export { Table, TableHeader, TableBody, TableRow, TableCell };
