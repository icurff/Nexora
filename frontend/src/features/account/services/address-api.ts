import { apiClient } from '../../../services/api-client';

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

export async function getAddresses() {
  const response = await apiClient.get<UserAddress[]>('/me/addresses');
  return response.data;
}

export async function createAddress(input: AddressInput) {
  const response = await apiClient.post<UserAddress>('/me/addresses', input);
  return response.data;
}

export async function updateAddress(id: string, input: AddressInput) {
  const response = await apiClient.patch<UserAddress>(
    `/me/addresses/${id}`,
    input,
  );
  return response.data;
}

export async function deleteAddress(id: string) {
  await apiClient.delete(`/me/addresses/${id}`);
}

export async function setDefaultAddress(id: string) {
  const response = await apiClient.put<UserAddress>(
    `/me/addresses/${id}/default`,
  );
  return response.data;
}
