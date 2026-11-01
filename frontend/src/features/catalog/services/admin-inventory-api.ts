import { ApiError, apiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';

export type InventoryRow = {
  skuId: string;
  sku: string;
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
export type InventoryPage = {
  items: InventoryRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export type InventoryLedgerEntry = {
  id: string;
  type: 'RESTOCK' | 'ADJUSTMENT' | 'STOCKTAKE' | 'LEGACY';
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  reservedBefore: number | null;
  reservedAfter: number | null;
  actor: string;
  reason: string;
  createdAt: string;
};
export type InventoryHistoryPage = {
  items: InventoryLedgerEntry[];
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
        await apiClient.get<InventoryRow>(`/admin/inventory/${id}`, {
          headers: headers(token),
        })
      ).data,
  );
}
export function getAdminInventoryHistory(id: string, params: URLSearchParams) {
  return request(
    async (token) =>
      (
        await apiClient.get<InventoryHistoryPage>(
          `/admin/inventory/${id}/history?${params}`,
          { headers: headers(token) },
        )
      ).data,
  );
}
export function adjustAdminInventory(id: string, input: InventoryAdjustment) {
  return request(
    async (token) =>
      (
        await apiClient.post<InventoryRow>(
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
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  const messages: Record<string, string> = {
    INVENTORY_REASON_REQUIRED: 'Nhập lý do điều chỉnh tồn.',
    INVENTORY_QUANTITY_INVALID: 'Số lượng không hợp lệ hoặc vượt giới hạn.',
    INVENTORY_NO_CHANGE: 'Số lượng mới không làm thay đổi tồn kho.',
    INVENTORY_BELOW_RESERVED:
      'Tồn thực tế không thể thấp hơn số lượng đang giữ.',
    INVENTORY_VERSION_REQUIRED: 'Tải lại tồn kho trước khi kiểm kê.',
    INVENTORY_VERSION_CONFLICT:
      'Tồn kho vừa thay đổi. Hãy tải số liệu mới và xác nhận lại.',
    IDEMPOTENCY_KEY_REUSED:
      'Yêu cầu này đã dùng mã gửi trùng với dữ liệu khác. Hãy tải lại tồn kho.',
    SKU_DELETED: 'SKU đã ngừng hoạt động và chỉ còn xem lịch sử.',
    SKU_NOT_FOUND: 'Không tìm thấy SKU này.',
    CATEGORY_NOT_FOUND: 'Danh mục không còn tồn tại.',
  };
  if (error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403)
    return 'Tài khoản hiện tại không có quyền quản lý tồn kho.';
  return (
    messages[error.code ?? ''] ??
    error.message ??
    'Không thể lưu thay đổi tồn kho.'
  );
}
