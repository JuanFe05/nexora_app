import { useEffect } from "react";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordForm } from "../components/password-form";
import { ProfileForm } from "../components/profile-form";
import { ProfileHeaderCard } from "../components/profile-header-card";
import { useProfile } from "../hooks/use-profile";

export default function ProfilePage() {
  const { profile, loading, error, retry, update } = useProfile();
  const toast = useToast();
  useEffect(() => { if (error) toast.error(error); }, [error, toast]);
  return (
    <>
      <h1 className="mb-6 text-title-lg font-semibold text-gray-800 dark:text-white/90">Perfil de usuario</h1>
      {loading && <InlineAlert>Cargando perfil…</InlineAlert>}
      {error && <Card><p className="text-sm text-gray-500 dark:text-gray-400">No se pudo cargar tu perfil.</p><Button onClick={retry} className="self-start">Reintentar</Button></Card>}
      {profile && <div className="space-y-6">
        <ProfileHeaderCard profile={profile} />
        <ProfileForm key={profile.id} profile={profile} onUpdated={update} />
        <PasswordForm />
      </div>}
    </>
  );
}
