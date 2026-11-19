import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedActor } from '../../shared/decorators/current-actor.decorator.js';
import { EngagementRepository } from './engagement.repository.js';

function parseId(value: string) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new BadRequestException({ code: 'INVALID_ID' });
  return BigInt(value);
}
@Injectable()
export class EngagementService {
  constructor(private readonly repo: EngagementRepository) {}
  async wishlist(actor: AuthenticatedActor) {
    return {
      items: (await this.repo.wishlist(BigInt(actor.userId))).map((item) =>
        item.productId.toString(),
      ),
    };
  }
  async addWishlist(actor: AuthenticatedActor, id: string) {
    const productId = parseId(id);
    if (!(await this.repo.activeProduct(productId)))
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    await this.repo.add(BigInt(actor.userId), productId);
    return { success: true };
  }
  async removeWishlist(actor: AuthenticatedActor, id: string) {
    await this.repo.remove(BigInt(actor.userId), parseId(id));
    return { success: true };
  }
  async reviews(id: string) {
    const productId = parseId(id);
    if (!(await this.repo.activeProduct(productId)))
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    return { items: (await this.repo.reviews(productId)).map(this.view) };
  }
  async adminReviews(page: number, status?: string) {
    const [items, total] = await this.repo.adminReviews(page, status);
    return { items: items.map(this.view), total, page, pageSize: 20 };
  }
  async review(
    actor: AuthenticatedActor,
    id: string,
    body: { rating: number; content: string },
  ) {
    const productId = parseId(id);
    const content = body.content.trim();
    if (!content)
      throw new BadRequestException({ code: 'REVIEW_CONTENT_REQUIRED' });
    if (!(await this.repo.activeProduct(productId)))
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    const saved = await this.repo.review(
      BigInt(actor.userId),
      productId,
      body.rating,
      content,
    );
    return { id: saved.id.toString(), status: saved.status };
  }
  async moderate(id: string, status: string) {
    const result = await this.repo.moderate(parseId(id), status);
    if (!result.count)
      throw new NotFoundException({ code: 'REVIEW_NOT_FOUND' });
    return { success: true };
  }
  private view(
    this: void,
    row: {
      id: bigint;
      productId: bigint;
      rating: number;
      content: string;
      status: string;
      createdAt: Date;
      user: { fullName: string };
      product: { name: string };
    },
  ) {
    return {
      id: row.id.toString(),
      productId: row.productId.toString(),
      productName: row.product.name,
      author: row.user.fullName,
      rating: row.rating,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
