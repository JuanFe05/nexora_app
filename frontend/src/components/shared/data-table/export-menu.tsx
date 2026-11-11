import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Spinner } from "@/components/ui/spinner";
import { ChevronDownIcon } from "@/icons";
import {
  ExportError,
  exportRows,
  type ExportColumn,
  type ExportFormat,
  type ExportRow,
} from "@/lib/table-export";

const formats: { format: ExportFormat; label: string }[] = [
  { format: "csv", label: "CSV" },
  { format: "xlsx", label: "Excel (.xlsx)" },
  { format: "both", label: "CSV y Excel" },
];

/** Optional composition for DataTable.headerAction: exports every row of the query, not just the visible page. */
export function ExportMenu({
  columns,
  visibleIds,
  loadRows,
  fileName,
  disabled = false,
}: {
  columns: readonly ExportColumn[];
  visibleIds: readonly string[];
  loadRows: (signal: AbortSignal) => Promise<readonly ExportRow[]>;
  fileName: string;
  disabled?: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const visible = columns.filter((column) => visibleIds.includes(column.id));

  useEffect(() => () => controller.current?.abort(), []);

  async function run(scope: readonly ExportColumn[], format: ExportFormat) {
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    setExporting(true);
    try {
      const rows = await loadRows(abort.signal);
      if (abort.signal.aborted) return;
      await exportRows({ columns: scope, rows, format, fileName });
    } catch (failure) {
      if (abort.signal.aborted) return;
      setError(
        failure instanceof ExportError
          ? failure.message
          : "No se pudo exportar la información. Intenta de nuevo.",
      );
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setExporting(false);
      }
    }
  }

  function submenu(title: string, scope: readonly ExportColumn[]) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger showIcon>{title}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {formats.map(({ format, label }) => (
            <DropdownMenuItem key={format} onClick={() => void run(scope, format)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="group/export"
              disabled={disabled || exporting}
              aria-busy={exporting}
            />
          }
        >
          {exporting ? "Exportando…" : "Exportar"}
          {exporting ? (
            <Spinner aria-hidden="true" role="presentation" />
          ) : (
            <ChevronDownIcon
              aria-hidden="true"
              className="size-4 text-gray-500 transition-transform duration-200 group-data-popup-open/export:rotate-180 dark:text-gray-400"
            />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Exportar</DropdownMenuLabel>
            {submenu(`Columnas visibles (${visible.length})`, visible)}
            {submenu(`Todas las columnas (${columns.length})`, columns)}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && (
        <p role="alert" className="w-full text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
