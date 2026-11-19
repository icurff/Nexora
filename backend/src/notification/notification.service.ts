import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { TransactionClient } from '../database/prisma.service.js';
import { NotificationRepository } from './notification.repository.js';

@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}
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
    } as Prisma.InputJsonValue;
    await this.repository.createForOrder(
      {
        userId: order.userId,
        orderId: order.id,
        eventKey: `order-history:${historyId}`,
        email: customer.email,
        payload,
      },
      tx,
    );
  }
}
