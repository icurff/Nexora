import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class DashboardRepository {
  constructor(private readonly db: PrismaService) {}
  async get(start: Date, end: Date, threshold: number) {
    const range = { gte: start, lt: end };
    const [created, pending, cancelled, failures, paid, lowStock] =
      await Promise.all([
        this.db.order.count({ where: { createdAt: range } }),
        this.db.order.count({ where: { status: 'PENDING' } }),
        this.db.order.count({ where: { cancelledAt: range } }),
        this.db.orderStatusHistory.groupBy({
          by: ['orderId'],
          where: { toStatus: 'DELIVERY_FAILED', createdAt: range },
        }),
        this.db.order.aggregate({
          where: { paidAt: range, paymentStatus: 'PAID' },
          _sum: { subtotal: true, shippingFee: true },
        }),
        this.db.$queryRaw<
          Array<{ sku: string; product_name: string; available: number }>
        >`SELECT v.sku, p.name AS product_name, (i.on_hand - i.reserved)::int AS available FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE v.deleted_at IS NULL AND p.status = 'ACTIVE' AND (i.on_hand - i.reserved) <= ${threshold} ORDER BY available, v.id LIMIT 20`,
      ]);
    return {
      created,
      pending,
      cancelled,
      deliveryFailed: failures.length,
      merchandisePaid: (paid._sum.subtotal ?? 0n).toString(),
      shippingPaid: (paid._sum.shippingFee ?? 0n).toString(),
      lowStock: lowStock.map((item) => ({
        sku: item.sku,
        productName: item.product_name,
        available: item.available,
      })),
    };
  }
}
