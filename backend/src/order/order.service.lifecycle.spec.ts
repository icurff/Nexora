import { describe, expect, it, vi } from 'vitest';
import { CodPaymentService } from '../payment/cod-payment.service.js';
import { OrderService } from './order.service.js';

function fixture() {
  const now = new Date('2026-11-02T03:00:00.000Z');
  type HistoryEntry = {
    id: bigint;
    fromStatus: string;
    toStatus: string;
    reason: string | null;
    actor: { fullName: string; role: string };
    createdAt: Date;
  };
  const order = {
    id: 21n,
    userId: 7n,
    status: 'CONFIRMED',
    paymentMethod: 'COD',
    paymentStatus: 'UNPAID',
    subtotal: 100_000n,
    shippingFee: 30_000n,
    totalAmount: 130_000n,
    recipientName: 'Customer',
    recipientPhone: '0123456789',
    provinceName: 'Province',
    wardName: 'Ward',
    addressLine: 'Address',
    customerNote: null,
    expiresAt: new Date('2026-11-03T03:00:00.000Z'),
    version: 4n,
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
    firstShippedAt: null as Date | null,
    deliveredAt: null as Date | null,
    paidAt: null as Date | null,
    cancelledAt: null as Date | null,
    returnedAt: null as Date | null,
    cancelReason: null as string | null,
    items: [
      {
        id: 31n,
        productId: 41n,
        variantId: 51n,
        productName: 'Tee',
        sku: 'TEE-M',
        options: {},
        imageUrl: null,
        unitPrice: 100_000n,
        quantity: 2,
      },
    ],
    history: [] as HistoryEntry[],
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ now }]),
    order: {
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(order, data);
        return Promise.resolve(order);
      }),
    },
  };
  const orders = {
    idempotency: vi.fn().mockResolvedValue(null),
    reserveIdempotency: vi.fn().mockResolvedValue(undefined),
    completeIdempotency: vi.fn().mockResolvedValue(undefined),
    lockOrder: vi.fn().mockResolvedValue(true),
    findOrder: vi.fn().mockImplementation(() => Promise.resolve(order)),
    updateLifecycle: vi.fn((_id: bigint, data: Record<string, unknown>) => {
      const changes = { ...data };
      delete changes.version;
      Object.assign(order, changes);
      order.version += 1n;
      return Promise.resolve(order);
    }),
    history: vi.fn(
      (
        _id: bigint,
        _actor: bigint | null,
        fromStatus: string,
        toStatus: string,
        reason: string | null,
      ) => {
        const entry = {
          id: BigInt(order.history.length + 1),
          fromStatus,
          toStatus,
          reason,
          actor: { fullName: 'Admin', role: 'ADMIN' },
          createdAt: now,
        };
        order.history.push(entry);
        return Promise.resolve(entry);
      },
    ),
  };
  const catalog = {
    dispatchOrder: vi.fn().mockResolvedValue(undefined),
    receiveReturnedOrder: vi.fn().mockResolvedValue(undefined),
  };
  const notifications = {
    recordOrderChange: vi.fn().mockResolvedValue(undefined),
    publishChanged: vi.fn(),
  };
  const prisma = {
    transaction: vi.fn((work: (transaction: unknown) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const service = new OrderService(
    prisma as never,
    orders as never,
    catalog as never,
    {} as never,
    notifications as never,
    new CodPaymentService(),
  );
  return { service, order, orders, catalog, notifications, tx, now };
}

const admin = { userId: '9', sessionId: '1', role: 'ADMIN' as const };
const request = (version: number, extra = {}) => ({
  idempotencyKey: crypto.randomUUID(),
  expectedVersion: String(version),
  ...extra,
});

describe('OrderService COD lifecycle', () => {
  it('dispatches once, preserves stock on redelivery, and returns stock once', async () => {
    const { service, order, catalog, notifications } = fixture();
    const shipped = await service.lifecycle(admin, '21', 'SHIP', request(4));
    expect(shipped.status).toBe('SHIPPING');
    expect(order.firstShippedAt).toEqual(new Date('2026-11-02T03:00:00.000Z'));
    expect(catalog.dispatchOrder).toHaveBeenCalledTimes(1);

    await service.lifecycle(
      admin,
      '21',
      'DELIVERY_FAIL',
      request(5, { reason: 'Không liên lạc được' }),
    );
    await service.lifecycle(admin, '21', 'RETRY_DELIVERY', request(6));
    expect(catalog.dispatchOrder).toHaveBeenCalledTimes(1);

    await service.lifecycle(
      admin,
      '21',
      'DELIVERY_FAIL',
      request(7, { reason: 'Khách hẹn lại' }),
    );
    const returned = await service.lifecycle(
      admin,
      '21',
      'RECEIVE_RETURN',
      request(8, { allItemsReceived: true }),
    );
    expect(returned.status).toBe('CANCELLED');
    expect(returned.paymentStatus).toBe('UNPAID');
    expect(order.cancelledAt).toEqual(order.returnedAt);
    expect(catalog.receiveReturnedOrder).toHaveBeenCalledTimes(1);
    expect(notifications.recordOrderChange).toHaveBeenCalledTimes(5);
  });

  it('marks COD paid only on confirmed delivery and requires payment confirmation', async () => {
    const { service, order } = fixture();
    await service.lifecycle(admin, '21', 'SHIP', request(4));
    await expect(
      service.lifecycle(admin, '21', 'DELIVER', request(5)),
    ).rejects.toMatchObject({
      response: { code: 'COD_COLLECTION_CONFIRMATION_REQUIRED' },
    });
    const delivered = await service.lifecycle(
      admin,
      '21',
      'DELIVER',
      request(5, { codCollected: true }),
    );
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.paymentStatus).toBe('PAID');
    expect(order.paidAt).toEqual(order.deliveredAt);
  });
});
