import { describe, expect, it, vi } from 'vitest';
import { EmailOutboxWorker } from './email-outbox.worker.js';

describe('EmailOutboxWorker', () => {
  it('reschedules a temporarily failed email with a lease protected update', async () => {
    type UpdateArgs = {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    const updates: UpdateArgs[] = [];
    const updateMany = vi.fn((args: UpdateArgs) => {
      updates.push(args);
      return Promise.resolve({ count: 1 });
    });
    const prisma = {
      emailOutbox: {
        updateMany,
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 9n,
          attempts: 1,
          recipientEmail: 'customer@example.test',
          payload: {
            orderId: '42',
            status: 'PENDING',
            paymentStatus: 'UNPAID',
            totalAmount: '85000',
            createdAt: new Date().toISOString(),
            reason: null,
            items: [],
          },
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 9n }]),
    };
    const email = {
      isConfigured: vi.fn().mockReturnValue(true),
      sendOrderStatus: vi.fn().mockResolvedValue({
        sent: false,
        retryable: true,
        errorCode: 'provider_error',
      }),
    };
    const worker = new EmailOutboxWorker(prisma as never, email as never);
    await worker['processOne']();
    const retryWrite = updates.at(-1)!;
    expect(retryWrite.where.id).toBe(9n);
    expect(typeof retryWrite.where.leaseToken).toBe('string');
    expect(retryWrite.data).toMatchObject({
      status: 'PENDING',
      lastErrorCode: 'provider_error',
      leaseToken: null,
      leaseUntil: null,
    });
    expect(retryWrite.data.availableAt).toBeInstanceOf(Date);
  });
});
