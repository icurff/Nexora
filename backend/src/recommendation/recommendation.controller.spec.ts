import { describe, expect, it, vi } from 'vitest';
import { RecommendationController } from './recommendation.controller.js';
import type { RecommendationService } from './recommendation.service.js';
import type { TrackingIdentityService } from '../tracking/tracking-identity.service.js';
import type { AuthService } from '../auth/auth.service.js';
import type { AiRecommendationClient } from './ai-recommendation.client.js';
import type { AdaptiveRecommendationService } from './adaptive-recommendation.service.js';

describe('RecommendationController fallback', () => {
  it('returns unavailable when recommendation service fails', async () => {
    const recommendations = {
      similar: vi.fn().mockRejectedValue(new Error('Database unavailable')),
    };

    const controller = new RecommendationController(
      recommendations as unknown as RecommendationService,
      {} as TrackingIdentityService,
      {} as AuthService,
      {
        health: vi.fn().mockResolvedValue(true),
      } as unknown as AiRecommendationClient,
      {} as AdaptiveRecommendationService,
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
      {
        health: vi.fn().mockResolvedValue(true),
      } as unknown as AiRecommendationClient,
      {} as AdaptiveRecommendationService,
    );

    await expect(
      controller.similar('invalid', { limit: 10 }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('Contextual session routes', () => {
  function setup(authenticated = false) {
    const adaptive = {
      detail: vi
        .fn()
        .mockResolvedValue({ source: 'lightgcn_session', items: [] }),
      cart: vi.fn().mockResolvedValue({ source: 'rule_based', items: [] }),
    };
    const identity = {
      resolve: vi
        .fn()
        .mockResolvedValue({ visitorId: 9n, visitorToken: 'visitor-token' }),
      visitorCookie: vi.fn().mockReturnValue('visitor-cookie'),
    };
    const controller = new RecommendationController(
      {} as RecommendationService,
      identity as unknown as TrackingIdentityService,
      {
        authenticate: vi
          .fn()
          .mockResolvedValue(authenticated ? { userId: '7' } : undefined),
      } as unknown as AuthService,
      {} as AiRecommendationClient,
      adaptive as unknown as AdaptiveRecommendationService,
    );
    const req = {
      headers: authenticated ? { authorization: 'Bearer test' } : {},
    } as import('express').Request;
    const setHeader = vi.fn();
    const res = { setHeader } as unknown as import('express').Response;
    return { controller, adaptive, identity, req, res, setHeader };
  }
  it('detail resolves Nexora visitor identity and preserves decimal product IDs', async () => {
    const { controller, adaptive, req, res, setHeader } = setup();
    await controller.productSession('496', { limit: 8 }, req, res);
    expect(adaptive.detail).toHaveBeenCalledWith(9n, 496n, 8);
    expect(setHeader).toHaveBeenCalledWith('Set-Cookie', 'visitor-cookie');
  });
  it('cart rejects guests before reading cart or resolving visitor', async () => {
    const { controller, adaptive, identity, req, res } = setup();
    await expect(
      controller.cartSession({ limit: 8 }, req, res),
    ).rejects.toMatchObject({ status: 401 });
    expect(adaptive.cart).not.toHaveBeenCalled();
    expect(identity.resolve).not.toHaveBeenCalled();
  });
  it('cart uses authenticated account and separate Nexora visitor', async () => {
    const { controller, adaptive, req, res } = setup(true);
    await controller.cartSession({ limit: 8 }, req, res);
    expect(adaptive.cart).toHaveBeenCalledWith(9n, 7n, 8);
  });
  it('session failures do not break the product page', async () => {
    const { controller, adaptive, req, res } = setup();
    adaptive.detail.mockRejectedValue(new Error('Unavailable'));
    expect(
      await controller.productSession('496', { limit: 8 }, req, res),
    ).toEqual({ source: 'rule_based', strategy: 'unavailable', items: [] });
  });
});
