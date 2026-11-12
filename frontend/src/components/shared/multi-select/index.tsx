import type { ReactNode } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  selectTriggerChevronClassName,
  selectTriggerClassName,
} from "@/components/ui/select";
import { ChevronDownIcon, RefreshCwIcon, XIcon } from "@/icons";
import { cn } from "@/utils";

export type MultiSelectValue = string | number;
export type MultiSelectOption = { value: MultiSelectValue; label: string };
export type MultiSelectProps = {
  id: string;
  label: string;
  options: readonly MultiSelectOption[];
  value: MultiSelectValue[];
  onChange: (value: MultiSelectValue[]) => void;
  placeholder?: string;
  /** Adds a text search inside the popup (TailAdmin combobox) for long catalogs. */
  searchable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

const triggerClassName = "cursor-pointer py-1 ps-3 pe-3.5";
const popupClassName = "custom-scrollbar max-w-[min(90vw,28rem)]";

/**
 * TailAdmin "Multiple Select Options". The trigger keeps its fixed height: it shows the first
 * selected option as a chip plus a "+N" counter, so selecting never resizes the surrounding card.
 * Selecting all always uses the entire catalog, not just the search matches.
 */
export function MultiSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = "Seleccionar opciones",
  searchable = false,
  disabled = false,
  loading = false,
  error,
  onRetry,
}: MultiSelectProps) {
  const unavailable = disabled || loading || Boolean(error);
  const allSelected =
    options.length > 0 &&
    options.every((option) => value.includes(option.value));
  const labels = new Map(options.map((option) => [option.value, option.label]));
  const nameOf = (item: MultiSelectValue) => labels.get(item) ?? String(item);
  const ariaLabel = `${label}: ${value.length} seleccionadas`;

  function summary(values: MultiSelectValue[]): ReactNode {
    if (!values.length)
      return (
        <span className="truncate pl-1 text-gray-400 dark:text-gray-500">
          {loading ? "Cargando opciones…" : placeholder}
        </span>
      );
    const [first, ...rest] = values;
    return (
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-gray-200 bg-gray-100 py-1 ps-2.5 pe-1.5 text-sm font-normal text-gray-800 dark:border-gray-800 dark:bg-white/5 dark:text-white/90">
          <span className="truncate" title={nameOf(first)}>
            {nameOf(first)}
          </span>
          <button
            type="button"
            aria-label={`Quitar ${nameOf(first)}`}
            disabled={unavailable}
            onClick={(event) => {
              event.stopPropagation();
              onChange(value.filter((item) => item !== first));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ")
                event.stopPropagation();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            className="inline-flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <XIcon className="size-3" />
          </button>
        </span>
        {rest.length > 0 && (
          <span
            title={rest.map(nameOf).join(", ")}
            className="shrink-0 rounded-full border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-white/5 dark:text-gray-300"
          >
            +{rest.length}
          </span>
        )}
      </div>
    );
  }

  const selectAll = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      disabled={!options.length}
      onClick={() =>
        onChange(allSelected ? [] : options.map((option) => option.value))
      }
    >
      {allSelected ? "Quitar todas" : "Seleccionar todas"}
    </Button>
  );

  return (
    <Field controlId={id} className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      {searchable ? (
        <Combobox
          multiple
          items={options}
          value={options.filter((option) => value.includes(option.value))}
          onValueChange={(next) =>
            onChange(next.map((option: MultiSelectOption) => option.value))
          }
          isItemEqualToValue={(a, b) => a.value === b.value}
          itemToStringLabel={(option) => option.label}
          disabled={unavailable}
        >
          <ComboboxPrimitive.Trigger
            id={id}
            render={<div />}
            nativeButton={false}
            data-slot="select-trigger"
            data-size="default"
            aria-label={ariaLabel}
            className={cn(selectTriggerClassName, triggerClassName)}
          >
            <span className="flex min-w-0 flex-1 items-center truncate text-start">
              {summary(value)}
            </span>
            <ChevronDownIcon className={selectTriggerChevronClassName} />
          </ComboboxPrimitive.Trigger>
          <ComboboxContent className={popupClassName}>
            <ComboboxInput
              showTrigger={false}
              placeholder="Buscar…"
              aria-label={`Buscar en ${label}`}
            />
            {selectAll}
            <ComboboxEmpty>No se encontraron opciones.</ComboboxEmpty>
            <ComboboxList>
              {(option: MultiSelectOption) => (
                <ComboboxItem
                  key={`${typeof option.value}-${option.value}`}
                  value={option}
                >
                  {option.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <Select
          multiple
          value={value}
          onValueChange={(next) => onChange(next)}
          disabled={unavailable}
        >
          <SelectTrigger
            id={id}
            render={<div />}
            nativeButton={false}
            aria-label={ariaLabel}
            className={triggerClassName}
          >
            <SelectValue>{(values: MultiSelectValue[]) => summary(values ?? [])}</SelectValue>
          </SelectTrigger>
          <SelectContent className={popupClassName}>
            {selectAll}
            {options.map((option) => (
              <SelectItem
                key={`${typeof option.value}-${option.value}`}
                value={option.value}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {error && (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm text-red-500 dark:text-red-400">
          <span>{error}</span>
          {onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="shrink-0 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              disabled={disabled || loading}
              aria-label={`Reintentar ${label}`}
              title={`Reintentar ${label}`}
              onClick={onRetry}
            >
              <RefreshCwIcon aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}
