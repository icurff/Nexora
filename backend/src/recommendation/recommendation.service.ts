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

  private async rankedCategoryProducts(
    categoryIds: bigint[],
    limit: number,
    excludedIds: bigint[],
  ) {
    const selected: ProductCandidate[] = [];
    for (const categoryId of categoryIds) {
      const remaining = limit - selected.length;
      if (remaining <= 0) break;
      const products = await this.repository.byCategories(
        [categoryId],
        remaining,
        [...excludedIds, ...selected.map((product) => product.id)],
      );
      selected.push(...products);
    }
    return selected;
  }

  // HOME: Phân tích danh mục từ lịch sử VIEW.
  async home(
    visitorId: bigint,
    requestedLimit?: number,
    excludeIds: bigint[] = [],
    sessionViews: Array<{ productId: bigint; categoryId: bigint }> = [],
  ) {
    const limit = this.normalizeLimit(requestedLimit);

    const views = await this.repository.recentViews(visitorId);

    if (!views.length && !sessionViews.length) {
      return {
        source: 'rule_based' as const,
        strategy: 'new_arrivals',
        items: await this.fallback(limit, excludeIds),
      };
    }

    const categoryCounts = new Map<string, number>();
    const viewedIds = new Set<string>(excludeIds.map(String));

    for (const view of views) {
      if (view.productId) {
        viewedIds.add(view.productId.toString());
      }

      const categoryId = view.product?.categoryId;
      if (!categoryId) continue;

      const key = categoryId.toString();

      categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
    }

    const sessionCounts = new Map<string, number>();
    for (const view of sessionViews) {
      viewedIds.add(view.productId.toString());
      const key = view.categoryId.toString();
      sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1);
      if (!categoryCounts.has(key)) categoryCounts.set(key, 0);
    }

    const rankedCategories = [...categoryCounts.entries()]
      .sort(
        (a, b) =>
          (sessionCounts.get(b[0]) ?? 0) - (sessionCounts.get(a[0]) ?? 0) ||
          b[1] - a[1],
      )
      .map(([id]) => BigInt(id));

    const excludedIds = [...viewedIds].map(BigInt);

    const selected = await this.rankedCategoryProducts(
      rankedCategories,
      limit,
      excludedIds,
    );

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
  async similar(
    productId: bigint,
    requestedLimit?: number,
    excludeIds: bigint[] = [],
  ) {
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
      [product.id, ...excludeIds],
    );

    const remaining = limit - related.length;

    const fallbackItems =
      remaining > 0
        ? await this.fallback(remaining, [
            product.id,
            ...excludeIds,
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
  async cart(
    userId: bigint,
    requestedLimit?: number,
    excludeIds: bigint[] = [],
  ) {
    const limit = this.normalizeLimit(requestedLimit);

    const cartProducts = await this.repository.cartProducts(userId);

    if (!cartProducts.length) {
      return {
        source: 'rule_based' as const,
        strategy: 'new_arrivals',
        items: await this.fallback(limit, excludeIds),
      };
    }

    const excludedIds = [
      ...new Set([
        ...excludeIds.map(String),
        ...cartProducts.map((p) => p.id.toString()),
      ]),
    ].map(BigInt);

    const productsByCategory = new Map<string, Set<string>>();
    for (const product of cartProducts) {
      const categoryId = product.categoryId.toString();
      const productIds =
        productsByCategory.get(categoryId) ?? new Set<string>();
      productIds.add(product.id.toString());
      productsByCategory.set(categoryId, productIds);
    }
    const categoryIds = [...productsByCategory.entries()]
      .sort(
        (a, b) =>
          b[1].size - a[1].size || (BigInt(a[0]) < BigInt(b[0]) ? -1 : 1),
      )
      .map(([id]) => BigInt(id));

    const related = await this.rankedCategoryProducts(
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
