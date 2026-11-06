import { Menu } from "@base-ui/react/menu";
import { cn } from "@/utils";

type ContentProps = Omit<Menu.Popup.Props, "className"> & { className?: string };
type ItemProps = Omit<Menu.Item.Props, "className"> & { className?: string };
type LinkItemProps = Omit<Menu.LinkItem.Props, "className"> & { className?: string };

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;
const itemClassName = "flex w-full cursor-pointer items-center rounded-lg px-3 py-2.5 text-sm text-gray-700 outline-none data-highlighted:bg-gray-100 data-highlighted:text-gray-900 dark:text-gray-300 dark:data-highlighted:bg-gray-800 dark:data-highlighted:text-white";

function DropdownMenuContent({ className, ...props }: ContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align="end" sideOffset={8} collisionPadding={12} className="z-999">
        <Menu.Popup className={cn("max-h-[var(--available-height)] w-72 max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-lg outline-none dark:border-gray-800 dark:bg-gray-900", className)} {...props} />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: ItemProps) {
  return <Menu.Item className={cn(itemClassName, className)} {...props} />;
}

function DropdownMenuLinkItem({ className, ...props }: LinkItemProps) {
  return <Menu.LinkItem closeOnClick className={cn(itemClassName, className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem };
