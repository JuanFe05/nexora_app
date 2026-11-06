import { Link } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "../use-auth";

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = user.nombre_completo.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase("es");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Menú de usuario: ${user.nombre_completo}`} className="flex min-w-0 items-center gap-2 rounded-full p-1 text-sm text-gray-700 outline-none hover:bg-gray-100 focus-visible:ring-3 focus-visible:ring-brand-400 dark:text-gray-300 dark:hover:bg-gray-800">
        <Avatar aria-hidden="true"><AvatarFallback className="bg-brand-50 font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{initials}</AvatarFallback></Avatar>
        <span className="hidden max-w-40 truncate pe-2 sm:block">{user.nombre_completo}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="mb-2 border-b border-gray-200 px-3 py-3 dark:border-gray-800">
          <p className="wrap-anywhere text-sm font-medium text-gray-800 dark:text-white/90">{user.nombre_completo}</p>
          <p className="mt-1 wrap-anywhere text-sm text-gray-500 dark:text-gray-400">{user.correo}</p>
        </div>
        <DropdownMenuLinkItem render={<Link to="/cuenta" />}>Configuración de la cuenta</DropdownMenuLinkItem>
        <DropdownMenuItem onClick={() => { void logout(); }}>Cerrar sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
