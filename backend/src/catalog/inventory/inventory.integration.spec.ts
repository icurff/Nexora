import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service.js';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';

const runDatabaseTests = process.env.RUN_INVENTORY_DB_TESTS === '1';
const actor = {
  userId: '',
  sessionId: 'inventory-integration',
  role: 'ADMIN' as const,
};

describe.skipIf(!runDatabaseTests)(
  'InventoryService PostgreSQL integration',
  () => {
    const prisma = new PrismaService();
    const repository = new InventoryRepository(prisma);
    const service = new InventoryService(repository, prisma);
    const variantIds: bigint[] = [];
    const idempotencyKeys: string[] = [];
    let productId: bigint | undefined;
    let actorId: bigint;

    beforeAll(async () => {
      await prisma.$connect();
      const [category, user] = await Promise.all([
        prisma.category.findFirst({ select: { id: true } }),
        prisma.user.findFirst({ select: { id: true } }),
      ]);
      if (!category || !user)
        throw new Error(
          'Integration test requires an existing category and user.',
        );
      actor.userId = user.id.toString();
      actorId = user.id;
      const suffix = crypto.randomUUID();
      const product = await prisma.product.create({
        data: {
          name: `Inventory integration ${suffix}`,
          nameKey: `inventory-integration-${suffix}`,
          description: 'Temporary inventory integration test product.',
          categoryId: category.id,
          status: 'ACTIVE',
          optionConfig: {
            options: {
              color: { label: 'Màu sắc' },
              size: { label: 'Kích cỡ' },
            },
          },
        },
      });
      productId = product.id;
      for (const [sku, options, onHand, reserved] of [
        [`SKU-INT-${suffix.slice(0, 8)}-L`, { color: 'Đen', size: 'L' }, 10, 2],
        [`SKU-INT-${suffix.slice(0, 8)}-M`, { color: 'Đen', size: 'M' }, 5, 1],
      ] as const) {
        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            options,
            priceVnd: 100_000n,
            inventory: { create: { onHand, reserved } },
          },
        });
        variantIds.push(variant.id);
      }
    }, 30_000);

    afterAll(async () => {
      if (variantIds.length) {
        await prisma.inventoryLedger.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        await prisma.inventory.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        await prisma.productVariant.deleteMany({
          where: { id: { in: variantIds } },
        });
      }
      if (productId) await prisma.product.delete({ where: { id: productId } });
      if (idempotencyKeys.length && actorId!) {
        await prisma.inventoryAdjustmentRequest.deleteMany({
          where: { actorUserId: actorId, key: { in: idempotencyKeys } },
        });
      }
      await prisma.$disconnect();
    }, 30_000);

    it('isolates color/size SKU stock and serializes concurrent adjustments without duplication or negative stock', async () => {
      const [blackL, blackM] = variantIds;
      const firstKey = crypto.randomUUID();
      const secondKey = crypto.randomUUID();
      idempotencyKeys.push(firstKey, secondKey);
      const [afterL, afterM] = await Promise.all([
        service.adjust(
          blackL.toString(),
          {
            idempotencyKey: firstKey,
            type: 'RESTOCK',
            quantity: 3,
            reason: 'Kiểm thử nhập L',
          },
          actor,
        ),
        service.adjust(
          blackM.toString(),
          {
            idempotencyKey: secondKey,
            type: 'RESTOCK',
            quantity: 4,
            reason: 'Kiểm thử nhập M',
          },
          actor,
        ),
      ]);
      expect(afterL).toMatchObject({
        onHand: 13,
        reserved: 2,
        available: 11,
        optionLabels: { 'Màu sắc': 'Đen', 'Kích cỡ': 'L' },
      });
      expect(afterM).toMatchObject({
        onHand: 9,
        reserved: 1,
        available: 8,
        optionLabels: { 'Màu sắc': 'Đen', 'Kích cỡ': 'M' },
      });

      const retryKey = crypto.randomUUID();
      idempotencyKeys.push(retryKey);
      const duplicate = {
        idempotencyKey: retryKey,
        type: 'RESTOCK' as const,
        quantity: 2,
        reason: 'Retry nguyên tử',
      };
      const retries = await Promise.all([
        service.adjust(blackL.toString(), duplicate, actor),
        service.adjust(blackL.toString(), duplicate, actor),
      ]);
      expect(retries[0]).toEqual(retries[1]);
      expect(
        (
          await prisma.inventory.findUniqueOrThrow({
            where: { variantId: blackL },
          })
        ).onHand,
      ).toBe(15);
      expect(
        await prisma.inventoryLedger.count({
          where: { variantId: blackL, reason: 'Retry nguyên tử' },
        }),
      ).toBe(1);

      const lowKeys = [crypto.randomUUID(), crypto.randomUUID()];
      idempotencyKeys.push(...lowKeys);
      const concurrentReductions = await Promise.allSettled([
        service.adjust(
          blackM.toString(),
          {
            idempotencyKey: lowKeys[0],
            type: 'ADJUSTMENT',
            quantity: -8,
            reason: 'Kiểm thử giảm kho A',
          },
          actor,
        ),
        service.adjust(
          blackM.toString(),
          {
            idempotencyKey: lowKeys[1],
            type: 'ADJUSTMENT',
            quantity: -8,
            reason: 'Kiểm thử giảm kho B',
          },
          actor,
        ),
      ]);
      expect(
        concurrentReductions.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        concurrentReductions.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(
        await prisma.inventory.findUniqueOrThrow({
          where: { variantId: blackM },
        }),
      ).toMatchObject({ onHand: 1, reserved: 1 });

      const stocktakeKey = crypto.randomUUID();
      idempotencyKeys.push(stocktakeKey);
      await expect(
        service.adjust(
          blackL.toString(),
          {
            idempotencyKey: stocktakeKey,
            type: 'STOCKTAKE',
            quantity: 20,
            expectedVersion: '0',
            reason: 'Version cũ',
          },
          actor,
        ),
      ).rejects.toMatchObject({
        response: { code: 'INVENTORY_VERSION_CONFLICT' },
      });
    }, 30_000);
  },
);
