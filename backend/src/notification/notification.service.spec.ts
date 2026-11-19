import { describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service.js';

describe('order email jobs', () => {
  it('queues an order email through the existing transaction', async () => {
    const createForOrder = vi.fn().mockResolvedValue({});
    const service = new NotificationService({ createForOrder });
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'buyer@example.test' }),
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
        totalAmount: 100n,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        items: [],
      },
      5n,
    );
    expect(createForOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'order-history:5',
        email: 'buyer@example.test',
        userId: 7n,
      }),
      tx,
    );
  });
});
