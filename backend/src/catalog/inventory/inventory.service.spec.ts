import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { InventoryAdjustmentDto } from './inventory.dto.js';
import { InventoryService } from './inventory.service.js';
import type { InventoryRepository } from './inventory.repository.js';

const actor = { userId: '42', sessionId: 'session', role: 'ADMIN' as const };
const variant = {
  id: 9n,
  sku: 'NX-SKU-9',
  options: { color: 'Đen', size: 'L' },
  deletedAt: null,
  product: {
    id: 3n,
    name: 'Áo',
    status: 'ACTIVE',
    optionConfig: {
      options: { color: { label: 'Màu sắc' }, size: { label: 'Kích cỡ' } },
    },
    category: { id: 2n, name: 'Thời trang' },
  },
  inventory: {
    variantId: 9n,
    onHand: 8,
    reserved: 2,
    version: 4n,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
  },
};

function setup(onHand = 8, reserved = 2) {
  const tx = {
    inventoryAdjustmentRequest: {
      create: vi.fn(() => Promise.resolve()),
      update: vi.fn(() => Promise.resolve()),
    },
    productVariant: {
      findUnique: vi.fn(() => Promise.resolve({ productId: 3n })),
    },
    inventory: {
      update: vi.fn(({ data }: { data: { onHand: number } }) =>
        Promise.resolve({
          ...variant.inventory,
          onHand: data.onHand,
          version: 5n,
          updatedAt: new Date('2026-11-01T00:01:00Z'),
        }),
      ),
    },
  };
  const locks: string[] = [];
  const repository = {
    lockProduct: vi.fn(() => {
      locks.push('product');
      return Promise.resolve(undefined);
    }),
    lockVariant: vi.fn(() => {
      locks.push('variant');
      return Promise.resolve(undefined);
    }),
    lockInventory: vi.fn(() => {
      locks.push('inventory');
      return Promise.resolve({
        ...variant.inventory,
        onHand,
        reserved,
        version: 4n,
      });
    }),
    variant: vi.fn(() =>
      Promise.resolve({
        ...variant,
        inventory: { ...variant.inventory, onHand, reserved, version: 4n },
      }),
    ),
  };
  const prisma = {
    transaction: vi.fn(<T>(work: (value: typeof tx) => Promise<T>) => work(tx)),
  };
  return {
    service: new InventoryService(
      repository as unknown as InventoryRepository,
      prisma as unknown as PrismaService,
    ),
    tx,
    repository,
    prisma,
    locks,
  };
}

function input(
  overrides: Partial<InventoryAdjustmentDto> = {},
): InventoryAdjustmentDto {
  return {
    idempotencyKey: 'd1b5e7b7-c1a0-45c9-b6f8-188808c81363',
    type: 'RESTOCK',
    quantity: 5,
    reason: 'Nhập lô hàng mới',
    ...overrides,
  };
}

describe('InventoryService.adjust', () => {
  it('updates only the selected SKU in Product → SKU → Inventory lock order', async () => {
    const { service, tx, locks } = setup();
    const result = await service.adjust('9', input(), actor);
    expect(locks).toEqual(['product', 'variant', 'inventory']);
    expect(tx.inventory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { variantId: 9n },
        data: { onHand: 13, version: { increment: 1n } },
      }),
    );
    expect(result).toMatchObject({
      skuId: '9',
      options: { color: 'Đen', size: 'L' },
      optionLabels: { 'Màu sắc': 'Đen', 'Kích cỡ': 'L' },
      onHand: 13,
      reserved: 2,
      available: 11,
      version: '5',
    });
  });

  it('rejects a change below reserved stock without updating inventory', async () => {
    const { service, tx } = setup(8, 6);
    await expect(
      service.adjust('9', input({ type: 'ADJUSTMENT', quantity: -3 }), actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.inventory.update).not.toHaveBeenCalled();
  });

  it('requires a reason before opening a transaction', async () => {
    const { service, prisma } = setup();
    await expect(
      service.adjust('9', input({ reason: '   ' }), actor),
    ).rejects.toMatchObject({
      response: { code: 'INVENTORY_REASON_REQUIRED' },
    });
    expect(prisma.transaction).not.toHaveBeenCalled();
  });

  it('rejects stale stocktake versions and leaves stock untouched', async () => {
    const { service, tx } = setup();
    await expect(
      service.adjust(
        '9',
        input({ type: 'STOCKTAKE', quantity: 10, expectedVersion: '3' }),
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVENTORY_VERSION_CONFLICT' },
    });
    expect(tx.inventory.update).not.toHaveBeenCalled();
  });

  it('returns the stored result for a retry even when PostgreSQL JSONB key order differs', async () => {
    const response = {
      skuId: '9',
      onHand: 13,
      reserved: 2,
      available: 11,
      version: '5',
    };
    const stored = {
      payload: {
        type: 'RESTOCK',
        skuId: '9',
        reason: 'Nhập lô hàng mới',
        quantity: 5,
        expectedVersion: null,
      },
      response,
    };
    const prisma = {
      transaction: vi.fn(() =>
        Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Unique request key', {
            code: 'P2002',
            clientVersion: '7.10.1',
          }),
        ),
      ),
      inventoryAdjustmentRequest: {
        findUnique: vi.fn(() => Promise.resolve(stored)),
      },
    };
    const service = new InventoryService(
      {} as InventoryRepository,
      prisma as unknown as PrismaService,
    );
    await expect(service.adjust('9', input(), actor)).resolves.toEqual(
      response,
    );
    await expect(
      service.adjust('9', input({ quantity: 6 }), actor),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });
});
