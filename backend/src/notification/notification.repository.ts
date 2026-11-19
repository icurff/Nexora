import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { TransactionClient } from '../database/prisma.service.js';

@Injectable()
export class NotificationRepository {
  createForOrder(
    input: {
      userId: bigint;
      orderId: bigint;
      eventKey: string;
      email: string;
      payload: Prisma.InputJsonValue;
    },
    tx: TransactionClient,
  ) {
    return tx.emailOutbox.create({
      data: {
        eventKey: input.eventKey,
        userId: input.userId,
        orderId: input.orderId,
        recipientEmail: input.email,
        templateKey: 'ORDER_STATUS',
        payload: input.payload,
      },
    });
  }
}
