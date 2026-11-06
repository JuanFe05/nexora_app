import { InlineAlert } from "@/components/shared/inline-alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordForm } from "../components/password-form";
import { ProfileForm } from "../components/profile-form";
import { useProfile } from "../hooks/use-profile";

export default function ProfilePage() {
  const { profile, loading, error, retry, update } = useProfile();
  return (
    <>
      <h1 className="mb-6 text-title-lg font-semibold text-gray-800 dark:text-white/90">Perfil de usuario</h1>
      {loading && <InlineAlert>Cargando perfil…</InlineAlert>}
      {error && <Card><InlineAlert variant="error">{error}</InlineAlert><Button onClick={retry} className="self-start">Reintentar</Button></Card>}
      {profile && <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <ProfileForm key={profile.id} profile={profile} onUpdated={update} />
        <PasswordForm />
      </div>}
    </>
  );
}
