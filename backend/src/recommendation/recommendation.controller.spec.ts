import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => vi.unstubAllEnvs());
  function setup(
    authenticated = false,
    actor = { userId: '7', role: 'ADMIN' },
  ) {
    const adaptive = {
      home: vi
        .fn()
        .mockResolvedValue({ source: 'lightgcn_session', items: [] }),
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
          .mockResolvedValue(authenticated ? actor : undefined),
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
  it('only maps the explicitly configured authenticated admin', async () => {
    vi.stubEnv('DEMO_RECOMMENDATION_USER_ID', '7');
    vi.stubEnv('DEMO_RECOMMENDATION_VISITOR_ID', '1150086');
    const admin = setup(true);
    await admin.controller.home({ limit: 8 }, admin.req, admin.res);
    expect(admin.adaptive.home).toHaveBeenCalledWith(9n, 8, 1150086);
    await admin.controller.productSession(
      '496',
      { limit: 8 },
      admin.req,
      admin.res,
    );
    expect(admin.adaptive.detail).toHaveBeenCalledWith(9n, 496n, 8, 1150086);
    await admin.controller.cartSession({ limit: 8 }, admin.req, admin.res);
    expect(admin.adaptive.cart).toHaveBeenCalledWith(9n, 7n, 8, 1150086);
    const guest = setup();
    await guest.controller.home({ limit: 8 }, guest.req, guest.res);
    expect(guest.adaptive.home).toHaveBeenCalledWith(9n, 8, undefined);
    const customer = setup(true, { userId: '7', role: 'CUSTOMER' });
    await customer.controller.productSession(
      '496',
      { limit: 8 },
      customer.req,
      customer.res,
    );
    expect(customer.adaptive.detail).toHaveBeenCalledWith(
      9n,
      496n,
      8,
      undefined,
    );
    const otherAdmin = setup(true, { userId: '8', role: 'ADMIN' });
    await otherAdmin.controller.cartSession(
      { limit: 8 },
      otherAdmin.req,
      otherAdmin.res,
    );
    expect(otherAdmin.adaptive.cart).toHaveBeenCalledWith(9n, 8n, 8, undefined);
  });
  it('detail resolves Nexora visitor identity and preserves decimal product IDs', async () => {
    const { controller, adaptive, req, res, setHeader } = setup();
    await controller.productSession('496', { limit: 8 }, req, res);
    expect(adaptive.detail).toHaveBeenCalledWith(9n, 496n, 8, undefined);
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
    expect(adaptive.cart).toHaveBeenCalledWith(9n, 7n, 8, undefined);
  });
  it('session failures do not break the product page', async () => {
    const { controller, adaptive, req, res } = setup();
    adaptive.detail.mockRejectedValue(new Error('Unavailable'));
    expect(
      await controller.productSession('496', { limit: 8 }, req, res),
    ).toEqual({ source: 'rule_based', strategy: 'unavailable', items: [] });
  });
});
