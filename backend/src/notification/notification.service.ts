import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../database/prisma.service.js';
import type { AuthenticatedActor } from '../shared/decorators/current-actor.decorator.js';
import { NotificationRepository } from './notification.repository.js';
import { NotificationStream } from './notification.stream.js';

const messageFor = (
  status: string,
  orderId: bigint,
  reason?: string | null,
) => {
  if (status === 'PENDING')
    return {
      type: 'ORDER_CREATED',
      title: 'Đặt hàng thành công',
      body: `Đơn hàng #${orderId} đang chờ xác nhận.`,
    };
  if (status === 'CONFIRMED')
    return {
      type: 'ORDER_CONFIRMED',
      title: 'Đơn hàng đã được xác nhận',
      body: `Đơn hàng #${orderId} đang được chuẩn bị.`,
    };
  if (status === 'SHIPPING')
    return {
      type: 'ORDER_SHIPPING',
      title: 'Đơn hàng đang được giao',
      body: `Đơn hàng #${orderId} đã được bàn giao cho khâu giao hàng.`,
    };
  if (status === 'DELIVERED')
    return {
      type: 'ORDER_DELIVERED',
      title: 'Đơn hàng đã giao thành công',
      body: `Đơn hàng #${orderId} đã giao và thu COD thành công.`,
    };
  if (status === 'DELIVERY_FAILED')
    return {
      type: 'ORDER_DELIVERY_FAILED',
      title: 'Giao hàng chưa thành công',
      body: reason || `Đơn hàng #${orderId} chưa giao được.`,
    };
  if (status === 'CANCELLED' && reason?.startsWith('Đã nhận đủ hàng'))
    return {
      type: 'ORDER_RETURNED',
      title: 'Đơn hàng đã được nhận lại',
      body: `Đơn hàng #${orderId} đã được nhận lại và hủy.`,
    };
  if (status === 'EXPIRED')
    return {
      type: 'ORDER_EXPIRED',
      title: 'Đơn hàng đã hết hạn',
      body: `Đơn hàng #${orderId} đã hết hạn và được hủy.`,
    };
  return {
    type: 'ORDER_CANCELLED',
    title: 'Đơn hàng đã được hủy',
    body: `Đơn hàng #${orderId} đã được hủy.`,
  };
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: NotificationRepository,
    private readonly stream: NotificationStream,
  ) {}

  async recordOrderChange(
    tx: TransactionClient,
    order: {
      id: bigint;
      userId: bigint;
      status: string;
      paymentMethod: string;
      paymentStatus: string;
      totalAmount: bigint;
      createdAt: Date;
      items: Array<{
        productName: string;
        sku: string | null;
        quantity: number;
        unitPrice: bigint;
      }>;
    },
    historyId: bigint,
    reason?: string | null,
  ) {
    if (order.paymentMethod !== 'COD') return;
    const customer = await tx.user.findUnique({
      where: { id: order.userId },
      select: { email: true },
    });
    if (!customer) return;
    const notice = messageFor(
      reason === 'EXPIRED' ? 'EXPIRED' : order.status,
      order.id,
      reason,
    );
    const eventKey = `order-history:${historyId}`;
    const payload = {
      orderId: order.id.toString(),
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount.toString(),
      createdAt: order.createdAt.toISOString(),
      reason: reason ?? null,
      items: order.items.map(({ productName, sku, quantity, unitPrice }) => ({
        productName,
        sku,
        quantity,
        unitPrice: unitPrice.toString(),
      })),
    } as unknown as Prisma.InputJsonValue;
    await this.repository.createForOrder(
      {
        ...notice,
        userId: order.userId,
        orderId: order.id,
        eventKey,
        email: customer.email,
        payload,
      },
      tx,
    );
  }

  publishChanged(userId: bigint) {
    this.stream.publish(userId);
  }

  async list(
    actor: AuthenticatedActor,
    page: number,
    pageSize: number,
    unreadOnly: boolean,
  ) {
    const userId = BigInt(actor.userId);
    const [items, total, unreadCount] = await this.repository.list(
      userId,
      (page - 1) * pageSize,
      pageSize,
      unreadOnly,
    );
    return {
      items: items.map((item) => ({
        id: item.id.toString(),
        type: item.type,
        orderId: item.orderId.toString(),
        title: item.title,
        body: item.body,
        createdAt: item.createdAt.toISOString(),
        readAt: item.readAt?.toISOString() ?? null,
      })),
      total,
      unreadCount,
    };
  }

  async unreadCount(actor: AuthenticatedActor) {
    return {
      unreadCount: await this.repository.unreadCount(BigInt(actor.userId)),
    };
  }

  async markRead(actor: AuthenticatedActor, id: string) {
    if (!/^[1-9]\d*$/.test(id))
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    const userId = BigInt(actor.userId);
    if (!(await this.repository.markRead(userId, BigInt(id))))
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    this.publishChanged(userId);
    return { success: true };
  }

  async markAllRead(actor: AuthenticatedActor) {
    const userId = BigInt(actor.userId);
    await this.repository.markAllRead(userId);
    this.publishChanged(userId);
    return { success: true };
  }
}
