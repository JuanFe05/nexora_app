/** Table controls and heading; optional `icon` adds a decorative neutral tile without changing control labels. */
// Adaptado de TailAdmin Free (MIT), table-three/card-header.tsx.
import { useId, type ReactNode } from "react";
import { SearchIcon } from "@/icons/search";
import { ChevronDownIcon } from "@/icons";

export type DataTableHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Disable the search control for reports that only accept applied filters. Defaults to true. */
  showSearch?: boolean;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageSizeChange: (size: number) => void;
  headerAction?: ReactNode;
};

export function CardHeader({
  title,
  description,
  icon,
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  showSearch = true,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
  headerAction,
}: DataTableHeaderProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-4 px-5 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
      <div
        className={icon != null ? "flex min-w-0 items-start gap-3" : undefined}
      >
        {icon != null && (
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300 [&_svg]:size-5"
          >
            {icon}
          </span>
        )}
        <div className={icon != null ? "min-w-0 break-words" : undefined}>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-3 xl:w-auto">
        {showSearch && (
          <div className="relative min-w-40 flex-1 sm:w-64 sm:flex-initial">
            <label htmlFor={`${id}-search`} className="sr-only">
              Buscar en {title}
            </label>
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            />
            <input
              id={`${id}-search`}
              type="search"
              value={search}
              placeholder={searchPlaceholder}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-transparent pr-3 pl-10 text-sm text-gray-800 shadow-theme-xs outline-none placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90"
            />
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <label htmlFor={`${id}-size`}>
            Mostrar <span className="sr-only">registros por página</span>
          </label>
          <div className="relative">
            <select
              id={`${id}-size`}
              aria-label="Registros por página"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-10 min-w-20 appearance-none truncate rounded-lg border border-gray-300 bg-white bg-none ps-3 pe-10 text-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <ChevronDownIcon
              aria-hidden="true"
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
            />
          </div>
        </div>
        {headerAction}
      </div>
    </div>
  );
}
