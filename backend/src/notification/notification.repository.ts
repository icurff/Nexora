import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../database/prisma.service.js';

@Injectable()
export class NotificationRepository {
  createForOrder(
    input: {
      userId: bigint;
      orderId: bigint;
      eventKey: string;
      type: string;
      title: string;
      body: string;
      email: string;
      payload: Prisma.InputJsonValue;
    },
    tx: TransactionClient,
  ) {
    return Promise.all([
      tx.userNotification.create({
        data: {
          userId: input.userId,
          orderId: input.orderId,
          eventKey: input.eventKey,
          type: input.type,
          title: input.title,
          body: input.body,
        },
      }),
      tx.emailOutbox.create({
        data: {
          eventKey: input.eventKey,
          userId: input.userId,
          orderId: input.orderId,
          recipientEmail: input.email,
          templateKey: 'ORDER_STATUS',
          payload: input.payload,
        },
      }),
    ]);
  }

  list(userId: bigint, skip: number, take: number, unreadOnly: boolean) {
    const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    return Promise.all([
      this.client.userNotification.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.client.userNotification.count({ where }),
      this.client.userNotification.count({ where: { userId, readAt: null } }),
    ]);
  }

  unreadCount(userId: bigint) {
    return this.client.userNotification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: bigint, id: bigint) {
    const result = await this.client.userNotification.updateMany({
      where: { userId, id },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  markAllRead(userId: bigint) {
    return this.client.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  constructor(private readonly client: PrismaService) {}
}
