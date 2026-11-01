import { ApiError, apiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';

export type AdminCustomer = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'CUSTOMER';
  status: 'ACTIVE' | 'LOCKED';
  lockedAt: string | null;
  lockReason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type CustomerPage = {
  items: AdminCustomer[];
  total: number;
  page: number;
  pageSize: number;
};

async function authorized<T>(run: (token: string) => Promise<T>): Promise<T> {
  let token = storedAccessToken();
  if (!token) {
    const refreshed = await refreshSession();
    token = refreshed?.accessToken ?? null;
    storeAccessToken(token);
  }
  if (!token) throw new ApiError(401, { code: 'UNAUTHENTICATED' });
  try {
    return await run(token);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = await refreshSession();
    if (!refreshed) {
      storeAccessToken(null);
      throw error;
    }
    storeAccessToken(refreshed.accessToken);
    return run(refreshed.accessToken);
  }
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export function getCustomers(params: {
  q?: string;
  status?: string;
  page: number;
  pageSize: number;
}) {
  return authorized(
    async (token) =>
      (
        await apiClient.get<CustomerPage>('/admin/customers', {
          params,
          headers: headers(token),
        })
      ).data,
  );
}
export function getCustomer(id: string) {
  return authorized(
    async (token) =>
      (
        await apiClient.get<AdminCustomer>(`/admin/customers/${id}`, {
          headers: headers(token),
        })
      ).data,
  );
}
export function lockCustomer(id: string, reason: string) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<AdminCustomer>(
          `/admin/customers/${id}/lock`,
          { reason },
          { headers: headers(token) },
        )
      ).data,
  );
}
export function unlockCustomer(id: string) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<AdminCustomer>(
          `/admin/customers/${id}/unlock`,
          {},
          { headers: headers(token) },
        )
      ).data,
  );
}
