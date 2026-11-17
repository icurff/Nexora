import { describe, expect, it, vi } from 'vitest';
import { RecommendationController } from './recommendation.controller.js';
import type { RecommendationService } from './recommendation.service.js';
import type { TrackingIdentityService } from '../tracking/tracking-identity.service.js';
import type { AuthService } from '../auth/auth.service.js';

describe('RecommendationController fallback', () => {
  it('returns unavailable when recommendation service fails', async () => {
    const recommendations = {
      similar: vi.fn().mockRejectedValue(new Error('Database unavailable')),
    };

    const controller = new RecommendationController(
      recommendations as unknown as RecommendationService,
      {} as TrackingIdentityService,
      {} as AuthService,
    );

    const result = await controller.similar('1', { limit: 10 });

    expect(result).toEqual({
      source: 'rule_based',
      strategy: 'unavailable',
      items: [],
    });
  });

  it('preserves 400 for invalid product ID', async () => {
    const controller = new RecommendationController(
      {} as RecommendationService,
      {} as TrackingIdentityService,
      {} as AuthService,
    );

    await expect(
      controller.similar('invalid', { limit: 10 }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});
