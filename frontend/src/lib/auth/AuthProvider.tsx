import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  changePassword as changePasswordRequest,
  getSession,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession,
  register as registerRequest,
  type AuthUser,
  type SessionResponse,
} from '../api/auth-api';
import { AuthContext, type AuthStatus } from './auth-context';

const ACCESS_TOKEN_KEY = 'nexora_access_token';
let restoreRequest: Promise<SessionResponse | null> | null = null;

function storedAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeSession(session: SessionResponse | null) {
  try {
    if (session) localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // The in-memory session remains usable if browser storage is unavailable.
  }
}

function restoreSession(): Promise<SessionResponse | null> {
  if (!restoreRequest) {
    restoreRequest = (async () => {
      const token = storedAccessToken();
      if (token) {
        try {
          const user = await getSession(token);
          return { accessToken: token, user };
        } catch {
          storeSession(null);
        }
      }
      return refreshSession();
    })().finally(() => {
      restoreRequest = null;
    });
  }
  return restoreRequest;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const applySession = useCallback((session: SessionResponse | null) => {
    storeSession(session);
    setUser(session?.user ?? null);
    setStatus(session ? 'authenticated' : 'unauthenticated');
  }, []);

  useEffect(() => {
    let active = true;
    void restoreSession().then((session) => {
      if (active) applySession(session);
    });
    return () => {
      active = false;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await loginRequest(email, password));
    },
    [applySession],
  );

  const register = useCallback(
    (input: {
      fullName: string;
      email: string;
      password: string;
      confirmPassword: string;
    }) => registerRequest(input),
    [],
  );

  const changePassword = useCallback(
    async (input: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => {
      const token = storedAccessToken();
      if (!token) throw new ApiError(401, { code: 'UNAUTHENTICATED' });
      try {
        await changePasswordRequest(input, token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        const refreshed = await refreshSession();
        applySession(refreshed);
        if (!refreshed) throw error;
        await changePasswordRequest(input, refreshed.accessToken);
      }
      applySession(null);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({ status, user, login, register, changePassword, logout }),
    [status, user, login, register, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
