import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import * as React from "react";
import { cn } from "@/utils";

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetContent({ className, children, side = "right", ...props }: SheetPrimitive.Popup.Props & { side?: "right" | "left" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 isolate z-100 bg-black/50 duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0 supports-backdrop-filter:backdrop-blur-xs dark:bg-black/70"
      />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-101 flex flex-col gap-4 border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-theme-lg duration-200 outline-none data-closed:animate-out data-open:animate-in dark:border-gray-800 dark:bg-[#1E2635] dark:text-gray-300",
          "data-[side=left]:inset-y-0 data-[side=left]:inset-s-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-e data-[side=left]:data-closed:slide-out-to-start data-[side=left]:data-open:slide-in-from-start data-[side=left]:sm:max-w-sm",
          "data-[side=right]:inset-y-0 data-[side=right]:inset-e-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-s data-[side=right]:data-closed:slide-out-to-end data-[side=right]:data-open:slide-in-from-end data-[side=right]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        {children}
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("flex flex-col gap-2", className)} {...props} />;
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-lg font-semibold text-gray-800 dark:text-white/90", className)} {...props} />;
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-gray-500 dark:text-gray-400", className)} {...props} />;
}

export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription };
