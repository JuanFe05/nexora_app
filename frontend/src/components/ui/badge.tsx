/** Text-only semantic pill; `brand` uses TailAdmin tokens with the default compact cell padding. */
import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        brand: "bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400",
        success: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400",
        error: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400",
        warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
        info: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
        neutral: "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-400",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({ className, variant = "neutral", ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge };
