import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MultiSelectValue = string | number;
export type MultiSelectOption = { value: MultiSelectValue; label: string };
export type MultiSelectProps = {
  id: string;
  label: string;
  options: readonly MultiSelectOption[];
  value: MultiSelectValue[];
  onChange: (value: MultiSelectValue[]) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

/** Controlled selection: selecting all always uses the entire catalog, not just search matches. */
export function MultiSelect({
  id,
  label,
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  error,
  onRetry,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const initialOption = useRef<number | null>(null);
  const unavailable = disabled || loading || Boolean(error);
  const expanded = open && !unavailable;
  const filtered = options.filter((option) =>
    option.label
      .toLocaleLowerCase("es")
      .includes(search.toLocaleLowerCase("es")),
  );
  const selected = options.filter((option) => value.includes(option.value));
  const allSelected =
    options.length > 0 &&
    options.every((option) => value.includes(option.value));

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function toggle(option: MultiSelectOption) {
    onChange(
      value.includes(option.value)
        ? value.filter((item) => item !== option.value)
        : [...value, option.value],
    );
  }
  function move(direction: number) {
    const buttons = Array.from(
      list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ??
        [],
    );
    if (!buttons.length) return;
    const index = buttons.findIndex(
      (button) => button === document.activeElement,
    );
    buttons[
      index < 0
        ? direction > 0
          ? 0
          : buttons.length - 1
        : (index + direction + buttons.length) % buttons.length
    ]?.focus();
  }
  useEffect(() => {
    if (!expanded) return;
    const buttons =
      list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const index = initialOption.current;
    if (index !== null && buttons?.length)
      buttons[index < 0 ? buttons.length - 1 : index]?.focus();
    else searchInput.current?.focus();
    initialOption.current = null;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded]);

  return (
    <div
      ref={root}
      className="relative min-w-0 space-y-2"
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && expanded) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (
          expanded &&
          (event.key === "ArrowDown" || event.key === "ArrowUp")
        ) {
          event.preventDefault();
          move(event.key === "ArrowDown" ? 1 : -1);
        }
      }}
    >
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-label={`${label}: ${value.length} seleccionadas`}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-options` : undefined}
        disabled={unavailable}
        onClick={() => {
          setSearch("");
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (
            !expanded &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();
            event.stopPropagation();
            initialOption.current = event.key === "ArrowDown" ? 0 : -1;
            setSearch("");
            setOpen(true);
          }
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-gray-300 bg-white px-4 py-2.5 text-left text-sm text-gray-800 shadow-theme-xs outline-none focus-visible:border-brand-300 focus-visible:ring-3 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
      >
        <span>{value.length} seleccionadas</span>
        <span aria-hidden="true">▾</span>
      </button>
      {selected.length > 0 && (
        <div
          className="flex max-h-28 flex-wrap gap-1 overflow-y-auto"
          aria-label={`Selección de ${label}`}
        >
          {selected.map((option) => (
            <span
              key={`${typeof option.value}-${option.value}`}
              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
            >
              <span className="truncate" title={option.label}>
                {option.label}
              </span>
              <button
                type="button"
                aria-label={`Quitar ${option.label}`}
                disabled={unavailable}
                onClick={() => toggle(option)}
                className="shrink-0 rounded px-1 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {loading && (
        <p role="status" className="text-sm text-gray-500 dark:text-gray-400">
          Cargando opciones…
        </p>
      )}
      {error && (
        <div role="alert" className="text-sm text-red-500 dark:text-red-400">
          {error}
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              disabled={disabled || loading}
              aria-label={`Reintentar ${label}`}
              onClick={onRetry}
            >
              Reintentar
            </Button>
          )}
        </div>
      )}
      {expanded && (
        <div className="absolute top-full left-0 z-30 mt-1 w-full min-w-0 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
          <Input
            ref={searchInput}
            type="search"
            aria-label={`Buscar en ${label}`}
            placeholder="Buscar opciones…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            className="my-2 w-full"
            disabled={!options.length}
            onClick={() =>
              onChange(allSelected ? [] : options.map((option) => option.value))
            }
          >
            {allSelected ? "Quitar todas" : "Seleccionar todas"}
          </Button>
          <div
            ref={list}
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            aria-multiselectable="true"
            className="max-h-60 overflow-y-auto"
          >
            {filtered.map((option) => (
              <button
                key={`${typeof option.value}-${option.value}`}
                type="button"
                role="option"
                aria-selected={value.includes(option.value)}
                onClick={() => toggle(option)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 outline-none hover:bg-gray-100 focus:bg-gray-100 aria-selected:bg-brand-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:focus:bg-gray-800 dark:aria-selected:bg-brand-500/15"
              >
                <span aria-hidden="true">
                  {value.includes(option.value) ? "☑" : "☐"}
                </span>
                <span className="min-w-0 break-words">{option.label}</span>
              </button>
            ))}
          </div>
          {!filtered.length && (
            <p className="py-3 text-sm text-gray-500 dark:text-gray-400">
              {options.length
                ? "No se encontraron opciones."
                : "No hay opciones disponibles."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
