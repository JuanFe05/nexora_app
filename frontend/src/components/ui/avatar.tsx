// Adaptado de TailAdmin (MIT): solo las primitivas utilizadas por el shell.
import { cn } from "@/utils";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

type AvatarProps = Omit<AvatarPrimitive.Root.Props, "className"> & { className?: string };
type AvatarFallbackProps = Omit<AvatarPrimitive.Fallback.Props, "className"> & { className?: string };

function Avatar({ className, ...props }: AvatarProps) {
  return <AvatarPrimitive.Root data-slot="avatar" className={cn("relative flex size-10 shrink-0 rounded-full select-none", className)} {...props} />;
}

function AvatarFallback({ className, ...props }: AvatarFallbackProps) {
  return <AvatarPrimitive.Fallback data-slot="avatar-fallback" className={cn("flex size-full items-center justify-center rounded-full bg-gray-100 text-sm text-gray-700 dark:bg-white/5 dark:text-gray-400", className)} {...props} />;
}

export { Avatar, AvatarFallback };
