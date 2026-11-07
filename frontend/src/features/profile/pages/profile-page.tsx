import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { InlineAlert } from "@/components/shared/inline-alert";
import { useToast } from "@/components/shared/toast/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsPanel } from "@/components/ui/tabs";
import { DesktopIcon, LockIcon, UserCircleIcon } from "@/icons";
import { SecuritySection } from "../components/security-section";
import { SessionsSection } from "../components/sessions-section";
import { AccountSummary } from "../components/account-summary";
import { ProfileForm } from "../components/profile-form";
import { ProfileHeaderCard } from "../components/profile-header-card";
import { useProfile } from "../hooks/use-profile";
import type { Profile } from "../types";

const tabValues = ["general", "security", "sessions"] as const;
type ProfileTab = typeof tabValues[number];
function validTab(value: unknown): value is ProfileTab { return tabValues.some((tab) => tab === value); }

function ProfileContent({ profile, update }: { profile: Profile; update: (profile: Profile) => void }) {
  const [search, setSearch] = useSearchParams();
  const rawTab = search.get("tab");
  const tab = validTab(rawTab) ? rawTab : "general";
  const [sessionsVisited, setSessionsVisited] = useState(tab === "sessions");
  // Retain the lazy panel after its first visit, without remounting any dialogs.
  if (tab === "sessions" && !sessionsVisited) setSessionsVisited(true);
  useEffect(() => {
    if (rawTab !== null && !validTab(rawTab)) {
      setSearch((previous) => { const next = new URLSearchParams(previous); next.set("tab", "general"); return next; }, { replace: true });
    }
  }, [rawTab, setSearch]);
  function selectTab(value: unknown) {
    if (!validTab(value)) return;
    setSearch((previous) => { const next = new URLSearchParams(previous); next.set("tab", value); return next; });
  }
  return <div className="min-w-0 space-y-6">
    <ProfileHeaderCard profile={profile} />
    <Tabs value={tab} onValueChange={selectTab}>
      <TabsList aria-label="Secciones del perfil">
        <TabsTrigger value="general"><UserCircleIcon aria-hidden="true" className="size-5" />Información general</TabsTrigger>
        <TabsTrigger value="security"><LockIcon aria-hidden="true" className="size-5" />Seguridad</TabsTrigger>
        <TabsTrigger value="sessions"><DesktopIcon aria-hidden="true" className="size-5" />Sesiones</TabsTrigger>
      </TabsList>
      <TabsPanel value="general" keepMounted><div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><ProfileForm profile={profile} onUpdated={update} /><AccountSummary profile={profile} /></div></TabsPanel>
      <TabsPanel value="security" keepMounted><SecuritySection /></TabsPanel>
      <TabsPanel value="sessions" keepMounted>{sessionsVisited && <SessionsSection />}</TabsPanel>
    </Tabs>
  </div>;
}

export default function ProfilePage() {
  const { profile, loading, error, retry, update } = useProfile();
  const toast = useToast();
  useEffect(() => { if (error) toast.error(error); }, [error, toast]);
  return <>
    <h1 className="mb-6 text-title-lg font-semibold text-gray-800 dark:text-white/90">Perfil de usuario</h1>
    {loading && <InlineAlert>Cargando perfil…</InlineAlert>}
    {error && <Card><p className="text-sm text-gray-500 dark:text-gray-400">No se pudo cargar tu perfil.</p><Button onClick={retry} className="self-start">Reintentar</Button></Card>}
    {profile && <ProfileContent key={profile.id} profile={profile} update={update} />}
  </>;
}
