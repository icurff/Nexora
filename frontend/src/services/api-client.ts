import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config/api';
import {
  storeAccessToken,
  storedAccessToken,
} from '../features/auth/services/access-token';

export type ApiProblem = {
  code?: string;
  message?: string | string[];
  fieldErrors?: Record<string, string[]>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(status: number, problem?: ApiProblem, fallback?: string) {
    const message = Array.isArray(problem?.message)
      ? problem.message.join(' ')
      : problem?.message;
    super(message || fallback || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code;
    this.fieldErrors = problem?.fieldErrors;
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

type RefreshedSession = { accessToken: string; user: unknown };
type AuthenticatedRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
};

export const ApiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let refreshRequest: Promise<RefreshedSession | null> | null = null;

function refreshAuthenticatedSession(): Promise<RefreshedSession | null> {
  if (!refreshRequest) {
    refreshRequest = apiClient
      .post<RefreshedSession>('/auth/refresh')
      .then((response) => {
        storeAccessToken(response.data.accessToken);
        return response.data;
      })
      .catch(() => {
        storeAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export function refreshSessionData() {
  return refreshAuthenticatedSession();
}

ApiClient.interceptors.request.use(async (config) => {
  let token = storedAccessToken();
  if (!token) {
    const refreshed = await refreshAuthenticatedSession();
    token = refreshed?.accessToken ?? null;
  }
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

function toApiError(error: unknown) {
  if (!axios.isAxiosError<ApiProblem>(error)) return error;
  return new ApiError(
    error.response?.status ?? 0,
    error.response?.data,
    error.message,
  );
}

ApiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError<ApiProblem>(error)) return Promise.reject(error);
    const config = error.config as AuthenticatedRequestConfig | undefined;
    if (error.response?.status === 401 && config && !config._authRetry) {
      config._authRetry = true;
      const refreshed = await refreshAuthenticatedSession();
      if (refreshed) {
        config.headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
        return ApiClient.request(config);
      }
    }
    return Promise.reject(toApiError(error));
  },
);

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    return Promise.reject(toApiError(error));
  },
);
