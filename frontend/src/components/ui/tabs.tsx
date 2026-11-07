import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { cn } from "@/utils";

const Tabs = BaseTabs.Root;
function TabsList({ className, ...props }: BaseTabs.List.Props) {
  return <BaseTabs.List activateOnFocus data-slot="tabs-list" className={cn("flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800", className)} {...props} />;
}
function TabsTrigger({ className, ...props }: BaseTabs.Tab.Props) {
  return <BaseTabs.Tab data-slot="tabs-trigger" className={cn("inline-flex shrink-0 items-center justify-center gap-2 border-b-2 border-transparent px-4 py-3 text-sm font-medium whitespace-nowrap text-gray-500 outline-none hover:text-gray-800 focus-visible:ring-3 focus-visible:ring-brand-500/30 focus-visible:ring-inset data-[active]:border-brand-500 data-[active]:text-brand-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-white/90 dark:data-[active]:text-brand-400", className)} {...props} />;
}
function TabsPanel({ className, ...props }: BaseTabs.Panel.Props) {
  return <BaseTabs.Panel data-slot="tabs-panel" className={cn("min-w-0 pt-6 outline-none focus-visible:ring-3 focus-visible:ring-brand-500/30 data-[hidden]:hidden", className)} {...props} />;
}
export { Tabs, TabsList, TabsTrigger, TabsPanel };
