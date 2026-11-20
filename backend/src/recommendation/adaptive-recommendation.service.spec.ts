import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdaptiveRecommendationService } from './adaptive-recommendation.service.js';
import type { RecommendationRepository } from './recommendation.repository.js';
import type { AiRecommendationClient } from './ai-recommendation.client.js';
import type { RecommendationService } from './recommendation.service.js';

const candidate = (id: number) => ({
  id: BigInt(id),
  name: `P${id}`,
  categoryId: 1n,
  sourceItemId: 1000 + id,
});
const ruleItem = (id: number) => ({
  productId: String(id),
  source: 'rule_based',
  reason: 'new_arrival',
});
const ranked = (id: number, score = 0.8) => ({
  retailrocket_itemid: 1000 + id,
  score,
  reason_code: 'SIMILAR_TO_RECENT_VIEW',
  evidence: {},
});

describe('AdaptiveRecommendationService', () => {
  const repo = {
    recentSessionItemIds: vi.fn(),
    sellableMappedProducts: vi.fn(),
    product: vi.fn(),
    cartProducts: vi.fn(),
  };
  const ai = { recommendSession: vi.fn() };
  const rules = { home: vi.fn(), similar: vi.fn(), cart: vi.fn() };
  let service: AdaptiveRecommendationService;
  beforeEach(() => {
    vi.resetAllMocks();
    repo.recentSessionItemIds.mockResolvedValue([1496]);
    repo.sellableMappedProducts.mockResolvedValue([
      candidate(1),
      candidate(2),
      candidate(3),
    ]);
    repo.product.mockResolvedValue({
      id: 496n,
      categoryId: 1n,
      retailrocketItemId: '1496',
    });
    repo.cartProducts.mockResolvedValue([
      { id: 1n, categoryId: 1n, retailrocketItemId: '1001' },
    ]);
    ai.recommendSession.mockResolvedValue({ items: [ranked(2), ranked(3)] });
    for (const mock of Object.values(rules))
      mock.mockResolvedValue({
        source: 'rule_based',
        strategy: 'new_arrivals',
        items: [ruleItem(2), ruleItem(3), ruleItem(4)],
      });
    service = new AdaptiveRecommendationService(
      repo as unknown as RecommendationRepository,
      ai as unknown as AiRecommendationClient,
      rules as unknown as RecommendationService,
    );
  });
  it.each([null, { items: [] }])(
    'falls back for unavailable or empty AI: %j',
    async (response) => {
      ai.recommendSession.mockResolvedValue(response);
      expect((await service.home(9n, 2)).source).toBe('rule_based');
      expect(rules.home).toHaveBeenCalledWith(9n, 2, undefined);
    },
  );
  it('skips AI for empty history', async () => {
    repo.recentSessionItemIds.mockResolvedValue([]);
    await service.home(9n, 2);
    expect(ai.recommendSession).not.toHaveBeenCalled();
  });
  it('tops up insufficient eligible results with distinct rule labels', async () => {
    ai.recommendSession.mockResolvedValue({
      items: [ranked(2), ranked(2), ranked(99), ranked(3, NaN)],
    });
    const result = await service.home(9n, 3);
    expect(result.source).toBe('hybrid');
    expect(result.items.map((item) => [item.productId, item.source])).toEqual([
      ['2', 'lightgcn_session'],
      ['3', 'rule_based'],
      ['4', 'rule_based'],
    ]);
    expect(rules.home).toHaveBeenCalledWith(9n, 2, [2n]);
  });
  it('rechecks stock after inference', async () => {
    repo.sellableMappedProducts
      .mockResolvedValueOnce([candidate(2), candidate(3)])
      .mockResolvedValueOnce([candidate(3)]);
    rules.home.mockResolvedValue({ source: 'rule_based', items: [] });
    expect(
      (await service.home(9n, 2)).items.map((item) => item.productId),
    ).toEqual(['3']);
  });
  it('detail sends item IDs rather than Nexora visitor ID and excludes current product', async () => {
    repo.product.mockResolvedValue({ id: 1n, retailrocketItemId: '1001' });
    await service.detail(9000000000n, 1n, 2);
    expect(ai.recommendSession).toHaveBeenCalledWith({
      recent_itemids: [1496, 1001],
      candidate_itemids: [1002, 1003],
      limit: 2,
    });
  });
  it('unmapped detail still receives DACN-65', async () => {
    repo.recentSessionItemIds.mockResolvedValue([]);
    repo.product.mockResolvedValue({ id: 79n, retailrocketItemId: null });
    await service.detail(9n, 79n, 2);
    expect(rules.similar).toHaveBeenCalledWith(79n, 2, undefined);
    expect(ai.recommendSession).not.toHaveBeenCalled();
  });
  it('missing detail product returns empty', async () => {
    repo.product.mockResolvedValue(null);
    rules.similar.mockResolvedValue({ source: 'rule_based', items: [] });
    expect((await service.detail(9n, 999n, 2)).items).toEqual([]);
    expect(ai.recommendSession).not.toHaveBeenCalled();
  });
  it('cart excludes cart items and uses source IDs for context', async () => {
    await service.cart(9n, 7n, 2);
    expect(ai.recommendSession).toHaveBeenCalledWith({
      recent_itemids: [1496, 1001],
      candidate_itemids: [1002, 1003],
      limit: 2,
    });
  });
  it('cart AI failure falls back using authenticated user ID', async () => {
    ai.recommendSession.mockResolvedValue(null);
    await service.cart(9n, 7n, 2);
    expect(rules.cart).toHaveBeenCalledWith(7n, 2, undefined);
  });
});
