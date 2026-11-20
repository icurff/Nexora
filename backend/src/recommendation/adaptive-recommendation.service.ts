import { Injectable } from '@nestjs/common';

import { AiRecommendationClient } from './ai-recommendation.client.js';
import { RecommendationRepository } from './recommendation.repository.js';
import { RecommendationService } from './recommendation.service.js';

@Injectable()
export class AdaptiveRecommendationService {
  constructor(
    private readonly repository: RecommendationRepository,
    private readonly ai: AiRecommendationClient,
    private readonly ruleBased: RecommendationService,
  ) {}

  async home(visitorId: bigint, requestedLimit = 10, modelVisitorId?: number) {
    return this.session(
      visitorId,
      requestedLimit,
      [],
      [],
      (limit, excluded, views) =>
        this.ruleBased.home(visitorId, limit, excluded, views),
      modelVisitorId,
    );
  }

  async detail(
    visitorId: bigint,
    productId: bigint,
    limit = 10,
    modelVisitorId?: number,
  ) {
    const product = await this.repository.product(productId);
    if (!product) return this.ruleBased.similar(productId, limit);
    if (
      !product.retailrocketItemId ||
      !Number.isSafeInteger(Number(product.retailrocketItemId)) ||
      Number(product.retailrocketItemId) <= 0
    )
      return this.ruleBased.similar(productId, limit);
    return this.session(
      visitorId,
      limit,
      [productId],
      product.retailrocketItemId ? [Number(product.retailrocketItemId)] : [],
      (size, excluded) => this.ruleBased.similar(productId, size, excluded),
      modelVisitorId,
      productId,
    );
  }

  async cart(
    visitorId: bigint,
    userId: bigint,
    limit = 10,
    modelVisitorId?: number,
  ) {
    const products = await this.repository.cartProducts(userId);
    // A mapped browsing history must not silently replace unmapped cart context.
    if (
      products.some((product) => {
        const sourceId = Number(product.retailrocketItemId);
        return (
          !product.retailrocketItemId ||
          !Number.isSafeInteger(sourceId) ||
          sourceId <= 0
        );
      })
    ) {
      return this.ruleBased.cart(userId, limit);
    }
    return this.session(
      visitorId,
      limit,
      products.map((p) => p.id),
      products.flatMap((p) =>
        p.retailrocketItemId ? [Number(p.retailrocketItemId)] : [],
      ),
      (size, excluded) => this.ruleBased.cart(userId, size, excluded),
      modelVisitorId,
    );
  }

  private async session(
    visitorId: bigint,
    requestedLimit: number,
    excludedProductIds: bigint[],
    contextItemIds: number[],
    fallbackFor: (
      limit: number,
      excluded?: bigint[],
      sessionViews?: Array<{ productId: bigint; categoryId: bigint }>,
    ) => ReturnType<RecommendationService['home']>,
    modelVisitorId?: number,
    detailProductId?: bigint,
  ) {
    const limit = Math.min(Math.max(requestedLimit, 1), 20);
    const excluded = new Set(excludedProductIds.map(String));
    const history = await this.repository.recentSessionViews(visitorId);
    const fallback = (size: number, excludedIds?: bigint[]) =>
      fallbackFor(size, excludedIds, history);
    if (history.some((view) => view.sourceItemId === null))
      return fallback(limit);
    // Nexora visitor IDs never cross the AI boundary; only source item IDs do.
    const recentItemIds = history
      .filter((view) => view.productId !== detailProductId)
      .map((view) => view.sourceItemId)
      .filter(
        (id): id is number =>
          typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
      );
    if (!recentItemIds.length && !contextItemIds.length && !modelVisitorId)
      return fallback(limit);

    // 2. Lấy các ứng viên ACTIVE + còn hàng từ PostgreSQL.
    const candidates = (await this.repository.sellableMappedProducts()).filter(
      (item) => !excluded.has(item.id.toString()),
    );

    if (!candidates.length) {
      return fallback(limit);
    }

    // 3. Chỉ gửi RetailRocket item IDs vào FastAPI.
    const aiResult = await this.ai.recommendSession({
      ...(modelVisitorId ? { retailrocket_visitorid: modelVisitorId } : {}),
      recent_itemids: recentItemIds,
      ...(contextItemIds.length
        ? { context_itemids: [...new Set(contextItemIds)] }
        : {}),
      candidate_itemids: candidates.map((item) => item.sourceItemId),
      limit,
    });

    if (!aiResult?.items.length || aiResult.unknown_recent_itemids.length) {
      return fallback(limit);
    }

    // 4. Ánh xạ kết quả AI trở lại Product ID của Nexora.
    const candidateMap = new Map(
      candidates.map((item) => [item.sourceItemId, item]),
    );

    // Kiểm tra lại tồn kho sau khi AI inference.
    const stillSellable = new Set(
      (await this.repository.sellableMappedProducts()).map((item) =>
        item.id.toString(),
      ),
    );

    const usedIds = new Set<string>();

    const aiItems = aiResult.items
      .flatMap((item) => {
        const product = candidateMap.get(item.retailrocket_itemid);

        if (
          usedIds.size >= limit ||
          !product ||
          !Number.isFinite(item.score) ||
          !stillSellable.has(product.id.toString()) ||
          usedIds.has(product.id.toString())
        ) {
          return [];
        }

        usedIds.add(product.id.toString());

        return [
          {
            productId: product.id.toString(),
            name: product.name,
            categoryId: product.categoryId.toString(),
            source: 'lightgcn_session' as const,
            reason: item.reason_code,
            score: item.score,
            evidence: item.evidence,
          },
        ];
      })
      .slice(0, limit);

    if (aiItems.length === limit) {
      return {
        source: 'lightgcn_session' as const,
        strategy: aiResult.strategy,
        items: aiItems,
      };
    }

    // 5. Nếu AI không đủ sản phẩm, bổ sung DACN-65.
    const fallbackResult = await fallback(
      limit - aiItems.length,
      aiItems.map((item) => BigInt(item.productId)),
    );

    const fallbackItems = fallbackResult.items
      .filter((item) => !usedIds.has(item.productId))
      .slice(0, limit - aiItems.length);

    if (!aiItems.length) {
      return {
        source: 'rule_based' as const,
        strategy: 'ai_fallback',
        items: fallbackItems,
      };
    }

    return {
      source: fallbackItems.length
        ? ('hybrid' as const)
        : ('lightgcn_session' as const),
      strategy: fallbackItems.length
        ? 'ai_with_rule_fallback'
        : 'lightgcn_session',
      items: [...aiItems, ...fallbackItems],
    };
  }
}
