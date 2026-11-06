import { Link } from "react-router";
import { ChevronDownIcon, GearIcon, LogOutIcon, UserIcon } from "@/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "../use-auth";

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Menú de usuario: ${user.nombre_usuario}`} className="group flex min-h-11 min-w-0 items-center gap-2 rounded-[10px] px-2 text-sm text-gray-700 outline-none hover:bg-gray-100 focus-visible:ring-3 focus-visible:ring-brand-400 dark:text-gray-300 dark:hover:bg-gray-800">
        <UserIcon aria-hidden="true" className="size-6 shrink-0 sm:hidden" />
        <span className="hidden max-w-40 truncate sm:block">{user.nombre_usuario}</span>
        <ChevronDownIcon aria-hidden="true" data-menu-chevron className="size-5 shrink-0 transition-transform group-data-popup-open:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="mb-2 border-b border-gray-200 px-3 py-3 dark:border-gray-800">
          <p className="wrap-anywhere text-sm font-medium text-gray-800 dark:text-white/90">{user.nombre_usuario}</p>
          <p className="mt-1 wrap-anywhere text-sm text-gray-500 dark:text-gray-400">{user.correo}</p>
        </div>
        <DropdownMenuLinkItem className="gap-3" render={<Link to="/configuracion/perfil" />}><GearIcon aria-hidden="true" className="size-6 shrink-0 text-gray-500 dark:text-gray-400" />Configuración de la cuenta</DropdownMenuLinkItem>
        <DropdownMenuItem className="gap-3 text-red-600 hover:bg-red-50 data-highlighted:bg-red-50 data-highlighted:text-red-600 dark:text-red-400 dark:hover:bg-red-500/10 dark:data-highlighted:bg-red-500/10 dark:data-highlighted:text-red-400" onClick={() => { void logout(); }}><LogOutIcon aria-hidden="true" className="size-6 shrink-0 text-red-600 dark:text-red-400" />Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
