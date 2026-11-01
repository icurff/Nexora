import {
  ApiError,
  apiClient,
  refreshSessionData,
} from '../../../services/api-client';
import { storeAccessToken, storedAccessToken } from './access-token';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  createdAt: string;
  updatedAt: string;
};

export type SessionResponse = { accessToken: string; user: AuthUser };

export { storeAccessToken, storedAccessToken } from './access-token';

export async function login(email: string, password: string) {
  const response = await apiClient.post<SessionResponse>('/auth/login', {
    email,
    password,
  });
  return response.data;
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  await apiClient.post<AuthUser>('/auth/register', input);
}

export async function getSession(token: string) {
  const response = await apiClient.get<AuthUser>('/auth/session', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getProfile(token: string) {
  const response = await apiClient.get<AuthUser>('/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getMyProfile() {
  let token = storedAccessToken();
  if (!token) {
    const refreshed = await refreshSession();
    token = refreshed?.accessToken ?? null;
    storeAccessToken(token);
  }
  if (!token) throw new ApiError(401, { code: 'UNAUTHENTICATED' });
  try {
    return await getProfile(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = await refreshSession();
    if (!refreshed) {
      storeAccessToken(null);
      throw error;
    }
    storeAccessToken(refreshed.accessToken);
    return getProfile(refreshed.accessToken);
  }
}

export async function updateProfile(
  input: { fullName?: string; phone?: string | null },
  token: string,
) {
  const response = await apiClient.patch<AuthUser>('/me', input, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export function refreshSession(): Promise<SessionResponse | null> {
  return refreshSessionData() as Promise<SessionResponse | null>;
}

export async function restoreSession(): Promise<SessionResponse | null> {
  const token = storedAccessToken();
  if (token) {
    try {
      return { accessToken: token, user: await getSession(token) };
    } catch {
      storeAccessToken(null);
    }
  }

  const session = await refreshSession();
  storeAccessToken(session?.accessToken ?? null);
  return session;
}

export async function changePassword(
  input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
  token: string,
) {
  await apiClient.post<void>('/auth/change-password', input, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function logout() {
  await apiClient.post<void>('/auth/logout', {});
}

export function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return error.fieldErrors?.[field]?.[0];
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_CREDENTIALS')
      return 'Email hoặc mật khẩu chưa chính xác.';
    if (error.code === 'CURRENT_PASSWORD_INVALID')
      return 'Mật khẩu hiện tại chưa chính xác.';
    return error.message;
  }
  return fallback;
}
