import { Card } from "@/components/ui/card";
import type { Profile } from "../types";

function fullName(profile: Profile) {
  return [profile.primer_nombre, profile.segundo_nombre, profile.primer_apellido, profile.segundo_apellido].filter(Boolean).join(" ");
}
function initials(profile: Profile) {
  return `${profile.primer_nombre.charAt(0)}${profile.primer_apellido.charAt(0)}`.toUpperCase();
}

/** Tarjeta de cabecera (equivalente a UserMetaCard de TailAdmin) con datos ya existentes del modelo; no agrega campos. */
export function ProfileHeaderCard({ profile }: { profile: Profile }) {
  return (
    <Card aria-labelledby="profile-name" className="min-w-0">
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-start">
        <div aria-hidden="true" className="flex size-20 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-brand-50 text-2xl font-semibold text-brand-700 dark:border-gray-800 dark:bg-brand-500/15 dark:text-brand-300">{initials(profile)}</div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id="profile-name" className="text-xl font-semibold break-words text-gray-800 dark:text-white/90">{fullName(profile)}</h2>
            <p className="text-sm break-all text-gray-500 dark:text-gray-400">@{profile.nombre_usuario}</p>
          </div>
          <ul aria-label="Roles asignados" className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {profile.roles.map((role) => <li key={role} className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium break-all text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{role}</li>)}
          </ul>
          {!profile.roles.length && <p className="text-sm text-gray-500 dark:text-gray-400">Sin roles asignados</p>}
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 capitalize dark:bg-white/5 dark:text-gray-300">{profile.estado.toLowerCase()}</span>
      </div>
    </Card>
  );
}
