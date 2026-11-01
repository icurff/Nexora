import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service.js';

describe('NotificationService', () => {
  it('records the email and web notice against the same history event', async () => {
    type RecordedInput = {
      userId: bigint;
      orderId: bigint;
      eventKey: string;
      email: string;
      type: string;
      payload: {
        orderId: string;
        status: string;
        totalAmount: string;
        items: Array<{
          productName: string;
          sku: string | null;
          quantity: number;
          unitPrice: string;
        }>;
      };
    };
    const recorded: RecordedInput[] = [];
    const repository = {
      createForOrder: vi.fn((input: RecordedInput) => {
        recorded.push(input);
        return Promise.resolve([]);
      }),
    };
    const service = new NotificationService(
      {} as never,
      repository as never,
      { publish: vi.fn() } as never,
    );
    const tx = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ email: 'customer@example.test' }),
      },
    };

    await service.recordOrderChange(
      tx as never,
      {
        id: 42n,
        userId: 7n,
        status: 'PENDING',
        paymentMethod: 'COD',
        paymentStatus: 'UNPAID',
        totalAmount: 85000n,
        createdAt: new Date('2026-11-02T00:00:00Z'),
        items: [
          {
            productName: 'Sample shirt',
            sku: 'SHIRT-1',
            quantity: 2,
            unitPrice: 27500n,
          },
        ],
      },
      101n,
    );

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.userId).toBe(7n);
    expect(recorded[0]?.orderId).toBe(42n);
    expect(recorded[0]?.eventKey).toBe('order-history:101');
    expect(recorded[0]?.email).toBe('customer@example.test');
    expect(recorded[0]?.type).toBe('ORDER_CREATED');
    expect(recorded[0]?.payload).toEqual({
      orderId: '42',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      totalAmount: '85000',
      createdAt: '2026-11-02T00:00:00.000Z',
      reason: null,
      items: [
        {
          productName: 'Sample shirt',
          sku: 'SHIRT-1',
          quantity: 2,
          unitPrice: '27500',
        },
      ],
    });
  });

  it('does not queue a non-COD order update in this release', async () => {
    const createForOrder = vi.fn();
    const service = new NotificationService(
      {} as never,
      { createForOrder } as never,
      { publish: vi.fn() } as never,
    );
    await service.recordOrderChange(
      {} as never,
      {
        id: 42n,
        userId: 7n,
        status: 'PENDING',
        paymentMethod: 'PAYOS',
        paymentStatus: 'UNPAID',
        totalAmount: 1n,
        createdAt: new Date(),
        items: [],
      },
      101n,
    );
    expect(createForOrder).not.toHaveBeenCalled();
  });
});
