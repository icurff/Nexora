import axios from 'axios';
import { API_BASE_URL } from '../config/api';

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

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!axios.isAxiosError<ApiProblem>(error)) return Promise.reject(error);
    return Promise.reject(
      new ApiError(
        error.response?.status ?? 0,
        error.response?.data,
        error.message,
      ),
    );
  },
);
