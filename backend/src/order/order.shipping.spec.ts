import { describe, expect, it, vi } from 'vitest';
import { OrderService } from './order.service.js';

describe('checkout shipping', () => {
  it.each(['COD', 'PAYOS'] as const)(
    'charges 1,000 VND for a new %s order',
    async (paymentMethod) => {
      const now = new Date('2026-11-28T00:00:00Z');
      const create = vi.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          id: 1n,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          version: 1n,
          updatedAt: now,
          confirmedAt: null,
          firstShippedAt: null,
          deliveredAt: null,
          paidAt: null,
          cancelledAt: null,
          returnedAt: null,
          cancelReason: null,
          items: [],
          history: [],
        }),
      );
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ now }]),
        order: { create },
        orderStatusHistory: { findFirst: vi.fn().mockResolvedValue(null) },
      };
      const prisma = {
        transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      };
      const orders = {
        idempotency: vi.fn().mockResolvedValue(null),
        reserveIdempotency: vi.fn(),
        completeIdempotency: vi.fn(),
        user: vi.fn().mockResolvedValue({ status: 'ACTIVE' }),
        activeSession: vi.fn().mockResolvedValue({}),
        lockCart: vi.fn().mockResolvedValue(2n),
        cartItems: vi
          .fn()
          .mockResolvedValue([
            { id: 3n, quantity: 1, productId: 4n, variantId: null },
          ]),
        event: vi.fn(),
        deletePurchasedCartItems: vi.fn(),
      };
      const catalog = {
        reserveForOrder: vi
          .fn()
          .mockResolvedValue([
            {
              cartItemId: 3n,
              productId: 4n,
              variantId: null,
              productName: 'Item',
              sku: null,
              options: {},
              imageUrl: null,
              unitPrice: 100000n,
              quantity: 1,
            },
          ]),
      };
      const addresses = {
        checkoutSnapshot: vi
          .fn()
          .mockResolvedValue({
            recipientName: 'Test',
            recipientPhone: '0123456789',
            provinceName: 'Test',
            wardName: 'Test',
            addressLine: 'Test',
          }),
      };
      const service = new OrderService(
        prisma as never,
        orders as never,
        catalog as never,
        addresses as never,
        {} as never,
        {} as never,
      );
      const result = await service.place(
        { userId: '7', sessionId: '1', role: 'CUSTOMER' },
        {
          idempotencyKey: crypto.randomUUID(),
          paymentMethod,
          items: [{ cartItemId: '3', quantity: 1, unitPrice: '100000' }],
          addressId: '1',
          addressUpdatedAt: '2026-11-28T00:00:00.000Z',
        },
      );
      expect(result.shippingFee).toBe('1000');
      expect(result.totalAmount).toBe('101000');
      expect(result.paymentMethod).toBe(paymentMethod);
    },
  );
});
