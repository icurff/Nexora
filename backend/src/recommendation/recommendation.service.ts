import { Injectable } from '@nestjs/common';
import { RecommendationRepository } from './recommendation.repository.js';

type ProductCandidate = Awaited<
  ReturnType<RecommendationRepository['newest']>
>[number];

type RecommendationReason =
  | 'recently_viewed_category'
  | 'similar_category'
  | 'cart_category'
  | 'new_arrival';

@Injectable()
export class RecommendationService {
  constructor(private readonly repository: RecommendationRepository) {}

  private readonly DEFAULT_LIMIT = 10;

  private normalizeLimit(limit?: number): number {
    return Math.min(Math.max(limit ?? this.DEFAULT_LIMIT, 1), 20);
  }

  private format(products: ProductCandidate[], reason: RecommendationReason) {
    return products.map((product) => ({
      productId: product.id.toString(),
      name: product.name,
      categoryId: product.categoryId.toString(),
      source: 'rule_based' as const,
      reason,
    }));
  }

  private async fallback(limit: number, excludeIds: bigint[] = []) {
    const products = await this.repository.newest(limit, excludeIds);

    return this.format(products, 'new_arrival');
  }

  // HOME: Phân tích danh mục từ lịch sử VIEW.
  async home(visitorId: bigint, requestedLimit?: number) {
    const limit = this.normalizeLimit(requestedLimit);

    const views = await this.repository.recentViews(visitorId);

    if (!views.length) {
      return {
        source: 'rule_based' as const,
        strategy: 'new_arrivals',
        items: await this.fallback(limit),
      };
    }

    const categoryCounts = new Map<string, number>();
    const viewedIds = new Set<string>();

    for (const view of views) {
      if (view.productId) {
        viewedIds.add(view.productId.toString());
      }

      const categoryId = view.product?.categoryId;
      if (!categoryId) continue;

      const key = categoryId.toString();

      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    }

    const rankedCategories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => BigInt(id));

    const excludedIds = [...viewedIds].map(BigInt);

    const related = await this.repository.byCategories(
      rankedCategories,
      limit * 5,
      excludedIds,
    );

    const categoryRank = new Map(
      rankedCategories.map((id, index) => [id.toString(), index]),
    );

    related.sort(
      (a, b) =>
        (categoryRank.get(a.categoryId.toString()) ?? 999) -
          (categoryRank.get(b.categoryId.toString()) ?? 999) ||
        Number(b.createdAt) - Number(a.createdAt),
    );

    const selected = related.slice(0, limit);

    const remaining = limit - selected.length;

    const fallbackItems =
      remaining > 0
        ? await this.fallback(remaining, [
            ...excludedIds,
            ...selected.map((product) => product.id),
          ])
        : [];

    return {
      source: 'rule_based' as const,
      strategy: 'view_history',
      items: [
        ...this.format(selected, 'recently_viewed_category'),
        ...fallbackItems,
      ],
    };
  }

  // DETAIL: Gợi ý sản phẩm cùng danh mục.
  async similar(productId: bigint, requestedLimit?: number) {
    const limit = this.normalizeLimit(requestedLimit);

    const product = await this.repository.product(productId);

    if (!product) {
      return {
        source: 'rule_based' as const,
        strategy: 'product_not_found',
        items: [],
      };
    }

    const related = await this.repository.byCategories(
      [product.categoryId],
      limit,
      [product.id],
    );

    const remaining = limit - related.length;

    const fallbackItems =
      remaining > 0
        ? await this.fallback(remaining, [
            product.id,
            ...related.map((item) => item.id),
          ])
        : [];

    return {
      source: 'rule_based' as const,
      strategy: 'similar_category',
      items: [...this.format(related, 'similar_category'), ...fallbackItems],
    };
  }

  // CART: Gợi ý dựa trên danh mục trong giỏ hàng.
  async cart(userId: bigint, requestedLimit?: number) {
    const limit = this.normalizeLimit(requestedLimit);

    const cartProducts = await this.repository.cartProducts(userId);

    if (!cartProducts.length) {
      return {
        source: 'rule_based' as const,
        strategy: 'new_arrivals',
        items: await this.fallback(limit),
      };
    }

    const excludedIds = [
      ...new Set(cartProducts.map((p) => p.id.toString())),
    ].map(BigInt);

    const categoryIds = [
      ...new Set(cartProducts.map((p) => p.categoryId.toString())),
    ].map(BigInt);

    const related = await this.repository.byCategories(
      categoryIds,
      limit,
      excludedIds,
    );

    const remaining = limit - related.length;

    const fallbackItems =
      remaining > 0
        ? await this.fallback(remaining, [
            ...excludedIds,
            ...related.map((item) => item.id),
          ])
        : [];

    return {
      source: 'rule_based' as const,
      strategy: 'cart_category',
      items: [...this.format(related, 'cart_category'), ...fallbackItems],
    };
  }
}
