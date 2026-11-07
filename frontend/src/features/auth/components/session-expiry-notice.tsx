import { useEffect } from "react";
import { useToast } from "../../../components/shared/toast/use-toast";
import { authSession } from "../session/session";

/** Mounted under ToastProvider, outside route guards so the notice survives redirects. */
export function SessionExpiryNotice({ session = authSession }: { session?: Pick<typeof authSession, "subscribeExpired"> }) {
  const toast = useToast();
  useEffect(() => session.subscribeExpired(() => { toast.info("Tu sesión expiró"); }), [session, toast]);
  return null;
}
