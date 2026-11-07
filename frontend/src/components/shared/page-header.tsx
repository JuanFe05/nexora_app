/**
 * Shared responsive page heading with a decorative brand tile.
 * Pass an icon element or component, a title, and an optional description.
 * @example <PageHeader icon={UsersIcon} title="Usuarios" description="Administra los usuarios." />
 */
import type { ComponentType, ReactNode } from "react";

export type PageHeaderProps = {
  icon: ReactNode | ComponentType<{ className?: string }>;
  title: string;
  description?: string;
};

export function PageHeader({ icon, title, description }: PageHeaderProps) {
  const Icon = typeof icon === "function" ? icon : null;
  return (
    <header className="flex items-start gap-4">
      <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400 [&_svg]:size-6">
        {Icon ? <Icon /> : icon as ReactNode}
      </span>
      <div className="min-w-0 break-words">
        <h1 className="text-title-lg font-semibold text-gray-800 dark:text-white/90">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
    </header>
  );
}
