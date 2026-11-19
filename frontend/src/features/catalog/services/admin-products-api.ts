import { ApiError, apiClient } from '../../../services/api-client';
import { refreshSession, storeAccessToken, storedAccessToken } from '../../auth/services/auth-api';

export type ProductImage = { id: string; imageAssetId: string; variantId: string | null; altText: string; sortOrder: number; isPrimary: boolean; contentType: string; url: string };
export type ProductVariant = { id: string; sku: string; options: Record<string, string>; priceVnd: string };
export type ProductOption = { code: string; label: string };
export type ProductOptionConfig = { options: ProductOption[] };
export type AdminProduct = { id: string; name: string; description: string; categoryId: string; category: { id: string; name: string }; status: 'ACTIVE' | 'INACTIVE'; priceVnd: string | null; onHand: number; optionConfig: ProductOptionConfig; variants: ProductVariant[]; images: ProductImage[]; createdAt: string; updatedAt: string };
export type VariantInput = { options: Record<string, string>; priceVnd: number; onHand?: number };
export type ImageInput = { imageAssetId: string; variantId?: string; altText: string; sortOrder: number; isPrimary: boolean };

async function request<T>(run: (token: string) => Promise<T>): Promise<T> {
  let token = storedAccessToken();
  if (!token) { const refreshed = await refreshSession(); token = refreshed?.accessToken ?? null; storeAccessToken(token); }
  if (!token) throw new ApiError(401, { code: 'UNAUTHENTICATED' });
  try { return await run(token); } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const refreshed = await refreshSession(); if (!refreshed) { storeAccessToken(null); throw error; }
    token = refreshed.accessToken; storeAccessToken(token); return run(token);
  }
}
const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function getAdminProducts(params: URLSearchParams) {
  return request(async token => (await apiClient.get<{ items: AdminProduct[]; page: number; pageSize: number; total: number; totalPages: number }>(`/admin/products?${params}`, { headers: headers(token) })).data);
}
export async function getAdminProduct(id: string) { return request(async token => (await apiClient.get<AdminProduct>(`/admin/products/${id}`, { headers: headers(token) })).data); }
export async function uploadAdminImage(file: File) {
  return request(async token => {
    const body = new FormData(); body.append('file', file);
    return (await apiClient.post<{ imageAssetId: string; url: string; contentType: string; size: number }>('/admin/images', body, {
      headers: { ...headers(token), 'Content-Type': 'multipart/form-data' },
    })).data;
  });
}
export async function createAdminProduct(input: { name: string; description: string; categoryId: string; priceVnd?: number; onHand?: number; optionConfig: ProductOptionConfig; variants: VariantInput[]; images: ImageInput[] }) { return request(async token => (await apiClient.post<AdminProduct>('/admin/products', input, { headers: headers(token) })).data); }
export async function updateAdminProduct(id: string, input: { name?: string; description?: string; categoryId?: string; status?: 'ACTIVE' | 'INACTIVE'; priceVnd?: number }) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/products/${id}`, input, { headers: headers(token) })).data); }
export async function setAdminProductStock(id: string, onHand: number) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/products/${id}/inventory`, { onHand }, { headers: headers(token) })).data); }
export async function addAdminVariant(id: string, input: VariantInput) { return request(async token => (await apiClient.post<AdminProduct>(`/admin/products/${id}/variants`, input, { headers: headers(token) })).data); }
export async function updateAdminVariant(id: string, input: { priceVnd?: number }) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/variants/${id}`, input, { headers: headers(token) })).data); }
export async function deleteAdminVariant(id: string) { return request(async token => (await apiClient.delete<{ deleted: boolean }>(`/admin/variants/${id}`, { headers: headers(token) })).data); }
export async function addAdminImages(id: string, images: ImageInput[]) { return request(async token => (await apiClient.post<AdminProduct>(`/admin/products/${id}/images`, { images }, { headers: headers(token) })).data); }
export async function updateAdminImage(productId: string, id: string, input: Partial<Pick<ImageInput, 'altText' | 'sortOrder' | 'isPrimary'>>) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/products/${productId}/images/${id}`, input, { headers: headers(token) })).data); }
export async function deleteAdminImage(productId: string, id: string) { return request(async token => (await apiClient.delete<AdminProduct>(`/admin/products/${productId}/images/${id}`, { headers: headers(token) })).data); }
export function productErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Unable to connect to the server. Please try again.';
  const messages: Record<string, string> = {
    SKU_OPTIONS_DUPLICATE: 'This SKU option combination is duplicated.', SKU_OPTIONS_INVALID: 'SKU options do not match the product configuration.',
    SKU_OPTION_KEYS_MISMATCH: 'SKUs must use the same option set.', IMAGE_ASSET_NOT_FOUND: 'Uploaded image asset not found.',
    PRODUCT_NEEDS_PRIMARY_IMAGE: 'Select exactly one primary image.', PRODUCT_NEEDS_SKU: 'The product requires at least one SKU.',
    SKU_HAS_RESERVED_STOCK: 'Cannot delete a SKU reserved by orders.',
    SKU_HAS_ON_HAND_STOCK: 'Cannot delete a SKU with stock on hand. Resolve its stock first.',
    PRODUCT_NEEDS_IMAGE: 'The product requires a primary image.',
    PRODUCT_NOT_FOUND: 'The product no longer exists. Reload the page.', SKU_NOT_FOUND: 'The SKU no longer exists. Reload the page.',
    ACTIVE_PRODUCT_NEEDS_IMAGE: 'An active product must retain an image.',
    IMAGE_STORAGE_NOT_CONFIGURED: 'Supabase Storage is not configured on the server.', IMAGE_STORAGE_CONFIGURATION_CHANGED: 'The bucket configuration has changed; contact an administrator.',
    IMAGE_STORAGE_UNAVAILABLE: 'Unable to connect to Supabase Storage. Please try again.', IMAGE_STORAGE_BUCKET_NOT_FOUND: 'The configured image bucket was not found.',
    IMAGE_STORAGE_UPLOAD_FAILED: 'Supabase Storage rejected the image upload.', MEDIA_STORAGE_UPLOAD_FAILED: 'Supabase Storage rejected the file upload.', MEDIA_TOO_LARGE: 'Images must be at most 5 MiB and videos at most 50 MB per file.', MEDIA_TYPE_UNSUPPORTED: 'Only JPEG, PNG, WebP images and MP4, WebM, MOV videos are supported.',
  };
  if (error.status === 401) return 'Your session has expired. Please sign in again.';
  if (error.status === 403) return 'Your account cannot manage products.';
  return messages[error.code ?? ''] ?? error.message ?? 'Unable to save the product. Please try again.';
}
