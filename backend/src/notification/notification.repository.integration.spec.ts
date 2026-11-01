import { afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationService } from './notification.service.js';
import { NotificationStream } from './notification.stream.js';

const enabled = process.env.RUN_NOTIFICATION_DB_TESTS === '1';

describe.skipIf(!enabled)(
  'Notification persistence PostgreSQL integration',
  () => {
    const prisma = new PrismaService();
    const service = new NotificationService(
      prisma,
      new NotificationRepository(prisma),
      new NotificationStream(),
    );

    afterAll(async () => prisma.$disconnect());

    it('writes the email job and web notification in one transaction', async () => {
      const email = `notification-integration-${crypto.randomUUID()}@example.invalid`;
      await expect(
        prisma.transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              email,
              passwordHash: 'unused-in-integration-test',
              fullName: 'Notification integration',
              role: 'CUSTOMER',
              status: 'ACTIVE',
            },
          });
          const order = await tx.order.create({
            data: {
              userId: user.id,
              subtotal: 1n,
              shippingFee: 0n,
              totalAmount: 1n,
              recipientName: 'Notification integration',
              recipientPhone: '0900000000',
              provinceName: 'Test',
              wardName: 'Test',
              addressLine: 'Rollback-only fixture',
              expiresAt: new Date(Date.now() + 60_000),
            },
          });

          await service.recordOrderChange(
            tx,
            {
              id: order.id,
              userId: user.id,
              status: 'PENDING',
              paymentMethod: 'COD',
              paymentStatus: 'UNPAID',
              totalAmount: order.totalAmount,
              createdAt: order.createdAt,
              items: [],
            },
            1n,
          );

          const [notifications, jobs] = await Promise.all([
            tx.userNotification.count({ where: { userId: user.id } }),
            tx.emailOutbox.count({ where: { userId: user.id } }),
          ]);
          expect(notifications).toBe(1);
          expect(jobs).toBe(1);
          throw new Error('ROLLBACK_NOTIFICATION_FIXTURE');
        }),
      ).rejects.toThrow('ROLLBACK_NOTIFICATION_FIXTURE');

      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });
  },
);
