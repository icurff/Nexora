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
  SIMILAR_TO_RECENT_VIEW: 'Based on your recent views',
  SIMILAR_TO_PAGE_CONTEXT: 'Based on items on this page',
  TRAINED_USER_PROFILE: '',
  recently_viewed_category: 'From a category you viewed',
  similar_category: 'From the same category',
  cart_category: 'From a category in your cart',
  new_arrival: 'New arrival',
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
    <section className="home-section" aria-label="Product recommendations">
      <SectionHeading
        title={
          surface === 'home'
            ? 'Picked for you'
            : surface === 'detail'
              ? 'You may also like'
              : 'You may also need'
        }
        description={
          hasAI
            ? 'Discover products selected for you.'
            : 'Discover related products and new arrivals at Nexora.'
        }
      />
      {query.isPending ? <p role="status">Loading recommendations…</p> : null}
      {query.isError || (!query.isPending && !items.length) ? (
        <p role="status">
          No recommendations are available right now. You can continue shopping.
        </p>
      ) : null}
      <div className="recommendation-grid">
        {items.map((item, index) => {
          const product = products[index]?.data;
          if (!product) return null;
          return (
            <div key={item.productId}>
              <p className="product-category">
                {item.source === 'lightgcn_session' ? (
                  <>
                    <strong>LightGCN</strong>
                    {item.reason !== 'TRAINED_USER_PROFILE' && <br />}
                  </>
                ) : null}
                {reasons[item.reason] ??
                  (item.source === 'lightgcn_session'
                    ? 'Ranked for your browsing session'
                    : 'Related product')}
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
          Could not load recommended products. Please try again later.
        </p>
      ) : null}
    </section>
  );
}
