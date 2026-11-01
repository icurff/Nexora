import { apiClient, ApiError } from '../../../services/api-client.js';
import {
  refreshSession,
  storedAccessToken,
  storeAccessToken,
} from '../../auth/services/auth-api.js';

export type OrderItem = {
  id: string;
  productId: string;
  variantId: string | null;
  productName: string;
  sku: string | null;
  options: Record<string, { label: string; value: string }>;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
};
export type Order = {
  id: string;
  userId: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: string;
  shippingFee: string;
  totalAmount: string;
  address: {
    recipientName: string;
    recipientPhone: string;
    provinceName: string;
    wardName: string;
    addressLine: string;
  };
  customerNote: string | null;
  expiresAt: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  firstShippedAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  returnedAt: string | null;
  cancelReason: string | null;
  items: OrderItem[];
  history: Array<{
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    actor: string;
    actorRole: string;
    createdAt: string;
  }>;
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
    token = refreshed.accessToken;
    storeAccessToken(token);
    return run(token);
  }
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export function placeOrder(input: {
  idempotencyKey: string;
  items: Array<{ cartItemId: string; quantity: number; unitPrice: string }>;
  addressId: string;
  addressUpdatedAt: string;
  customerNote: string;
}) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<Order>('/orders', input, {
          headers: headers(token),
        })
      ).data,
  );
}
export function getOrders(status?: string, page = 1, pageSize = 20) {
  return authorized(
    async (token) =>
      (
        await apiClient.get<{
          items: Order[];
          page: number;
          pageSize: number;
          total: number;
        }>('/orders', {
          params: { ...(status ? { status } : {}), page, pageSize },
          headers: headers(token),
        })
      ).data,
  );
}
export function getOrder(id: string) {
  return authorized(
    async (token) =>
      (await apiClient.get<Order>(`/orders/${id}`, { headers: headers(token) }))
        .data,
  );
}
export function getOrderByKey(key: string) {
  return authorized(
    async (token) =>
      (
        await apiClient.get<Order>(`/orders/by-checkout-key/${key}`, {
          headers: headers(token),
        })
      ).data,
  );
}
export function cancelOrder(
  id: string,
  idempotencyKey: string,
  expectedVersion: string,
) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<Order>(
          `/orders/${id}/cancel`,
          { idempotencyKey, expectedVersion },
          { headers: headers(token) },
        )
      ).data,
  );
}
export function getAdminOrders(status?: string, page = 1, pageSize = 20) {
  return authorized(
    async (token) =>
      (
        await apiClient.get<{
          items: Array<
            Order & { customer: { fullName: string; email: string } }
          >;
          page: number;
          pageSize: number;
          total: number;
        }>('/admin/orders', {
          params: { ...(status ? { status } : {}), page, pageSize },
          headers: headers(token),
        })
      ).data,
  );
}

export function transitionAdminOrder(
  id: string,
  action:
    'ship' | 'deliver' | 'delivery-fail' | 'retry-delivery' | 'receive-return',
  input: {
    idempotencyKey: string;
    expectedVersion: string;
    reason?: string;
    codCollected?: true;
    allItemsReceived?: true;
  },
) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<Order>(`/admin/orders/${id}/${action}`, input, {
          headers: headers(token),
        })
      ).data,
  );
}
export function getAdminOrder(id: string) {
  return authorized(
    async (token) =>
      (
        await apiClient.get<Order>(`/admin/orders/${id}`, {
          headers: headers(token),
        })
      ).data,
  );
}
export function confirmAdminOrder(
  id: string,
  idempotencyKey: string,
  expectedVersion: string,
) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<Order>(
          `/admin/orders/${id}/confirm`,
          { idempotencyKey, expectedVersion },
          { headers: headers(token) },
        )
      ).data,
  );
}
export function cancelAdminOrder(
  id: string,
  idempotencyKey: string,
  expectedVersion: string,
  reason: string,
) {
  return authorized(
    async (token) =>
      (
        await apiClient.post<Order>(
          `/admin/orders/${id}/cancel`,
          { idempotencyKey, expectedVersion, reason },
          { headers: headers(token) },
        )
      ).data,
  );
}
