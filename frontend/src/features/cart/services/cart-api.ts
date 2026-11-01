import { ApiError, apiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';
import type { CatalogImage } from '../../catalog/services/public-catalog-api';

export type CartItem = {
  id: string;
  quantity: number;
  priceVnd: string;
  available: number;
  variant: {
    id: string;
    sku: string;
    options: Record<string, string>;
    optionLabels: Record<string, string>;
    priceVnd: string;
    available: number;
    deleted: boolean;
  } | null;
  product: {
    id: string;
    name: string;
    status: string;
    category: { id: string; name: string };
    image: Pick<CatalogImage, 'url' | 'altText'> | null;
  };
  unavailableReason: string | null;
};
export type Cart = { id: string; items: CartItem[] };

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

export function getCart() {
  return authorized(
    async (token) =>
      (await apiClient.get<Cart>('/cart', { headers: headers(token) })).data,
  );
}

export function addCartItem(target: { variantId?: string; productId?: string }, quantity: number) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<Cart>(
          '/cart/items',
          { ...target, quantity },
          { headers: headers(token) },
        )
      ).data,
  );
}

export function updateCartItem(id: string, quantity: number) {
  return authorized(
    async (token) =>
      (
        await apiClient.patch<Cart>(
          `/cart/items/${id}`,
          { quantity },
          { headers: headers(token) },
        )
      ).data,
  );
}

export function removeCartItem(id: string) {
  return authorized(
    async (token) =>
      (
        await apiClient.delete<Cart>(`/cart/items/${id}`, {
          headers: headers(token),
        })
      ).data,
  );
}
