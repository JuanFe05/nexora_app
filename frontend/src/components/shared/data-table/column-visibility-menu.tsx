import { useId } from "react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";

export type VisibilityColumn = { id: string; label: string };

/** Optional composition for DataTable.headerAction. Portal avoids clipping in short/empty tables. */
export function ColumnVisibilityMenu({
  columns,
  value,
  onChange,
}: {
  columns: readonly VisibilityColumn[];
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  return (
    <Popover.Root>
      <Popover.Trigger render={<Button type="button" variant="outline" />}>
        Columnas visibles ({value.length}/{columns.length})
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <Popover.Popup className="max-h-[min(20rem,var(--available-height))] w-72 max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg outline-none dark:border-gray-700 dark:bg-gray-900">
            <Popover.Title className="mb-2 text-sm font-medium text-gray-800 dark:text-white/90">
              Columnas visibles
            </Popover.Title>
            <fieldset>
              <legend className="sr-only">Seleccionar columnas</legend>
              {columns.map((column) => (
                <label
                  key={column.id}
                  htmlFor={`${id}-${column.id}`}
                  className="flex cursor-pointer items-start gap-2 rounded-lg p-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  <input
                    id={`${id}-${column.id}`}
                    type="checkbox"
                    checked={value.includes(column.id)}
                    disabled={value.length === 1 && value.includes(column.id)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...value, column.id]
                          : value.filter((item) => item !== column.id),
                      )
                    }
                    className="mt-0.5 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800"
                  />
                  {column.label}
                </label>
              ))}
            </fieldset>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
