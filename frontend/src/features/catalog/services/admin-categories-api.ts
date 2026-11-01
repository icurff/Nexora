import { ApiError, apiClient } from '../../../services/api-client';
import {
  refreshSession,
  storeAccessToken,
  storedAccessToken,
} from '../../auth/services/auth-api';

export type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CategoryInput = {
  name: string;
  slug?: string;
  parentId: string | null;
};

async function requestWithAdminAuth<T>(
  run: (token: string) => Promise<T>,
): Promise<T> {
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

export function getAdminCategories() {
  return requestWithAdminAuth(async (token) => {
    const response = await apiClient.get<{ items: Category[] }>(
      '/admin/categories',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.data.items;
  });
}

export function createAdminCategory(input: CategoryInput) {
  return requestWithAdminAuth(async (token) => {
    const response = await apiClient.post<Category>(
      '/admin/categories',
      input,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.data;
  });
}

export function updateAdminCategory(id: string, input: Partial<CategoryInput>) {
  return requestWithAdminAuth(async (token) => {
    const response = await apiClient.patch<Category>(
      `/admin/categories/${id}`,
      input,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.data;
  });
}

export function categoryErrorMessage(error: unknown) {
  if (!(error instanceof ApiError))
    return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  if (error.code === 'CATEGORY_ALREADY_EXISTS')
    return 'Tên hoặc slug này đã được sử dụng.';
  if (error.code === 'CATEGORY_CYCLE')
    return 'Không thể chuyển danh mục vào chính nó hoặc danh mục con.';
  if (error.code === 'CATEGORY_PARENT_NOT_FOUND')
    return 'Danh mục cha không còn tồn tại. Hãy tải lại danh sách.';
  if (error.code === 'CATEGORY_NOT_FOUND')
    return 'Danh mục không còn tồn tại. Hãy tải lại danh sách.';
  if (error.status === 401)
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403)
    return 'Tài khoản hiện tại không có quyền quản lý danh mục.';
  return error.message || 'Không thể lưu danh mục. Vui lòng thử lại.';
}
