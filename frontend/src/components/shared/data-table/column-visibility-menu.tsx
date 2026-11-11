import { useId } from "react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { ChevronDownIcon } from "@/icons";

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
      <Popover.Trigger
        render={<Button type="button" variant="outline" className="group/columns" />}
      >
        Columnas visibles ({value.length}/{columns.length})
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-gray-500 transition-transform duration-200 group-data-popup-open/columns:rotate-180 dark:text-gray-400"
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="isolate z-99999 outline-none"
        >
          <Popover.Popup className="custom-scrollbar max-h-[min(24rem,var(--available-height))] w-72 max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 dark:border-gray-800 dark:bg-[#1E2635]">
            <Popover.Title className="px-3 py-1.5 text-xs font-medium text-gray-400 dark:text-gray-400">
              Columnas visibles
            </Popover.Title>
            <fieldset className="flex flex-col gap-1">
              <legend className="sr-only">Seleccionar columnas</legend>
              {columns.map((column) => {
                const checked = value.includes(column.id);
                const inputId = `${id}-${column.id}`;
                return (
                  <Field
                    key={column.id}
                    orientation="horizontal"
                    className="items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-white/5"
                  >
                    <Checkbox
                      id={inputId}
                      checked={checked}
                      disabled={value.length === 1 && checked}
                      onCheckedChange={(next) =>
                        onChange(
                          next
                            ? [...value, column.id]
                            : value.filter((item) => item !== column.id),
                        )
                      }
                    />
                    <Label
                      htmlFor={inputId}
                      className="flex-1 cursor-pointer text-sm leading-snug font-medium text-gray-700 dark:text-gray-300"
                    >
                      {column.label}
                    </Label>
                  </Field>
                );
              })}
            </fieldset>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
