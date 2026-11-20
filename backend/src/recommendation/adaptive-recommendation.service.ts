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

  async home(visitorId: bigint, requestedLimit = 10) {
    return this.session(visitorId, requestedLimit, [], [], (limit, excluded) =>
      this.ruleBased.home(visitorId, limit, excluded),
    );
  }

  async detail(visitorId: bigint, productId: bigint, limit = 10) {
    const product = await this.repository.product(productId);
    if (!product) return this.ruleBased.similar(productId, limit);
    return this.session(
      visitorId,
      limit,
      [productId],
      product.retailrocketItemId ? [Number(product.retailrocketItemId)] : [],
      (size, excluded) => this.ruleBased.similar(productId, size, excluded),
    );
  }

  async cart(visitorId: bigint, userId: bigint, limit = 10) {
    const products = await this.repository.cartProducts(userId);
    return this.session(
      visitorId,
      limit,
      products.map((p) => p.id),
      products.flatMap((p) =>
        p.retailrocketItemId ? [Number(p.retailrocketItemId)] : [],
      ),
      (size, excluded) => this.ruleBased.cart(userId, size, excluded),
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
    ) => ReturnType<RecommendationService['home']>,
  ) {
    const limit = Math.min(Math.max(requestedLimit, 1), 20);
    const excluded = new Set(excludedProductIds.map(String));
    const history = await this.repository.recentSessionItemIds(visitorId);
    // Nexora visitor IDs never cross the AI boundary; only source item IDs do.
    const recentItemIds = [...history, ...contextItemIds].filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    );
    if (!recentItemIds.length) return fallbackFor(limit);

    // 2. Lấy các ứng viên ACTIVE + còn hàng từ PostgreSQL.
    const candidates = (await this.repository.sellableMappedProducts()).filter(
      (item) => !excluded.has(item.id.toString()),
    );

    if (!candidates.length) {
      return fallbackFor(limit);
    }

    // 3. Chỉ gửi RetailRocket item IDs vào FastAPI.
    const aiResult = await this.ai.recommendSession({
      recent_itemids: recentItemIds,
      candidate_itemids: candidates.map((item) => item.sourceItemId),
      limit,
    });

    if (!aiResult?.items.length) {
      return fallbackFor(limit);
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
        strategy: 'lightgcn_session',
        items: aiItems,
      };
    }

    // 5. Nếu AI không đủ sản phẩm, bổ sung DACN-65.
    const fallback = await fallbackFor(
      limit - aiItems.length,
      aiItems.map((item) => BigInt(item.productId)),
    );

    const fallbackItems = fallback.items
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
