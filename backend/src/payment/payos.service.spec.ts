import { afterEach, describe, expect, it, vi } from 'vitest';
import { PayosService } from './payos.service.js';

const verify = vi.hoisted(() => vi.fn());
const createLink = vi.hoisted(() => vi.fn());
const getLink = vi.hoisted(() => vi.fn());
vi.mock('@payos/node', () => ({
  NotFoundError: class extends Error {},
  PayOS: class {
    webhooks = { verify };
    paymentRequests = { create: createLink, get: getLink };
  },
}));

function fixture() {
  const order = {
    id: 1n,
    userId: 7n,
    paymentMethod: 'PAYOS',
    paymentStatus: 'UNPAID',
    status: 'PENDING',
    expiresAt: new Date('2099-01-01'),
    totalAmount: 130000n,
  };
  const request = {
    id: 123,
    orderId: 1n,
    amount: 130000n,
    paymentLinkId: 'link1',
  };
  const transactions: Array<{
    orderId: bigint;
    reference: string;
    amount: bigint;
    paymentLinkId: string;
    outcome: string;
    evidenceSource: string;
  }> = [];
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    payosPaymentRequest: {
      findUnique: vi.fn().mockResolvedValue(request),
      findUniqueOrThrow: vi.fn().mockResolvedValue(request),
      update: vi.fn(),
    },
    payosPaymentTransaction: {
      findUnique: vi.fn(({ where }: { where: { reference: string } }) =>
        Promise.resolve(
          transactions.find((item) => item.reference === where.reference) ??
            null,
        ),
      ),
      create: vi.fn(({ data }: { data: (typeof transactions)[number] }) => {
        transactions.push(data);
        return Promise.resolve(data);
      }),
    },
    order: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(order),
      update: vi.fn().mockResolvedValue(order),
    },
    orderStatusHistory: { create: vi.fn().mockResolvedValue({}) },
    orderEvent: { create: vi.fn().mockResolvedValue({}) },
    orderItem: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 4n, productId: 5n, quantity: 2 }]),
    },
    interactionEvent: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    transaction: (work: (value: typeof tx) => Promise<unknown>) => work(tx),
    order: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ ...order, payosRequest: request }),
    },
  };
  const payload = {
    success: true,
    code: '00',
    desc: '',
    signature: 'test',
    data: {
      orderCode: 123,
      amount: 130000,
      currency: 'VND',
      reference: 'ref1',
      paymentLinkId: 'link1',
      transactionDateTime: '2026-11-28 09:00:00',
      code: '00',
      desc: '',
      description: '',
      accountNumber: '',
    },
  };
  verify.mockResolvedValue(payload.data);
  process.env.PAYOS_CLIENT_ID = 'test';
  process.env.PAYOS_API_KEY = 'test';
  process.env.PAYOS_CHECKSUM_KEY = 'test';
  return {
    service: new PayosService(prisma as never),
    tx,
    order,
    transactions,
    payload,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.PAYOS_CLIENT_ID;
  delete process.env.PAYOS_API_KEY;
  delete process.env.PAYOS_CHECKSUM_KEY;
});

