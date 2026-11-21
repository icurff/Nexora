import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecommendationGraphStore } from './recommendation-graph.store.js';
const response = {
  source: 'hybrid',
  items: [
    {
      productId: '2',
      name: 'AI item',
      source: 'lightgcn_session',
      reason: 'SIMILAR_TO_RECENT_VIEW',
      score: 1.5,
    },
    {
      productId: '3',
      name: 'Rule item',
      source: 'rule_based',
      reason: 'new_arrival',
    },
  ],
};
describe('RecommendationGraphStore', () => {
  afterEach(() => vi.useRealTimers());
  it('preserves actual mixed item sources, scores and context without mutating the commerce response', () => {
    const store = new RecommendationGraphStore();
    const before = JSON.stringify(response);
    store.record(10n, 'detail', response, '496');
    const result = store.read(10n, new Date(0));
    expect(result?.surface).toBe('detail');
    expect(result?.contextProductId).toBe('496');
    expect(result?.items.map((n) => n.source)).toEqual([
      'lightgcn_session',
      'rule_based',
    ]);
    expect(result?.items[0].score).toBe(1.5);
    expect(result?.items[1].score).toBeUndefined();
    expect(JSON.stringify(response)).toBe(before);
    expect(store.read(11n, new Date(0))).toBeUndefined();
  });
  it('respects the display window and expires without extending lifetime on reads', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    const store = new RecommendationGraphStore();
    store.record(1n, 'home', response);
    expect(store.read(1n, new Date())).toBeUndefined();
    expect(store.read(1n, new Date(0))).toBeDefined();
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(store.read(1n, new Date(0))).toBeUndefined();
  });
  it('an empty actual response clears old suggestions and changes the snapshot identity', () => {
    const store = new RecommendationGraphStore();
    store.record(1n, 'detail', response);
    const first = store.read(1n, new Date(0))?.id;
    store.record(1n, 'detail', {
      source: 'rule_based',
      strategy: 'unavailable',
      items: [],
    });
    const next = store.read(1n, new Date(0));
    expect(next?.items).toEqual([]);
    expect(next?.id).not.toBe(first);
  });
  it('rejects unsupported source claims, duplicate IDs and non-finite scores', () => {
    const store = new RecommendationGraphStore();
    store.record(1n, 'cart', {
      items: [
        ...response.items,
        ...response.items,
        { productId: '4', name: 'fake', source: 'unknown', reason: 'x' },
        {
          productId: '5',
          name: 'bad score',
          source: 'lightgcn_session',
          reason: 'x',
          score: Infinity,
        },
      ],
    });
    expect(store.read(1n, new Date(0))?.items).toHaveLength(3);
    expect(store.read(1n, new Date(0))?.items[2].score).toBeUndefined();
  });
  it('bounds cached sessions and preserves separate identities', () => {
    const store = new RecommendationGraphStore();
    for (let i = 0; i <= 500; i++) store.record(BigInt(i), 'home', response);
    expect(store.read(0n, new Date(0))).toBeUndefined();
    expect(store.read(500n, new Date(0))?.items).toHaveLength(2);
  });
});
