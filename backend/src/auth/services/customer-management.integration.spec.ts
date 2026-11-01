import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { SessionRepository } from '../repositories/session.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { CustomerManagementService } from './customer-management.service.js';

const enabled = process.env.RUN_CUSTOMER_MANAGEMENT_DB_TESTS === '1';

describe.skipIf(!enabled)(
  'CustomerManagementService PostgreSQL integration',
  () => {
    const prisma = new PrismaService();
    const service = new CustomerManagementService(
      prisma,
      new UserRepository(prisma),
      new SessionRepository(prisma),
    );
    let userId = '';
    let sessionId = '';
    const actor = { userId: '', sessionId: '', role: 'CUSTOMER' as const };

    beforeAll(async () => {
      await prisma.$connect();
      const user = await prisma.user.create({
        data: {
          email: `customer-management-${crypto.randomUUID()}@example.invalid`,
          passwordHash: 'unused-in-integration-test',
          fullName: 'Customer management integration',
          role: 'CUSTOMER',
          status: 'ACTIVE',
        },
      });
      userId = user.id.toString();
      const session = await prisma.authSession.create({
        data: {
          userId: user.id,
          refreshTokenHash: crypto
            .randomUUID()
            .replaceAll('-', '')
            .padEnd(64, '0')
            .slice(0, 64),
          expiresAt: new Date(Date.now() + 60_000),
          lastUsedAt: new Date(),
        },
      });
      sessionId = session.id.toString();
      actor.userId = userId;
      actor.sessionId = sessionId;
    });

    afterAll(async () => {
      if (userId) {
        await prisma.authSession.deleteMany({
          where: { userId: BigInt(userId) },
        });
        await prisma.user.delete({ where: { id: BigInt(userId) } });
      }
      await prisma.$disconnect();
    });

    it('persists profile changes and locks sessions without restoring them on unlock', async () => {
      await expect(
        service.updateProfile(actor, {
          fullName: 'Updated integration',
          phone: '+841234567890',
        }),
      ).resolves.toMatchObject({
        fullName: 'Updated integration',
        phone: '+841234567890',
      });
      await service.lock(userId, 'Integration lock reason');
      const lockedSession = await prisma.authSession.findUnique({
        where: { id: BigInt(sessionId) },
      });
      expect(lockedSession).toMatchObject({ revokeReason: 'ACCOUNT_LOCKED' });
      await service.unlock(userId);
      const restored = await prisma.authSession.findUnique({
        where: { id: BigInt(sessionId) },
      });
      expect(restored?.revokedAt).not.toBeNull();
      await expect(service.getCustomer(userId)).resolves.toMatchObject({
        status: 'ACTIVE',
        lockReason: null,
      });
    });
  },
);
