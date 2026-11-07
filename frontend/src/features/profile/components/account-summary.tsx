import { Card } from "@/components/ui/card";
import { MailIcon, UserIcon, UsersIcon } from "@/icons";
import type { Profile } from "../types";
import { ProfileStatus } from "./profile-status";
export function AccountSummary({ profile }: { profile: Profile }) {
  return <section aria-labelledby="account-summary-title" className="min-w-0">
    <Card className="shadow-theme-xs">
      <h2 id="account-summary-title" className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90"><UsersIcon aria-hidden="true" className="size-6" />Resumen de cuenta</h2>
      <dl className="space-y-5 text-sm">
        <div><dt className="mb-1 flex items-center gap-2 text-gray-500 dark:text-gray-400"><UserIcon aria-hidden="true" className="size-4" />Usuario</dt><dd className="break-words text-gray-800 dark:text-white/90">{profile.nombre_usuario}</dd></div>
        <div><dt className="mb-2 text-gray-500 dark:text-gray-400">Estado</dt><dd><ProfileStatus estado={profile.estado} /></dd></div>
        <div><dt className="mb-1 text-gray-500 dark:text-gray-400">Roles ({profile.roles.length})</dt><dd className="break-words text-gray-800 dark:text-white/90">{profile.roles.length ? profile.roles.join(" · ") : "—"}</dd></div>
        <div><dt className="mb-1 flex items-center gap-2 text-gray-500 dark:text-gray-400"><MailIcon aria-hidden="true" className="size-4" />Correo electrónico</dt><dd className="break-all text-gray-800 dark:text-white/90">{profile.correo}</dd></div>
      </dl>
    </Card>
  </section>;
}
