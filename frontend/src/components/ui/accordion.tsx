import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon } from "@/icons";
import { cn } from "@/utils";

type StyledProps<Props> = Omit<Props, "className"> & { className?: string };

function Accordion({ className, ...props }: StyledProps<AccordionPrimitive.Root.Props<string>>) {
  return <AccordionPrimitive.Root data-slot="accordion" className={cn("space-y-3", className)} {...props} />;
}
function AccordionItem({ className, ...props }: StyledProps<AccordionPrimitive.Item.Props>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn("min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3", className)} {...props} />;
}
function AccordionHeader({ className, ...props }: StyledProps<AccordionPrimitive.Header.Props>) {
  return <AccordionPrimitive.Header data-slot="accordion-header" className={cn("min-w-0", className)} {...props} />;
}
function AccordionTrigger({ className, children, ...props }: StyledProps<AccordionPrimitive.Trigger.Props>) {
  return <AccordionPrimitive.Trigger data-slot="accordion-trigger" className={cn("group flex w-full min-w-0 items-center gap-3 rounded-lg p-4 text-left text-sm font-medium text-gray-800 outline-none transition-colors hover:bg-gray-50 focus-visible:ring-3 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/90 dark:hover:bg-gray-800", className)} {...props}>
    {children}
    <ChevronDownIcon aria-hidden="true" className="ml-auto size-5 shrink-0 text-gray-500 transition-transform group-data-panel-open:rotate-180 dark:text-gray-400" />
  </AccordionPrimitive.Trigger>;
}
function AccordionPanel({ className, ...props }: StyledProps<AccordionPrimitive.Panel.Props>) {
  return <AccordionPrimitive.Panel data-slot="accordion-panel" className={cn("border-t border-gray-100 p-4 dark:border-gray-800", className)} {...props} />;
}

export { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel };
