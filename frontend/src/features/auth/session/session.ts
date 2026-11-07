import { httpClient } from "../../../lib/http/http-client";
import { authApi } from "../api/auth-api";
import { createAuthSession } from "./auth-session";
import { tokenStore } from "./token-store";

export const authSession = createAuthSession(authApi, tokenStore);

httpClient.configureAuth({
  getAccessToken: tokenStore.getAccessToken,
  refreshSession: authSession.refresh,
  onForbidden: authSession.onForbidden,
  onActivity: authSession.onActivity,
});
