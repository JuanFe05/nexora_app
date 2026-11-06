export function createTokenStore() {
  let accessToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token: string) => { accessToken = token; },
    clear: () => { accessToken = null; },
  };
}

export const tokenStore = createTokenStore();
