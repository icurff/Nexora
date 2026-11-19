import { ApiClient, apiClient } from '../../../services/api-client';
export type Review = {
  id: string;
  productId: string;
  productName: string;
  author: string;
  rating: number;
  content: string;
  status: string;
  createdAt: string;
};
export async function getReviews(productId: string) {
  return (
    await apiClient.get<{ items: Review[] }>(`/products/${productId}/reviews`)
  ).data.items;
}
export async function submitReview(
  productId: string,
  body: { rating: number; content: string },
) {
  return (await ApiClient.post(`/products/${productId}/reviews`, body)).data;
}
export async function getAdminReviews(page: number, status?: string) {
  return (
    await ApiClient.get<{
      items: Review[];
      total: number;
      page: number;
      pageSize: number;
    }>('/admin/reviews', { params: { page, ...(status ? { status } : {}) } })
  ).data;
}
export async function moderateReview(
  id: string,
  status: 'APPROVED' | 'HIDDEN',
) {
  await ApiClient.patch(`/admin/reviews/${id}`, { status });
}
