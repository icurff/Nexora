import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NotFoundError, PayOS, type Webhook } from '@payos/node';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedActor } from '../shared/decorators/current-actor.decorator.js';

@Injectable()
export class PayosService {
  constructor(private readonly prisma: PrismaService) {}

  async transactions(id: string) {
    if (!/^[1-9]\d*$/.test(id) || BigInt(id) > 9223372036854775807n)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    const transactions = await this.prisma.payosPaymentTransaction.findMany({
      where: { orderId: BigInt(id) },
      orderBy: { receivedAt: 'desc' },
    });
    return transactions.map((item) => ({
      reference: item.reference,
      amount: item.amount.toString(),
      providerTime: item.providerTime,
      receivedAt: item.receivedAt.toISOString(),
      outcome: item.outcome,
      reviewReason: item.reviewReason,
      evidenceSource: item.evidenceSource,
    }));
  }

  async exceptions() {
    const rows = await this.prisma.payosPaymentTransaction.findMany({
      where: { outcome: 'REVIEW' },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
    return rows.map((item) => ({
      orderId: item.orderId.toString(),
      reference: item.reference,
      amount: item.amount.toString(),
      providerTime: item.providerTime,
      receivedAt: item.receivedAt.toISOString(),
      reviewReason: item.reviewReason,
      evidenceSource: item.evidenceSource,
    }));
  }

  private client() {
    const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = process.env;
    if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY)
      throw new ServiceUnavailableException({ code: 'PAYOS_NOT_CONFIGURED' });
    return new PayOS({
      clientId: PAYOS_CLIENT_ID,
      apiKey: PAYOS_API_KEY,
      checksumKey: PAYOS_CHECKSUM_KEY,
      timeout: 10000,
      maxRetries: 0,
    });
  }

  async link(actor: AuthenticatedActor, value: string) {
    if (!/^[1-9]\d*$/.test(value) || BigInt(value) > 9223372036854775807n)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    const client = this.client();
    const orderId = BigInt(value);
    const request = await this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.userId.toString() !== actor.userId)
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
      if (
        order.paymentMethod !== 'PAYOS' ||
        order.paymentStatus !== 'UNPAID' ||
        order.status !== 'PENDING' ||
        order.expiresAt <= new Date()
      )
        throw new ConflictException({ code: 'PAYMENT_NOT_AVAILABLE' });
      if (order.totalAmount > BigInt(Number.MAX_SAFE_INTEGER))
        throw new ConflictException({ code: 'PAYMENT_AMOUNT_INVALID' });
      return tx.payosPaymentRequest.upsert({
        where: { orderId },
        update: {},
        create: {
          id: randomInt(100000000, 2147483647),
          orderId,
          amount: order.totalAmount,
          expiresAt: order.expiresAt,
        },
      });
    });
    if (request.checkoutUrl)
      return {
        checkoutUrl: request.checkoutUrl,
        paymentDetails: request.paymentDetails,
      };
    if (request.attemptedAt) {
      try {
        const existing = await client.paymentRequests.get(request.id);
        if (
          existing.orderCode !== request.id ||
          existing.amount !== Number(request.amount) ||
          existing.status !== 'PENDING' ||
          !/^[a-zA-Z0-9]+$/.test(existing.id)
        )
          throw new ConflictException({ code: 'PAYOS_LINK_REQUIRES_REVIEW' });
        const checkoutUrl = `https://pay.payos.vn/web/${existing.id}`;
        await this.prisma.payosPaymentRequest.update({
          where: { id: request.id },
          data: { paymentLinkId: existing.id, checkoutUrl },
        });
        return { checkoutUrl, paymentDetails: null };
      } catch (error) {
        if (!(error instanceof NotFoundError))
          throw new ServiceUnavailableException({
            code: 'PAYOS_LINK_UNAVAILABLE',
          });
      }
    }
    await this.prisma.payosPaymentRequest.update({
      where: { id: request.id },
      data: { attemptedAt: new Date() },
    });
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    const returnUrl = new URL(
      `/checkout/payment/${value}?payment=return`,
      frontend,
    ).toString();
    const cancelUrl = new URL(
      `/checkout/payment/${value}?payment=cancel`,
      frontend,
    ).toString();
    try {
      const link = await client.paymentRequests.create({
        orderCode: request.id,
        amount: Number(request.amount),
        description: 'Nexora',
        returnUrl,
        cancelUrl,
        expiredAt: Math.floor(request.expiresAt.getTime() / 1000),
      });
      if (
        link.orderCode !== request.id ||
        link.amount !== Number(request.amount) ||
        link.currency !== 'VND'
      )
        throw new Error('payOS returned a mismatched payment request');
      const paymentDetails = {
        qrCode: link.qrCode,
        bin: link.bin,
        accountNumber: link.accountNumber,
        accountName: link.accountName,
        description: link.description,
      };
      await this.prisma.payosPaymentRequest.update({
        where: { id: request.id },
        data: {
          paymentLinkId: link.paymentLinkId,
          checkoutUrl: link.checkoutUrl,
          paymentDetails,
        },
      });
      return { checkoutUrl: link.checkoutUrl, paymentDetails };
    } catch {
      const saved = await this.prisma.payosPaymentRequest.findUnique({
        where: { id: request.id },
      });
      if (saved?.checkoutUrl)
        return {
          checkoutUrl: saved.checkoutUrl,
          paymentDetails: saved.paymentDetails,
        };
      try {
        const remote = await client.paymentRequests.get(request.id);
        if (
          remote.orderCode === request.id &&
          remote.amount === Number(request.amount) &&
          remote.status === 'PENDING' &&
          /^[a-zA-Z0-9]+$/.test(remote.id)
        ) {
          const checkoutUrl = `https://pay.payos.vn/web/${remote.id}`;
          await this.prisma.payosPaymentRequest.update({
            where: { id: request.id },
            data: { paymentLinkId: remote.id, checkoutUrl },
          });
          return { checkoutUrl, paymentDetails: null };
        }
      } catch {
        /* Retry the same request later. */
      }
      throw new ServiceUnavailableException({ code: 'PAYOS_LINK_UNAVAILABLE' });
    }
  }

  async webhook(payload: Webhook) {
    const client = this.client();
    let data: Awaited<ReturnType<typeof client.webhooks.verify>>;
    try {
      data = await client.webhooks.verify(payload);
    } catch {
      throw new BadRequestException({ code: 'PAYOS_SIGNATURE_INVALID' });
    }
    if (!payload.success || payload.code !== '00' || data.code !== '00')
      return { received: true };
    if (
      !Number.isSafeInteger(data.orderCode) ||
      !Number.isSafeInteger(data.amount) ||
      data.amount <= 0 ||
      !data.reference ||
      !data.paymentLinkId ||
      data.currency !== 'VND'
    )
      throw new BadRequestException({ code: 'PAYOS_DATA_INVALID' });
    // payOS sends its signed example when registering a webhook URL. Nexora
    // only generates request codes of at least 100,000,000.
    if (
      data.orderCode === 123 &&
      data.amount === 3000 &&
      data.reference === 'TF230204212323'
    )
      return { received: true };
    await this.recordVerifiedPayment(data, 'WEBHOOK');
    return { received: true };
  }

  async reconcile(actor: AuthenticatedActor, value: string) {
    if (!/^[1-9]\d*$/.test(value) || BigInt(value) > 9223372036854775807n)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    const order = await this.prisma.order.findUnique({
      where: { id: BigInt(value) },
      include: { payosRequest: true },
    });
    if (!order || order.userId.toString() !== actor.userId)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    if (order.paymentMethod !== 'PAYOS' || !order.payosRequest?.paymentLinkId)
      throw new ConflictException({ code: 'PAYOS_REQUEST_NOT_FOUND' });
    const request = order.payosRequest;
    let remote: Awaited<ReturnType<PayOS['paymentRequests']['get']>>;
    try {
      remote = await this.client().paymentRequests.get(request.id);
    } catch {
      throw new ServiceUnavailableException({
        code: 'PAYOS_STATUS_UNAVAILABLE',
      });
    }
    if (
      remote.orderCode !== request.id ||
      remote.id !== request.paymentLinkId ||
      remote.amount !== Number(request.amount)
    )
      throw new ConflictException({ code: 'PAYOS_STATUS_MISMATCH' });
    if (remote.status !== 'PAID') return { status: remote.status };
    if (
      remote.amountPaid !== Number(request.amount) ||
      remote.amountRemaining !== 0 ||
      remote.transactions.length !== 1 ||
      remote.transactions[0].amount !== Number(request.amount)
    )
      throw new ConflictException({ code: 'PAYOS_STATUS_REQUIRES_REVIEW' });
    const transaction = remote.transactions[0];
    await this.recordVerifiedPayment(
      {
        orderCode: request.id,
        amount: transaction.amount,
        reference: transaction.reference,
        paymentLinkId: remote.id,
        transactionDateTime: transaction.transactionDateTime,
      },
      'PAYOS_API',
    );
    return { status: 'CHECKED' };
  }

  private async recordVerifiedPayment(
    data: {
      orderCode: number;
      amount: number;
      reference: string;
      paymentLinkId: string;
      transactionDateTime: string;
    },
    evidenceSource: 'WEBHOOK' | 'PAYOS_API',
  ) {
    await this.prisma.transaction(async (tx) => {
      const initialRequest = await tx.payosPaymentRequest.findUnique({
        where: { id: data.orderCode },
      });
      if (!initialRequest)
        throw new NotFoundException({ code: 'PAYOS_REQUEST_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${initialRequest.orderId} FOR UPDATE`;
      const request = await tx.payosPaymentRequest.findUniqueOrThrow({
        where: { id: data.orderCode },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: request.orderId },
      });
      const existing = await tx.payosPaymentTransaction.findUnique({
        where: { reference: data.reference },
      });
      if (existing) {
        if (
          existing.orderId !== order.id ||
          existing.amount !== BigInt(data.amount) ||
          existing.paymentLinkId !== data.paymentLinkId
        )
          throw new ConflictException({ code: 'PAYOS_REFERENCE_CONFLICT' });
        return;
      }
      const matchingLink =
        !request.paymentLinkId || request.paymentLinkId === data.paymentLinkId;
      if (!request.paymentLinkId && matchingLink)
        await tx.payosPaymentRequest.update({
          where: { id: request.id },
          data: { paymentLinkId: data.paymentLinkId },
        });
      const valid =
        matchingLink &&
        request.amount === BigInt(data.amount) &&
        order.totalAmount === BigInt(data.amount) &&
        order.paymentMethod === 'PAYOS' &&
        order.paymentStatus === 'UNPAID' &&
        order.status === 'PENDING' &&
        order.expiresAt > new Date();
      const reviewReason = valid
        ? null
        : !matchingLink
          ? 'LINK_MISMATCH'
          : request.amount !== BigInt(data.amount) ||
              order.totalAmount !== BigInt(data.amount)
            ? 'AMOUNT_MISMATCH'
            : order.paymentStatus === 'PAID'
              ? 'ADDITIONAL_PAYMENT'
              : 'ORDER_NOT_PAYABLE';
      await tx.payosPaymentTransaction.create({
        data: {
          orderId: order.id,
          reference: data.reference,
          paymentLinkId: data.paymentLinkId,
          amount: BigInt(data.amount),
          providerTime: data.transactionDateTime,
          outcome: valid ? 'PAID' : 'REVIEW',
          reviewReason,
          evidenceSource,
        },
      });
      if (valid) {
        const paidAt = new Date();
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: paidAt,
            updatedAt: paidAt,
            paymentStatus: 'PAID',
            paidAt,
            version: { increment: 1 },
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            actorId: null,
            fromStatus: 'PENDING',
            toStatus: 'CONFIRMED',
            reason: null,
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            eventId: `be:payment:${order.id}`,
            eventType: 'transaction',
          },
        });
        const items = await tx.orderItem.findMany({
          where: { orderId: order.id },
        });
        await tx.interactionEvent.createMany({
          data: items.map((item) => ({
            eventId: `be:transaction:${order.id}:${item.id}`,
            eventType: 'transaction',
            eventSource: 'BACKEND',
            userId: order.userId,
            productId: item.productId,
            occurredAt: paidAt,
            metadata: {
              orderId: order.id.toString(),
              orderItemId: item.id.toString(),
              quantity: item.quantity,
            },
          })),
        });
      }
    });
  }
}
