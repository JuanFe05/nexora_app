import { cn } from "@/utils";

const firstLetter = (value?: string) => Array.from(value?.trim() ?? "")[0]?.toLocaleUpperCase("es") ?? "";

/** Iniciales del primer nombre y el primer apellido; sin ellos, la inicial del respaldo (p. ej. el usuario). */
export function userInitials(firstName?: string, lastName?: string, fallback?: string): string {
  return `${firstLetter(firstName)}${firstLetter(lastName)}` || firstLetter(fallback) || "?";
}

type Props = { firstName?: string; lastName?: string; fallback?: string; className?: string };

/** Avatar de iniciales con tokens del tema TailAdmin; el modo oscuro lo resuelve la variante `dark:`. */
export function UserAvatar({ firstName, lastName, fallback, className }: Props) {
  return (
    <span aria-hidden="true" data-slot="user-avatar"
      className={cn("flex shrink-0 items-center justify-center rounded-full border border-gray-200 bg-brand-50 font-semibold text-brand-700 dark:border-gray-800 dark:bg-brand-500/15 dark:text-brand-300", className)}>
      {userInitials(firstName, lastName, fallback)}
    </span>
  );
}
