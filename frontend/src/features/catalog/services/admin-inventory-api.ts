import { ApiError, apiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';

type InventoryRowBase = {
  options: Record<string, string>;
  optionLabels: Record<string, string>;
  product: {
    id: string;
    name: string;
    status: 'ACTIVE' | 'INACTIVE';
    category: { id: string; name: string };
  };
  onHand: number;
  reserved: number;
  available: number;
  version: string;
  updatedAt: string;
  deleted: boolean;
};
export type InventorySkuRow = InventoryRowBase & {
  kind: 'SKU';
  skuId: string;
  sku: string;
};
export type InventoryProductRow = InventoryRowBase & {
  kind: 'PRODUCT';
  skuId?: never;
  sku?: never;
};
export type InventoryRow = InventorySkuRow | InventoryProductRow;
export type InventoryPage = {
  items: InventoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type InventoryAdjustment = {
  idempotencyKey: string;
  type: 'RESTOCK' | 'ADJUSTMENT' | 'STOCKTAKE';
  quantity: number;
  reason: string;
  expectedVersion?: string;
};

async function request<T>(run: (token: string) => Promise<T>): Promise<T> {
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

export function getAdminInventory(params: URLSearchParams) {
  return request(
    async (token) =>
      (
        await apiClient.get<InventoryPage>(`/admin/inventory?${params}`, {
          headers: headers(token),
        })
      ).data,
  );
}
export function getAdminInventoryItem(id: string) {
  return request(
    async (token) =>
      (
        await apiClient.get<InventorySkuRow>(`/admin/inventory/${id}`, {
          headers: headers(token),
        })
      ).data,
  );
}
export function adjustAdminInventory(id: string, input: InventoryAdjustment) {
  return request(
    async (token) =>
      (
        await apiClient.post<InventorySkuRow>(
          `/admin/inventory/${id}/adjustments`,
          input,
          {
            headers: {
              ...headers(token),
              'Idempotency-Key': input.idempotencyKey,
            },
          },
        )
      ).data,
  );
}

export function inventoryErrorMessage(error: unknown) {
  if (!(error instanceof ApiError))
    return 'Unable to connect to the server. Please try again.';
  const messages: Record<string, string> = {
    INVENTORY_REASON_REQUIRED: 'Enter a reason for the stock adjustment.',
    INVENTORY_QUANTITY_INVALID: 'The quantity is invalid or exceeds the limit.',
    INVENTORY_NO_CHANGE: 'The new quantity does not change stock.',
    INVENTORY_BELOW_RESERVED:
      'On-hand stock cannot be less than reserved stock.',
    INVENTORY_VERSION_REQUIRED: 'Reload stock before taking inventory.',
    INVENTORY_VERSION_CONFLICT:
      'Stock has changed. Reload the latest values and confirm again.',
    IDEMPOTENCY_KEY_REUSED:
      'This request key was already used with different data. Reload stock.',
    SKU_DELETED: 'This SKU is inactive and available only for historical viewing.',
    SKU_NOT_FOUND: 'SKU not found.',
    CATEGORY_NOT_FOUND: 'The category no longer exists.',
  };
  if (error.status === 401)
    return 'Your session has expired. Please sign in again.';
  if (error.status === 403)
    return 'Your account cannot manage inventory.';
  return (
    messages[error.code ?? ''] ??
    error.message ??
    'Unable to save inventory changes.'
  );
}
