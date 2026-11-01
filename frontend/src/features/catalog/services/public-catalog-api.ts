import { apiClient } from '../../../services/api-client';

export type CatalogImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  contentType: string;
};
export type CatalogVariant = {
  id: string;
  sku: string;
  options: Record<string, string>;
  priceVnd: string;
  available: number;
  images: CatalogImage[];
};
export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  category: { id: string; name: string };
  priceVnd: string | null;
  available: number;
  image: CatalogImage | null;
};
export type CatalogProductDetail = {
  id: string;
  name: string;
  description: string;
  category: { id: string; name: string };
  optionConfig: { options: Array<{ code: string; label: string }> };
  priceVnd: string | null;
  available: number;
  variants: CatalogVariant[];
  images: CatalogImage[];
};
export type ProductPage = {
  items: CatalogProduct[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function getPublicProducts(page = 1): Promise<ProductPage> {
  return (
    await apiClient.get<ProductPage>('/products', {
      params: { page, pageSize: 20 },
    })
  ).data;
}

export async function getPublicProduct(
  id: string,
): Promise<CatalogProductDetail> {
  return (await apiClient.get<CatalogProductDetail>(`/products/${id}`)).data;
}

export function formatVnd(value: string | bigint) {
  return `${new Intl.NumberFormat('vi-VN').format(BigInt(value))} ₫`;
}
