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

type ApiProblem = {
  code?: string;
  message?: string | string[];
  fieldErrors?: Record<string, string[]>;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: Record<string, string[]>;

  constructor(status: number, problem?: ApiProblem) {
    const message = Array.isArray(problem?.message)
      ? problem.message.join(' ')
      : problem?.message;
    super(message || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code;
    this.fieldErrors = problem?.fieldErrors;
  }
}

const AUTH_BASE = '/api/v1/auth';
let refreshRequest: Promise<SessionResponse | null> | null = null;

async function problemFrom(response: Response) {
  try {
    return (await response.json()) as ApiProblem;
  } catch {
    return undefined;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    credentials: 'include',
  });
  if (!response.ok)
    throw new ApiError(response.status, await problemFrom(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function login(email: string, password: string) {
  return request<SessionResponse>('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function register(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  await request<AuthUser>('/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getSession(token: string) {
  return request<AuthUser>('/session', {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}

export function refreshSession(): Promise<SessionResponse | null> {
  if (!refreshRequest) {
    refreshRequest = request<SessionResponse>('/refresh', { method: 'POST' })
      .catch(() => null)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export function changePassword(
  input: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
  token: string,
) {
  return request<void>('/change-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
}

export function logout() {
  return request<void>('/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
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
