import { apiClient } from '../../../services/api-client';

export type PasswordResetRequestResponse = { message: string };

export async function requestPasswordReset(email: string) {
  const response = await apiClient.post<PasswordResetRequestResponse>(
    '/auth/password-reset-requests',
    { email },
  );
  return response.data;
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}) {
  await apiClient.post<void>('/auth/password-resets', input);
}

export async function checkAdminAccess(token: string) {
  const response = await apiClient.get<{ authorized: boolean }>(
    '/auth/admin-access',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return response.data;
}
