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
const sessionView = { productId: 496n, categoryId: 1n, sourceItemId: 1496 };

describe('AdaptiveRecommendationService', () => {
  const repo = {
    recentSessionViews: vi.fn(),
    sellableMappedProducts: vi.fn(),
    product: vi.fn(),
    cartProducts: vi.fn(),
  };
  const ai = { recommendSession: vi.fn() };
  const rules = { home: vi.fn(), similar: vi.fn(), cart: vi.fn() };
  let service: AdaptiveRecommendationService;
  beforeEach(() => {
    vi.resetAllMocks();
    repo.recentSessionViews.mockResolvedValue([sessionView]);
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
    ai.recommendSession.mockResolvedValue({
      items: [ranked(2), ranked(3)],
      unknown_recent_itemids: [],
    });
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
      expect(rules.home).toHaveBeenCalledWith(9n, 2, undefined, [sessionView]);
    },
  );
  it('skips AI for empty history', async () => {
    repo.recentSessionViews.mockResolvedValue([]);
    await service.home(9n, 2);
    expect(ai.recommendSession).not.toHaveBeenCalled();
  });
  it('uses the mapped model visitor without session history', async () => {
    repo.recentSessionViews.mockResolvedValue([]);
    await service.home(9n, 2, 1150086);
    expect(ai.recommendSession).toHaveBeenCalledWith({
      retailrocket_visitorid: 1150086,
      recent_itemids: [],
      candidate_itemids: [1001, 1002, 1003],
      limit: 2,
    });
  });
  it('passes session views with the mapped model visitor', async () => {
    await service.home(9n, 2, 1150086);
    expect(ai.recommendSession).toHaveBeenCalledWith(
      expect.objectContaining({
        retailrocket_visitorid: 1150086,
        recent_itemids: [1496],
      }),
    );
  });
  it('tops up insufficient eligible results with distinct rule labels', async () => {
    ai.recommendSession.mockResolvedValue({
      items: [ranked(2), ranked(2), ranked(99), ranked(3, NaN)],
      unknown_recent_itemids: [],
    });
    const result = await service.home(9n, 3);
    expect(result.source).toBe('hybrid');
    expect(result.items.map((item) => [item.productId, item.source])).toEqual([
      ['2', 'lightgcn_session'],
      ['3', 'rule_based'],
      ['4', 'rule_based'],
    ]);
    expect(rules.home).toHaveBeenCalledWith(9n, 2, [2n], [sessionView]);
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
      recent_itemids: [1496],
      context_itemids: [1001],
      candidate_itemids: [1002, 1003],
      limit: 2,
    });
  });
  it('keeps the current detail product once as page context and passes the mapped profile', async () => {
    repo.product.mockResolvedValue({ id: 1n, retailrocketItemId: '1001' });
    repo.recentSessionViews.mockResolvedValue([
      sessionView,
      { productId: 1n, categoryId: 1n, sourceItemId: 1001 },
    ]);
    await service.detail(9n, 1n, 2, 1150086);
    expect(ai.recommendSession).toHaveBeenCalledWith({
      retailrocket_visitorid: 1150086,
      recent_itemids: [1496],
      context_itemids: [1001],
      candidate_itemids: [1002, 1003],
      limit: 2,
    });
  });
  it('unmapped detail still receives DACN-65', async () => {
    repo.recentSessionViews.mockResolvedValue([]);
    repo.product.mockResolvedValue({ id: 79n, retailrocketItemId: null });
    await service.detail(9n, 79n, 2);
    expect(rules.similar).toHaveBeenCalledWith(79n, 2);
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
      recent_itemids: [1496],
      context_itemids: [1001],
      candidate_itemids: [1002, 1003],
      limit: 2,
    });
  });
  it('passes the mapped profile and separates session history from cart context', async () => {
    await service.cart(9n, 7n, 2, 1150086);
    expect(ai.recommendSession).toHaveBeenCalledWith({
      retailrocket_visitorid: 1150086,
      recent_itemids: [1496],
      context_itemids: [1001],
      candidate_itemids: [1002, 1003],
      limit: 2,
    });
  });
  it('cart AI failure falls back using authenticated user ID', async () => {
    ai.recommendSession.mockResolvedValue(null);
    await service.cart(9n, 7n, 2);
    expect(rules.cart).toHaveBeenCalledWith(7n, 2, undefined);
  });

  it('uses cart categories when any cart product cannot be mapped, even with a mapped session history', async () => {
    repo.cartProducts.mockResolvedValue([
      { id: 1n, categoryId: 1n, retailrocketItemId: '1001' },
      { id: 4n, categoryId: 2n, retailrocketItemId: null },
    ]);
    await service.cart(9n, 7n, 2);
    expect(rules.cart).toHaveBeenCalledWith(7n, 2);
    expect(ai.recommendSession).not.toHaveBeenCalled();
    expect(repo.recentSessionViews).not.toHaveBeenCalled();
  });

  it('prioritizes recent unmapped session views through rules instead of discarding them', async () => {
    const view = { productId: 9n, categoryId: 2n, sourceItemId: null };
    repo.recentSessionViews.mockResolvedValue([sessionView, view]);
    await service.home(9n, 2);
    expect(ai.recommendSession).not.toHaveBeenCalled();
    expect(rules.home).toHaveBeenCalledWith(9n, 2, undefined, [
      sessionView,
      view,
    ]);
  });
  it('falls back when model cannot recognize a source item ID', async () => {
    ai.recommendSession.mockResolvedValue({
      items: [ranked(2)],
      unknown_recent_itemids: [1496],
    });
    await service.home(9n, 2);
    expect(rules.home).toHaveBeenCalledWith(9n, 2, undefined, [sessionView]);
  });
});
