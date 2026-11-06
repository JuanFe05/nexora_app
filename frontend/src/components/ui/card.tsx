import { cn } from "@/utils";
import * as React from "react";

function Card({ className, size = "default", ...props }: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-5 rounded-xl border border-gray-200 bg-white p-5 data-[size=sm]:p-4 sm:p-6 dark:border-gray-800 dark:bg-white/3",
        className,
      )}
      {...props}
    />
  );
}

export { Card };
