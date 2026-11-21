import { describe, expect, it, vi } from 'vitest';
import { RecommendationRepository } from './recommendation.repository.js';
import type { PrismaService } from '../database/prisma.service.js';

describe('recent session recommendation context', () => {
  it('keeps unmapped views among the latest three and excludes older views', async () => {
    const now = Date.now();
    const view = (id: number, source: string | null, age: number) => ({
      eventType: 'view',
      productId: BigInt(id),
      trackingSessionId: 1n,
      occurredAt: new Date(now - age),
      product: { categoryId: BigInt(id), retailrocketItemId: source },
    });
    const findMany = vi
      .fn()
      .mockResolvedValue([
        view(4, null, 1000),
        view(3, '103', 2000),
        view(2, '102', 3000),
        view(1, '101', 4000),
      ]);
    const repo = new RecommendationRepository({
      interactionEvent: { findMany },
    } as unknown as PrismaService);
    expect(await repo.recentSessionViews(7n)).toEqual([
      { productId: 2n, categoryId: 2n, sourceItemId: 102 },
      { productId: 3n, categoryId: 3n, sourceItemId: 103 },
      { productId: 4n, categoryId: 4n, sourceItemId: null },
    ]);
  });
});
