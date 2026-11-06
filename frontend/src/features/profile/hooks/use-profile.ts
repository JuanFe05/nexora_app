import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { getProfile, profileFailure } from "../api/profile-api";
import type { Profile } from "../types";

export function useProfile() {
  const { status, user } = useAuth();
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<{ profile: Profile | null; error: string | null; loading: boolean }>({ profile: null, error: null, loading: true });
  const userId = user?.id;
  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    const controller = new AbortController();
    let active = true;
    void getProfile(controller.signal).then(
      (profile) => { if (active) setState({ profile, error: null, loading: false }); },
      (error: unknown) => { if (active) setState({ profile: null, error: profileFailure(error).message, loading: false }); },
    );
    return () => { active = false; controller.abort(); };
  }, [status, userId, request]);

  function retry() {
    setState({ profile: null, error: null, loading: true });
    setRequest((previous) => previous + 1);
  }
  function update(profile: Profile) { setState({ profile, error: null, loading: false }); }
  return { ...state, retry, update };
}