describe('payOS payment link', () => {
  it('reuses a legacy link that does not have saved QR details', async () => {
    const order = {
      id: 1n,
      userId: 7n,
      paymentMethod: 'PAYOS',
      paymentStatus: 'UNPAID',
      status: 'PENDING',
      expiresAt: new Date('2099-01-01'),
      totalAmount: 130000n,
    };
    const request = {
      id: 789,
      orderId: 1n,
      checkoutUrl: 'https://pay.payos.vn/web/legacy',
      paymentDetails: null,
    };
    const tx = {
      $queryRaw: vi.fn(),
      order: { findUnique: vi.fn().mockResolvedValue(order) },
      payosPaymentRequest: { upsert: vi.fn().mockResolvedValue(request) },
    };
    const prisma = {
      transaction: (work: (value: typeof tx) => Promise<unknown>) => work(tx),
    };
    process.env.PAYOS_CLIENT_ID = 'test';
    process.env.PAYOS_API_KEY = 'test';
    process.env.PAYOS_CHECKSUM_KEY = 'test';
    const result = await new PayosService(prisma as never).link(
      { userId: '7', sessionId: '1', role: 'CUSTOMER' },
      '1',
    );
    expect(result).toEqual({
      checkoutUrl: request.checkoutUrl,
      paymentDetails: null,
    });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('stores and returns the QR and bank details provided by payOS', async () => {
    const expiresAt = new Date('2099-01-01');
    const order = {
      id: 1n,
      userId: 7n,
      paymentMethod: 'PAYOS',
      paymentStatus: 'UNPAID',
      status: 'PENDING',
      expiresAt,
      totalAmount: 101000n,
    };
    const request = {
      id: 456,
      orderId: 1n,
      amount: 101000n,
      expiresAt,
      checkoutUrl: null,
      paymentDetails: null,
      attemptedAt: null,
    };
    const tx = {
      $queryRaw: vi.fn(),
      order: { findUnique: vi.fn().mockResolvedValue(order) },
      payosPaymentRequest: { upsert: vi.fn().mockResolvedValue(request) },
    };
    const update = vi.fn().mockResolvedValue(request);
    const prisma = {
      transaction: (work: (value: typeof tx) => Promise<unknown>) => work(tx),
      payosPaymentRequest: { update },
    };
    process.env.PAYOS_CLIENT_ID = 'test';
    process.env.PAYOS_API_KEY = 'test';
    process.env.PAYOS_CHECKSUM_KEY = 'test';
    createLink.mockResolvedValue({
      orderCode: 456,
      amount: 101000,
      currency: 'VND',
      paymentLinkId: 'link2',
      checkoutUrl: 'https://pay.payos.vn/web/link2',
      qrCode: 'qr-data',
      bin: '970422',
      accountNumber: '123',
      accountName: 'NEXORA',
      description: 'ORDER 456',
    });
    const result = await new PayosService(prisma as never).link(
      { userId: '7', sessionId: '1', role: 'CUSTOMER' },
      '1',
    );
    expect(result.paymentDetails).toEqual({
      qrCode: 'qr-data',
      bin: '970422',
      accountNumber: '123',
      accountName: 'NEXORA',
      description: 'ORDER 456',
    });
    const args = createLink.mock.calls[0][0] as {
      returnUrl: string;
      cancelUrl: string;
    };
    expect(new URL(args.returnUrl).pathname).toBe('/checkout/payment/1');
    expect(new URL(args.cancelUrl).pathname).toBe('/checkout/payment/1');
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 456 },
      data: {
        paymentLinkId: 'link2',
        checkoutUrl: 'https://pay.payos.vn/web/link2',
        paymentDetails: result.paymentDetails,
      },
    });
  });

  it('recovers the existing link after an interrupted provider request', async () => {
    const order = {
      id: 1n,
      userId: 7n,
      paymentMethod: 'PAYOS',
      paymentStatus: 'UNPAID',
      status: 'PENDING',
      expiresAt: new Date('2099-01-01'),
      totalAmount: 130000n,
    };
    const request = {
      id: 123,
      orderId: 1n,
      amount: 130000n,
      expiresAt: order.expiresAt,
      checkoutUrl: null,
      attemptedAt: new Date(),
    };
    const tx = {
      $queryRaw: vi.fn(),
      order: { findUnique: vi.fn().mockResolvedValue(order) },
      payosPaymentRequest: { upsert: vi.fn().mockResolvedValue(request) },
    };
    const update = vi.fn().mockResolvedValue(request);
    const prisma = {
      transaction: (work: (value: typeof tx) => Promise<unknown>) => work(tx),
      payosPaymentRequest: { update },
    };
    process.env.PAYOS_CLIENT_ID = 'test';
    process.env.PAYOS_API_KEY = 'test';
    process.env.PAYOS_CHECKSUM_KEY = 'test';
    getLink.mockResolvedValue({
      orderCode: 123,
      amount: 130000,
      id: 'link1',
      status: 'PENDING',
    });
    const result = await new PayosService(prisma as never).link(
      { userId: '7', sessionId: '1', role: 'CUSTOMER' },
      '1',
    );
    expect(result.checkoutUrl).toBe('https://pay.payos.vn/web/link1');
    expect(getLink).toHaveBeenCalledWith(123);
    expect(createLink).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('payOS webhook', () => {
  it('does not let another customer reconcile an order', async () => {
    const { service } = fixture();
    await expect(
      service.reconcile({ userId: '9', sessionId: '1', role: 'CUSTOMER' }, '1'),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });
    expect(getLink).not.toHaveBeenCalled();
  });
  it('does not automatically reconcile a payment with multiple transfers', async () => {
    const { service, tx } = fixture();
    getLink.mockResolvedValue({
      id: 'link1',
      orderCode: 123,
      amount: 130000,
      amountPaid: 130000,
      amountRemaining: 0,
      status: 'PAID',
      transactions: [{ amount: 100000 }, { amount: 30000 }],
    });
    await expect(
      service.reconcile({ userId: '7', sessionId: '1', role: 'CUSTOMER' }, '1'),
    ).rejects.toMatchObject({
      response: { code: 'PAYOS_STATUS_REQUIRES_REVIEW' },
    });
    expect(tx.order.update).not.toHaveBeenCalled();
  });
  it('reconciles a provider-confirmed payment and records its source', async () => {
    const { service, tx, transactions, payload } = fixture();
    getLink.mockResolvedValue({
      id: 'link1',
      orderCode: 123,
      amount: 130000,
      amountPaid: 130000,
      amountRemaining: 0,
      status: 'PAID',
      transactions: [
        {
          amount: 130000,
          reference: 'ref1',
          transactionDateTime: '2026-11-28 09:00:00',
        },
      ],
    });
    const result = await service.reconcile(
      { userId: '7', sessionId: '1', role: 'CUSTOMER' },
      '1',
    );
    expect(result.status).toBe('CHECKED');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].evidenceSource).toBe('PAYOS_API');
    await service.webhook(payload);
    expect(transactions).toHaveLength(1);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
  });
  it('records one transaction and marks an eligible order paid once on retry', async () => {
    const { service, tx, transactions, payload } = fixture();
    await service.webhook(payload);
    await service.webhook(payload);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].outcome).toBe('PAID');
    expect(tx.order.update).toHaveBeenCalledTimes(1);
    const updateArg = tx.order.update.mock.calls[0]?.[0] as {
      where: { id: bigint };
      data: {
        status: string;
        confirmedAt: Date;
        updatedAt: Date;
        paymentStatus: string;
        paidAt: Date;
        version: { increment: number };
      };
    };
    expect(updateArg.where).toEqual({ id: 1n });
    expect(updateArg.data.status).toBe('CONFIRMED');
    expect(updateArg.data.paymentStatus).toBe('PAID');
    expect(updateArg.data.version).toEqual({ increment: 1 });
    expect(updateArg.data.confirmedAt).toBeInstanceOf(Date);
    expect(updateArg.data.updatedAt).toBeInstanceOf(Date);
    expect(updateArg.data.paidAt).toBeInstanceOf(Date);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: {
        orderId: 1n,
        actorId: null,
        fromStatus: 'PENDING',
        toStatus: 'CONFIRMED',
        reason: null,
      },
    });
    expect(tx.orderEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.interactionEvent.createMany).toHaveBeenCalledTimes(1);
  });

  it('records late or mismatched payments for review without marking paid', async () => {
    const { service, tx, order, transactions, payload } = fixture();
    order.status = 'CANCELLED';
    payload.data.amount = 100;
    verify.mockResolvedValue(payload.data);
    await service.webhook(payload);
    expect(transactions[0].outcome).toBe('REVIEW');
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('rejects a webhook whose signature cannot be verified', async () => {
    const { service, tx, payload } = fixture();
    verify.mockRejectedValue(new Error('invalid signature'));
    await expect(service.webhook(payload)).rejects.toMatchObject({
      response: { code: 'PAYOS_SIGNATURE_INVALID' },
    });
    expect(tx.payosPaymentTransaction.create).not.toHaveBeenCalled();
  });
});
