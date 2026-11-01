import { ConflictException, Injectable } from '@nestjs/common';
import type { TransactionClient } from '../database/prisma.service.js';

@Injectable()
export class CodPaymentService {
  settleAtDelivery(
    tx: TransactionClient,
    order: {
      id: bigint;
      paymentMethod: string;
      paymentStatus: string;
    },
    paidAt: Date,
  ) {
    if (order.paymentMethod !== 'COD' || order.paymentStatus !== 'UNPAID')
      throw new ConflictException({ code: 'ORDER_COD_PAYMENT_INVALID' });
    return tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'PAID', paidAt },
    });
  }
}
