import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiRecommendationClient } from './ai-recommendation.client.js';

describe('AI session page context compatibility', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects an older AI service that silently ignores page context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          source: 'lightgcn_session',
          items: [],
          unknown_recent_itemids: [],
        }),
      }),
    );
    const result = await new AiRecommendationClient().recommendSession({
      recent_itemids: [1],
      context_itemids: [2],
      candidate_itemids: [3],
      limit: 1,
    });
    expect(result).toBeNull();
  });

  it('accepts a service that confirms support for page context', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          source: 'lightgcn_session',
          context_supported: true,
          items: [],
          unknown_recent_itemids: [],
        }),
      }),
    );
    const result = await new AiRecommendationClient().recommendSession({
      recent_itemids: [1],
      context_itemids: [2],
      candidate_itemids: [3],
      limit: 1,
    });
    expect(result?.context_supported).toBe(true);
  });
});
