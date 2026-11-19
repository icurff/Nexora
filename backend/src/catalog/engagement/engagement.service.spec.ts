import { describe, expect, it, vi } from 'vitest';
import { EngagementService } from './engagement.service.js';

describe('wishlist and review ownership', () => {
  const actor = { userId: '7', role: 'CUSTOMER' } as never;
  it('uses the authenticated actor for wishlist writes and rejects unavailable products', async () => {
    const repo = {
      activeProduct: vi
        .fn()
        .mockResolvedValueOnce({ id: 42n })
        .mockResolvedValueOnce(null),
      add: vi.fn().mockResolvedValue({}),
    };
    const service = new EngagementService(repo as never);
    await service.addWishlist(actor, '42');
    expect(repo.add).toHaveBeenCalledWith(7n, 42n);
    await expect(service.addWishlist(actor, '43')).rejects.toMatchObject({
      response: { code: 'PRODUCT_NOT_FOUND' },
    });
    expect(repo.add).toHaveBeenCalledTimes(1);
  });
  it('stores a trimmed review for the actor and rejects whitespace', async () => {
    const repo = {
      activeProduct: vi.fn().mockResolvedValue({ id: 42n }),
      review: vi.fn().mockResolvedValue({ id: 9n, status: 'PENDING' }),
    };
    const service = new EngagementService(repo as never);
    await expect(
      service.review(actor, '42', { rating: 5, content: ' Good ' }),
    ).resolves.toEqual({ id: '9', status: 'PENDING' });
    expect(repo.review).toHaveBeenCalledWith(7n, 42n, 5, 'Good');
    await expect(
      service.review(actor, '42', { rating: 5, content: '  ' }),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_CONTENT_REQUIRED' } });
  });
});
