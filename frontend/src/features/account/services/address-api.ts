import { ApiError, apiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';

export type UserAddress = {
  id: string;
  recipientName: string;
  recipientPhone: string;
  provinceName: string;
  wardName: string;
  addressLine: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AddressInput = Omit<UserAddress, 'id' | 'createdAt' | 'updatedAt'>;

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
    token = refreshed.accessToken;
    storeAccessToken(token);
    return run(token);
  }
}

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function getAddresses() {
  return authorized(async (token) => {
    const response = await apiClient.get<UserAddress[]>('/me/addresses', {
      headers: headers(token),
    });
    return response.data;
  });
}

export async function createAddress(input: AddressInput) {
  return authorized(async (token) => {
    const response = await apiClient.post<UserAddress>('/me/addresses', input, {
      headers: headers(token),
    });
    return response.data;
  });
}

export async function updateAddress(id: string, input: AddressInput) {
  return authorized(async (token) => {
    const response = await apiClient.patch<UserAddress>(
      `/me/addresses/${id}`,
      input,
      { headers: headers(token) },
    );
    return response.data;
  });
}

export async function deleteAddress(id: string) {
  await authorized(async (token) => {
    await apiClient.delete(`/me/addresses/${id}`, {
      headers: headers(token),
    });
  });
}

export async function setDefaultAddress(id: string) {
  return authorized(async (token) => {
    const response = await apiClient.put<UserAddress>(
      `/me/addresses/${id}/default`,
      {},
      { headers: headers(token) },
    );
    return response.data;
  });
}
