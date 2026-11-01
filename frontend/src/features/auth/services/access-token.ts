const ACCESS_TOKEN_KEY = 'nexora_access_token';

export function storedAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // The in-memory session remains usable if browser storage is unavailable.
  }
}
