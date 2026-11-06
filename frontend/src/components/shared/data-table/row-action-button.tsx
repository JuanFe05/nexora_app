import type { ComponentProps } from "react";
import { cn } from "@/utils";
import { PencilIcon } from "@/icons/pencil";
import { TrashBinIcon } from "@/icons/trash-bin";

export type RowActionButtonProps = Omit<ComponentProps<"button">, "aria-label"> & {
  "aria-label": string;
  variant?: "default" | "danger";
};

export function RowActionButton({ variant = "default", children, className, ...props }: RowActionButtonProps) {
  const Icon = variant === "danger" ? TrashBinIcon : PencilIcon;
  return (
    <button type="button" className={cn(
      "inline-flex size-9 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-50",
      variant === "danger" ? "text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white/90",
      className,
    )} {...props}>
      {children ?? <Icon aria-hidden="true" className="size-5" />}
    </button>
  );
}
