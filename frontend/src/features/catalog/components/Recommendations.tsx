import { useQueries, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/hooks/useAuth';
import { apiClient, ApiClient } from '../../../services/api-client';
import { storedAccessToken } from '../../auth/services/access-token';
import { getPublicProduct } from '../services/public-catalog-api';
import { CatalogProductGrid, SectionHeading } from './catalog-components';

type RecommendationItem = {
  productId: string;
  source: 'lightgcn_session' | 'rule_based';
  reason: string;
};
type RecommendationResponse = {
  source: 'lightgcn_session' | 'rule_based' | 'hybrid';
  strategy: string;
  items: RecommendationItem[];
};

const reasons: Record<string, string> = {
  SIMILAR_TO_RECENT_VIEW: 'Phù hợp với sản phẩm bạn quan tâm',
  recently_viewed_category: 'Cùng danh mục bạn vừa xem',
  similar_category: 'Cùng danh mục sản phẩm',
  cart_category: 'Cùng danh mục trong giỏ hàng',
  new_arrival: 'Sản phẩm mới',
};

export function Recommendations({
  surface,
  productId,
  revision,
}: {
  surface: 'home' | 'detail' | 'cart';
  productId?: string;
  revision?: string;
}) {
  const { user, status } = useAuth();
  const path =
    surface === 'detail'
      ? `/recommendations/products/${productId}/session`
      : surface === 'cart'
        ? '/recommendations/cart/session'
        : '/recommendations/home';
  const query = useQuery({
    queryKey: ['recommendations', surface, productId, user?.id, revision],
    queryFn: async () => {
      const token = storedAccessToken();
      return (
        await (
          surface === 'cart' ? ApiClient : apiClient
        ).get<RecommendationResponse>(path, {
          params: { limit: 8 },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          timeout: 8000,
        })
      ).data;
    },
    enabled: status !== 'loading' && (surface !== 'cart' || Boolean(user)),
    retry: false,
    staleTime: 0,
  });
  const items = query.data?.items ?? [];
  const products = useQueries({
    queries: items.map((item) => ({
      queryKey: ['public-product', item.productId],
      queryFn: () => getPublicProduct(item.productId),
      retry: false,
      staleTime: 30_000,
    })),
  });
  const hasAI = items.some((item) => item.source === 'lightgcn_session');
  return (
    <section className="home-section" aria-label="Đề xuất sản phẩm">
      <SectionHeading
        eyebrow={
          hasAI
            ? 'AI RECOMMENDATIONS · LIGHTGCN'
            : 'RULE-BASED RECOMMENDATIONS'
        }
        title={
          surface === 'home'
            ? 'Dành riêng cho bạn'
            : surface === 'detail'
              ? 'Có thể bạn cũng thích'
              : 'Có thể bạn cũng cần'
        }
        description={
          hasAI
            ? 'LightGCN xếp hạng theo ngữ cảnh và lịch sử xem trong phiên. Các mục bổ sung theo quy tắc được ghi nhãn riêng.'
            : 'Khám phá sản phẩm cùng danh mục và những lựa chọn mới tại Nexora.'
        }
      />
      {query.isPending ? <p role="status">Đang tải đề xuất…</p> : null}
      {query.isError || (!query.isPending && !items.length) ? (
        <p role="status">
          Chưa có đề xuất lúc này. Bạn vẫn có thể tiếp tục mua sắm.
        </p>
      ) : null}
      <div className="recommendation-grid">
        {items.map((item, index) => {
          const product = products[index]?.data;
          if (!product) return null;
          return (
            <div key={item.productId}>
              <p className="product-category">
                <strong>
                  {item.source === 'lightgcn_session'
                    ? 'AI - LightGCN'
                    : 'Rule-based Recommendations'}
                </strong>
                <br />
                {reasons[item.reason] ??
                  (item.source === 'lightgcn_session'
                    ? 'Được LightGCN xếp hạng theo phiên'
                    : 'Sản phẩm liên quan')}
              </p>
              <CatalogProductGrid
                products={[
                  {
                    ...product,
                    priceVnd: product.variants.length
                      ? product.variants.reduce(
                          (lowest, variant) =>
                            BigInt(variant.priceVnd) < BigInt(lowest)
                              ? variant.priceVnd
                              : lowest,
                          product.variants[0].priceVnd,
                        )
                      : product.priceVnd,
                    available: product.variants.length
                      ? product.variants.reduce(
                          (sum, variant) => sum + variant.available,
                          0,
                        )
                      : product.available,
                    image:
                      product.images.find((image) => image.isPrimary) ??
                      product.images[0] ??
                      null,
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
      {items.length > 0 && products.every((product) => product.isError) ? (
        <p role="status">
          Không thể tải sản phẩm đề xuất. Vui lòng thử lại sau.
        </p>
      ) : null}
    </section>
  );
}
