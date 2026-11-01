import { ApiError, apiClient } from '../../../services/api-client';
import { refreshSession, storeAccessToken, storedAccessToken } from '../../auth/services/auth-api';

export type ProductImage = { id: string; imageAssetId: string; variantId: string | null; altText: string; sortOrder: number; isPrimary: boolean; contentType: string; url: string };
export type ProductVariant = { id: string; sku: string; options: Record<string, string>; priceVnd: string };
export type ProductOption = { code: string; label: string };
export type ProductOptionConfig = { options: ProductOption[] };
export type AdminProduct = { id: string; name: string; description: string; categoryId: string; category: { id: string; name: string }; status: 'ACTIVE' | 'INACTIVE'; optionConfig: ProductOptionConfig; variants: ProductVariant[]; images: ProductImage[]; createdAt: string; updatedAt: string };
export type VariantInput = { options: Record<string, string>; priceVnd: number };
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
export async function createAdminProduct(input: { name: string; description: string; categoryId: string; optionConfig: ProductOptionConfig; variants: VariantInput[]; images: ImageInput[] }) { return request(async token => (await apiClient.post<AdminProduct>('/admin/products', input, { headers: headers(token) })).data); }
export async function updateAdminProduct(id: string, input: Partial<Pick<AdminProduct, 'name' | 'description' | 'categoryId' | 'status'>>) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/products/${id}`, input, { headers: headers(token) })).data); }
export async function addAdminVariant(id: string, input: VariantInput) { return request(async token => (await apiClient.post<AdminProduct>(`/admin/products/${id}/variants`, input, { headers: headers(token) })).data); }
export async function updateAdminVariant(id: string, input: { priceVnd?: number }) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/variants/${id}`, input, { headers: headers(token) })).data); }
export async function deleteAdminVariant(id: string) { return request(async token => (await apiClient.delete<{ deleted: boolean }>(`/admin/variants/${id}`, { headers: headers(token) })).data); }
export async function addAdminImages(id: string, images: ImageInput[]) { return request(async token => (await apiClient.post<AdminProduct>(`/admin/products/${id}/images`, { images }, { headers: headers(token) })).data); }
export async function updateAdminImage(productId: string, id: string, input: Partial<Pick<ImageInput, 'altText' | 'sortOrder' | 'isPrimary'>>) { return request(async token => (await apiClient.patch<AdminProduct>(`/admin/products/${productId}/images/${id}`, input, { headers: headers(token) })).data); }
export async function deleteAdminImage(productId: string, id: string) { return request(async token => (await apiClient.delete<AdminProduct>(`/admin/products/${productId}/images/${id}`, { headers: headers(token) })).data); }
export function productErrorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return 'Không thể kết nối máy chủ. Vui lòng thử lại.';
  const messages: Record<string, string> = {
    SKU_OPTIONS_DUPLICATE: 'Tổ hợp lựa chọn SKU bị trùng.', SKU_OPTIONS_INVALID: 'Lựa chọn SKU không khớp cấu hình sản phẩm.',
    SKU_OPTION_KEYS_MISMATCH: 'Các SKU phải dùng cùng bộ lựa chọn.', IMAGE_ASSET_NOT_FOUND: 'Không tìm thấy asset ảnh đã tải lên.',
    PRODUCT_NEEDS_PRIMARY_IMAGE: 'Chọn đúng một ảnh đại diện.', PRODUCT_NEEDS_SKU: 'Sản phẩm cần ít nhất một SKU.',
    SKU_HAS_RESERVED_STOCK: 'Không thể xóa SKU đang được đơn hàng giữ.',
    SKU_HAS_ON_HAND_STOCK: 'Không thể xóa SKU còn hàng trong kho. Hãy xử lý tồn trước.',
    PRODUCT_NEEDS_IMAGE: 'Sản phẩm cần có ảnh đại diện.',
    PRODUCT_NOT_FOUND: 'Sản phẩm không còn tồn tại. Hãy tải lại trang.', SKU_NOT_FOUND: 'SKU không còn tồn tại. Hãy tải lại trang.',
    ACTIVE_PRODUCT_NEEDS_IMAGE: 'Sản phẩm ACTIVE phải còn ảnh.',
    IMAGE_STORAGE_NOT_CONFIGURED: 'Máy chủ chưa cấu hình Supabase Storage.', IMAGE_STORAGE_CONFIGURATION_CHANGED: 'Cấu hình bucket đã thay đổi; liên hệ quản trị viên.',
    IMAGE_STORAGE_UNAVAILABLE: 'Không kết nối được Supabase Storage. Vui lòng thử lại.', IMAGE_STORAGE_BUCKET_NOT_FOUND: 'Không tìm thấy bucket ảnh đã cấu hình.',
    IMAGE_STORAGE_UPLOAD_FAILED: 'Supabase Storage từ chối ảnh tải lên.', MEDIA_STORAGE_UPLOAD_FAILED: 'Supabase Storage từ chối tệp tải lên.', MEDIA_TOO_LARGE: 'Ảnh tối đa 5 MiB, video tối đa 50 MB mỗi tệp.', MEDIA_TYPE_UNSUPPORTED: 'Chỉ nhận ảnh JPEG, PNG, WebP hoặc video MP4, WebM, MOV.',
  };
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 403) return 'Tài khoản hiện tại không có quyền quản lý sản phẩm.';
  return messages[error.code ?? ''] ?? error.message ?? 'Không thể lưu sản phẩm. Vui lòng thử lại.';
}
