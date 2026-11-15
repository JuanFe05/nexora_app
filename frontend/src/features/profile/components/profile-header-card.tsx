import { UserIcon } from "@/icons";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { Profile } from "../types";

function fullName(profile: Profile) {
  return [profile.primer_nombre, profile.segundo_nombre, profile.primer_apellido, profile.segundo_apellido].filter(Boolean).join(" ");
}

/** Tarjeta de cabecera (equivalente a UserMetaCard de TailAdmin) con datos ya existentes del modelo; no agrega campos. */
export function ProfileHeaderCard({ profile }: { profile: Profile }) {
  return (
    <Card aria-labelledby="profile-name" className="min-w-0 shadow-theme-sm">
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-start">
        <UserAvatar firstName={profile.primer_nombre} lastName={profile.primer_apellido} className="size-24 text-2xl shadow-theme-xs" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id="profile-name" className="text-2xl font-semibold break-words text-gray-800 dark:text-white/90">{fullName(profile)}</h2>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm break-all text-gray-500 sm:justify-start dark:text-gray-400"><UserIcon aria-hidden="true" className="size-4 shrink-0" />@{profile.nombre_usuario}</p>
          </div>
          <ul aria-label="Roles asignados" className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {profile.roles.map((role) => <li key={role} className="text-xs break-all text-gray-500 dark:text-gray-400">{role}</li>)}
          </ul>
          {!profile.roles.length && <p className="text-sm text-gray-500 dark:text-gray-400">Sin roles asignados</p>}
        </div>
      </div>
    </Card>
  );
}
