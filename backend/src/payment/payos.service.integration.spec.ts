import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { PayosService } from './payos.service.js';

vi.mock('@payos/node', () => ({
  NotFoundError: class extends Error {},
  PayOS: class {
    webhooks = {
      verify: (payload: { data: unknown }) => Promise.resolve(payload.data),
    };
  },
}));

const databaseUrl = process.env.PAYOS_TEST_DATABASE_URL;
const enabled =
  databaseUrl ===
  'postgresql://payostest:payos-test-only@localhost:55432/payostest';

describe.skipIf(!enabled)('payOS PostgreSQL integration', () => {
  let prisma: PrismaService;
  let service: PayosService;
  let orderId: bigint;
  const requestId =
    (crypto.getRandomValues(new Uint32Array(1))[0] % 1000000000) + 100000000;
  const reference = `ref-${crypto.randomUUID()}`;
  const paymentLinkId = `link-${crypto.randomUUID()}`;
  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.PAYOS_CLIENT_ID = 'test';
    process.env.PAYOS_API_KEY = 'test';
    process.env.PAYOS_CHECKSUM_KEY = 'test';
    prisma = new PrismaService();
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `payos-${crypto.randomUUID()}@example.test`,
        fullName: 'Test',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        paymentMethod: 'PAYOS',
        subtotal: 100000n,
        shippingFee: 30000n,
        totalAmount: 130000n,
        recipientName: 'Test',
        recipientPhone: '0123456789',
        provinceName: 'Test',
        wardName: 'Test',
        addressLine: 'Test',
        expiresAt: new Date('2099-01-01'),
      },
    });
    orderId = order.id;
    await prisma.payosPaymentRequest.create({
      data: {
        id: requestId,
        orderId,
        amount: 130000n,
        paymentLinkId,
        expiresAt: order.expiresAt,
      },
    });
    service = new PayosService(prisma);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('serializes simultaneous retries and records the transaction once', async () => {
    const payload = {
      success: true,
      code: '00',
      desc: '',
      signature: 'test',
      data: {
        orderCode: requestId,
        amount: 130000,
        currency: 'VND',
        reference,
        paymentLinkId,
        transactionDateTime: '2026-11-28 09:00:00',
        code: '00',
        desc: '',
        description: '',
        accountNumber: '',
      },
    };
    await Promise.all([service.webhook(payload), service.webhook(payload)]);
    expect(
      await prisma.payosPaymentTransaction.count({ where: { orderId } }),
    ).toBe(1);
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(updated.paymentStatus).toBe('PAID');
    expect(updated.status).toBe('CONFIRMED');
    expect(updated.confirmedAt).not.toBeNull();
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId, fromStatus: 'PENDING', toStatus: 'CONFIRMED' },
      }),
    ).toBe(1);
    expect(
      await prisma.orderEvent.count({
        where: { orderId, eventType: 'transaction' },
      }),
    ).toBe(1);
  });

  it('records payment for review when cancellation wins the order lock', async () => {
    const first = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    const order = await prisma.order.create({
      data: {
        userId: first.userId,
        paymentMethod: 'PAYOS',
        subtotal: 100000n,
        shippingFee: 30000n,
        totalAmount: 130000n,
        recipientName: 'Test',
        recipientPhone: '0123456789',
        provinceName: 'Test',
        wardName: 'Test',
        addressLine: 'Test',
        expiresAt: new Date('2099-01-01'),
      },
    });
    const id = requestId + 1;
    const link = `link-${crypto.randomUUID()}`;
    await prisma.payosPaymentRequest.create({
      data: {
        id,
        orderId: order.id,
        amount: order.totalAmount,
        paymentLinkId: link,
        expiresAt: order.expiresAt,
      },
    });
    let release!: () => void;
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cancel = prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`;
      locked();
      await barrier;
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });
    });
    await acquired;
    const payload = {
      success: true,
      code: '00',
      desc: '',
      signature: 'test',
      data: {
        orderCode: id,
        amount: 130000,
        currency: 'VND',
        reference: `ref-${crypto.randomUUID()}`,
        paymentLinkId: link,
        transactionDateTime: '2026-11-28 09:00:00',
        code: '00',
        desc: '',
        description: '',
        accountNumber: '',
      },
    };
    const payment = service.webhook(payload);
    release();
    await Promise.all([cancel, payment]);
    const actual = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    const transaction = await prisma.payosPaymentTransaction.findUniqueOrThrow({
      where: { reference: payload.data.reference },
    });
    expect(actual.paymentStatus).toBe('UNPAID');
    expect(transaction.outcome).toBe('REVIEW');
  });
});
