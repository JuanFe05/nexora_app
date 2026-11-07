/**
 * Compact neutral table-cell count with a decorative icon element or component.
 * Supply the complete accessible label (including count) and an optional tooltip.
 * @example <CountIndicator icon={KeyIcon} count={12} label="12 permisos" />
 */
import type { ComponentType, ReactNode } from "react";

export type CountIndicatorProps = {
  icon: ReactNode | ComponentType<{ className?: string }>;
  count: number;
  label: string;
  title?: string;
};

export function CountIndicator({ icon, count, label, title }: CountIndicatorProps) {
  const Icon = typeof icon === "function" ? icon : null;
  return (
    <span aria-label={label} title={title} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 tabular-nums dark:bg-white/5 dark:text-gray-300">
      <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
        {Icon ? <Icon /> : icon as ReactNode}
      </span>
      <span>{count}</span>
    </span>
  );
}
