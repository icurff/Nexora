import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../database/prisma.service.js';

const orderInclude = {
  items: { orderBy: { id: 'asc' as const } },
  history: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { actor: { select: { fullName: true, role: true } } },
  },
};

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  user(userId: bigint, tx: TransactionClient) {
    return tx.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: true },
    });
  }

  activeSession(userId: bigint, sessionId: string, tx: TransactionClient) {
    if (!/^[1-9]\d*$/.test(sessionId)) return Promise.resolve(null);
    return tx.authSession.findFirst({
      where: {
        id: BigInt(sessionId),
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
  }

  async lockCart(userId: bigint, tx: TransactionClient) {
    const rows = await tx.$queryRaw<
      Array<{ id: bigint }>
    >`SELECT id FROM carts WHERE user_id = ${userId} FOR UPDATE`;
    return rows[0]?.id ?? null;
  }

  cartItems(cartId: bigint, ids: bigint[], tx: TransactionClient) {
    return tx.cartItem.findMany({
      where: { cartId, id: { in: ids } },
      orderBy: { id: 'asc' },
    });
  }

  idempotency(
    userId: bigint,
    key: string,
    tx: TransactionClient | PrismaService = this.prisma,
  ) {
    return tx.orderIdempotencyRequest.findUnique({
      where: { userId_key: { userId, key } },
    });
  }

  reserveIdempotency(
    userId: bigint,
    key: string,
    payload: Prisma.InputJsonValue,
    tx: TransactionClient,
  ) {
    return tx.orderIdempotencyRequest.create({
      data: { userId, key, payload },
    });
  }

  completeIdempotency(
    userId: bigint,
    key: string,
    response: Prisma.InputJsonValue,
    tx: TransactionClient,
  ) {
    return tx.orderIdempotencyRequest.update({
      where: { userId_key: { userId, key } },
      data: { response },
    });
  }

  event(orderId: bigint, tx: TransactionClient) {
    return tx.orderEvent.create({
      data: {
        eventId: `be:order-created:${orderId}`,
        orderId,
        eventType: 'order_created',
      },
    });
  }

  async createOrder(data: Prisma.OrderCreateInput, tx: TransactionClient) {
    return tx.order.create({ data, include: orderInclude });
  }

  findOrder(id: bigint, tx: TransactionClient | PrismaService = this.prisma) {
    return tx.order.findUnique({ where: { id }, include: orderInclude });
  }

  async lockOrder(id: bigint, tx: TransactionClient) {
    const rows = await tx.$queryRaw<
      Array<{ id: bigint }>
    >`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  }

  dueOrders(take: number) {
    return this.prisma.$queryRaw<
      Array<{ id: bigint }>
    >`SELECT id FROM orders WHERE status = 'PENDING' AND payment_status = 'UNPAID' AND expires_at <= clock_timestamp() ORDER BY expires_at ASC LIMIT ${take}`;
  }

  changeStatus(
    id: bigint,
    status: string,
    updatedAt: Date,
    cancelledAt: Date | null,
    reason: string | null,
    confirmedAt: Date | null,
    tx: TransactionClient,
  ) {
    return tx.order.update({
      where: { id },
      data: {
        status,
        version: { increment: 1n },
        updatedAt,
        cancelledAt,
        cancelReason: reason,
        confirmedAt,
      },
    });
  }

  history(
    orderId: bigint,
    actorId: bigint | null,
    fromStatus: string,
    toStatus: string,
    reason: string | null,
    tx: TransactionClient,
  ) {
    return tx.orderStatusHistory.create({
      data: { orderId, actorId, fromStatus, toStatus, reason },
    });
  }

  deletePurchasedCartItems(ids: bigint[], tx: TransactionClient) {
    return tx.cartItem.deleteMany({ where: { id: { in: ids } } });
  }

  async list(
    userId: bigint | null,
    status: string | undefined,
    skip: number,
    take: number,
  ) {
    const where = {
      ...(userId === null ? {} : { userId }),
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          items: { orderBy: { id: 'asc' } },
          user: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total };
  }
}
