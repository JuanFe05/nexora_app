import { Label } from "@/components/ui/label";
import { cn } from "@/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { createContext, useContext, useId, useMemo } from "react";

interface FieldContextValue { id: string }
const FieldContext = createContext<FieldContextValue | undefined>(undefined);

function useField() {
  return useContext(FieldContext);
}

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-red-500 dark:data-[invalid=true]:text-red-400",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: { orientation: "vertical" },
  },
);

interface FieldProps extends React.ComponentProps<"div">, VariantProps<typeof fieldVariants> {
  controlId?: string;
}

function Field({ className, orientation = "vertical", controlId, id: divId, children, ...props }: FieldProps) {
  const generatedId = useId();
  const id = controlId ?? generatedId;
  const contextValue = useMemo(() => ({ id }), [id]);
  return (
    <FieldContext.Provider value={contextValue}>
      <div role="group" id={divId} data-slot="field" data-orientation={orientation}
        className={cn(fieldVariants({ orientation }), className)} {...props}>
        {children}
      </div>
    </FieldContext.Provider>
  );
}

function FieldLabel({ className, htmlFor, ...props }: React.ComponentProps<typeof Label>) {
  const field = useField();
  const resolvedHtmlFor = htmlFor ?? field?.id;
  return (
    <Label
      data-slot="field-label"
      htmlFor={resolvedHtmlFor}
      className={cn(
        "group/field-label peer/field-label flex w-fit gap-2 text-sm leading-snug font-medium text-gray-700 select-none group-data-[disabled=true]/field:opacity-50 dark:text-gray-300",
        "has-data-checked:border-brand-500/30 has-data-checked:bg-brand-500/5 dark:has-data-checked:border-brand-500/20 dark:has-data-checked:bg-brand-500/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-[10px] has-[>[data-slot=field]]:border has-[>[data-slot=field]]:border-gray-200 dark:has-[>[data-slot=field]]:border-gray-800",
        "has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-gray-50/60 dark:has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-white/2",
        "has-[>[data-slot=field]]:has-focus-visible:border-brand-300 has-[>[data-slot=field]]:has-focus-visible:ring-3 has-[>[data-slot=field]]:has-focus-visible:ring-brand-500/20 dark:has-[>[data-slot=field]]:has-focus-visible:border-brand-500/40",
        "*:data-[slot=field]:p-2.5", className,
      )}
      {...props}
    />
  );
}

export { Field, FieldLabel, useField };
