import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class EngagementRepository {
  constructor(private readonly db: PrismaService) {}
  activeProduct(id: bigint) {
    return this.db.product.findFirst({
      where: { id, status: 'ACTIVE' },
      select: { id: true },
    });
  }
  wishlist(userId: bigint) {
    return this.db.wishlistItem.findMany({
      where: { userId, product: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
  }
  add(userId: bigint, productId: bigint) {
    return this.db.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }
  remove(userId: bigint, productId: bigint) {
    return this.db.wishlistItem.deleteMany({ where: { userId, productId } });
  }
  reviews(productId: bigint) {
    return this.db.productReview.findMany({
      where: { productId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true } },
        product: { select: { name: true } },
      },
    });
  }
  adminReviews(page: number, status?: string) {
    const where = status ? { status } : {};
    return Promise.all([
      this.db.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
        include: {
          user: { select: { fullName: true } },
          product: { select: { name: true } },
        },
      }),
      this.db.productReview.count({ where }),
    ]);
  }
  review(userId: bigint, productId: bigint, rating: number, content: string) {
    return this.db.productReview.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, rating, content },
      update: { rating, content, status: 'PENDING' },
    });
  }
  moderate(id: bigint, status: string) {
    return this.db.productReview.updateMany({
      where: { id },
      data: { status },
    });
  }
}
