import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { EngagementRepository } from './engagement.repository.js';
import { EngagementService } from './engagement.service.js';
import { DashboardRepository } from '../../order/dashboard.repository.js';

describe.skipIf(process.env.RUN_ENGAGEMENT_DB_TESTS !== '1')(
  'wishlist and reviews in PostgreSQL',
  () => {
    const prisma = new PrismaService();
    afterAll(async () => prisma.$disconnect());
    it('persists per-account wishlist and moderates reviews in a rolled-back transaction', async () => {
      await expect(
        prisma.transaction(async (tx) => {
          const product = await tx.product.findFirstOrThrow({
            where: { status: 'ACTIVE' },
            select: { id: true },
          });
          const user = await tx.user.create({
            data: {
              email: `engagement-${crypto.randomUUID()}@example.invalid`,
              fullName: 'Test Customer',
              role: 'CUSTOMER',
              status: 'ACTIVE',
            },
          });
          const service = new EngagementService(
            new EngagementRepository(tx as never),
          );
          const actor = {
            userId: user.id.toString(),
            role: 'CUSTOMER',
          } as never;
          const id = product.id.toString();
          await service.addWishlist(actor, id);
          await service.addWishlist(actor, id);
          expect(await service.wishlist(actor)).toEqual({ items: [id] });
          const review = await service.review(actor, id, {
            rating: 4,
            content: ' Useful ',
          });
          expect(
            (await service.reviews(id)).items.some(
              (item) => item.id === review.id,
            ),
          ).toBe(false);
          await service.moderate(review.id, 'APPROVED');
          expect(
            (await service.reviews(id)).items.some(
              (item) => item.id === review.id && item.content === 'Useful',
            ),
          ).toBe(true);
          await service.review(actor, id, { rating: 3, content: 'Updated' });
          expect(
            (await service.reviews(id)).items.some(
              (item) => item.id === review.id,
            ),
          ).toBe(false);
          await service.removeWishlist(actor, id);
          expect(await service.wishlist(actor)).toEqual({ items: [] });
          throw new Error('ROLLBACK_ENGAGEMENT_FIXTURE');
        }),
      ).rejects.toThrow('ROLLBACK_ENGAGEMENT_FIXTURE');
    });
    it('loads dashboard counts and low stock from the local database', async () => {
      const dashboard = await new DashboardRepository(prisma).get(new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'), 5);
      expect(dashboard.created).toBeGreaterThanOrEqual(0);
      expect(dashboard.pending).toBeGreaterThanOrEqual(0);
      expect(dashboard.merchandisePaid).toMatch(/^\d+$/);
      expect(dashboard.lowStock.every((item) => item.available <= 5)).toBe(true);
    });
  },
);
