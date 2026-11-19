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
    return 'Unable to connect to the server. Please try again.';
  if (error.code === 'CATEGORY_ALREADY_EXISTS')
    return 'This name or slug is already in use.';
  if (error.code === 'CATEGORY_CYCLE')
    return 'A category cannot be moved into itself or one of its descendants.';
  if (error.code === 'CATEGORY_PARENT_NOT_FOUND')
    return 'The parent category no longer exists. Reload the list.';
  if (error.code === 'CATEGORY_NOT_FOUND')
    return 'The category no longer exists. Reload the list.';
  if (error.status === 401)
    return 'Your session has expired. Please sign in again.';
  if (error.status === 403)
    return 'Your account cannot manage categories.';
  return error.message || 'Unable to save the category. Please try again.';
}
