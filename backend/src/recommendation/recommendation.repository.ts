import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class RecommendationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Product bán được khi:
   * - ACTIVE
   * - Không có SKU đang hoạt động: tồn Product > reserved
   * - Hoặc có ít nhất một SKU chưa xóa và còn tồn khả dụng
   *
   * Không sử dụng tồn của Product để thay thế cho tồn SKU.
   */
  private readonly sellableSql = Prisma.sql`
    p.status = 'ACTIVE'
    AND (
      (
        NOT EXISTS (
          SELECT 1
          FROM product_variants AS v0
          WHERE v0.product_id = p.id
            AND v0.deleted_at IS NULL
        )
        AND EXISTS (
          SELECT 1
          FROM product_inventory AS pi
          WHERE pi.product_id = p.id
            AND pi.on_hand > pi.reserved
        )
      )
      OR EXISTS (
        SELECT 1
        FROM product_variants AS v
        INNER JOIN inventory AS i
          ON i.variant_id = v.id
        WHERE v.product_id = p.id
          AND v.deleted_at IS NULL
          AND i.on_hand > i.reserved
      )
    )
  `;

  private excludeSql(excludeIds: bigint[]) {
    return excludeIds.length
      ? Prisma.sql`AND p.id NOT IN (${Prisma.join(excludeIds)})`
      : Prisma.empty;
  }

  private async candidates(
    limit: number,
    excludeIds: bigint[],
    categoryIds?: bigint[],
  ) {
    if (limit <= 0) return [];
    if (categoryIds && categoryIds.length === 0) return [];

    const categoryFilter = categoryIds
      ? Prisma.sql`
          AND p.category_id IN (${Prisma.join(categoryIds)})
        `
      : Prisma.empty;

    const ids = await this.prisma.$queryRaw<Array<{ id: bigint }>>`
      SELECT p.id
      FROM products AS p
      WHERE ${this.sellableSql}
        ${categoryFilter}
        ${this.excludeSql(excludeIds)}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ${limit}
    `;

    if (!ids.length) return [];

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: ids.map((row) => row.id) },
      },
    });

    const byId = new Map(products.map((p) => [p.id, p]));

    return ids
      .map((row) => byId.get(row.id))
      .filter((p): p is (typeof products)[number] => p !== undefined);
  }

  async newest(limit: number, excludeIds: bigint[] = []) {
    return this.candidates(limit, excludeIds);
  }

  async byCategories(
    categoryIds: bigint[],
    limit: number,
    excludeIds: bigint[] = [],
  ) {
    return this.candidates(limit, excludeIds, categoryIds);
  }

  async product(id: bigint) {
    return this.prisma.product.findUnique({
      where: { id },
      select: { id: true, categoryId: true, retailrocketItemId: true },
    });
  }

  async recentViews(visitorId: bigint) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return this.prisma.interactionEvent.findMany({
      where: {
        visitorId,
        eventType: 'view',
        dataOrigin: 'LIVE',
        productId: { not: null },
        occurredAt: { gte: since },
      },
      select: {
        productId: true,
        product: {
          select: { categoryId: true },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
  }

  async cartProducts(userId: bigint) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, categoryId: true, retailrocketItemId: true },
            },
            variant: {
              include: {
                product: {
                  select: {
                    id: true,
                    categoryId: true,
                    retailrocketItemId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return (cart?.items ?? [])
      .map((item) => item.product ?? item.variant?.product)
      .filter((product) => product != null);
  }

  // Lấy tối đa 3 sản phẩm VIEW gần nhất của phiên hiện tại.
  // Chỉ sử dụng dữ liệu LIVE, không sử dụng RetailRocket visitor ID.
  async recentSessionViews(visitorId: bigint) {
    const events = await this.prisma.interactionEvent.findMany({
      where: {
        visitorId,
        dataOrigin: 'LIVE',
        eventSource: 'FRONTEND',
      },
      select: {
        eventType: true,
        occurredAt: true,
        trackingSessionId: true,
        productId: true,
        product: {
          select: { retailrocketItemId: true, categoryId: true },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });

    const timeout = 30 * 60 * 1000;

    if (
      events.length === 0 ||
      Date.now() - events[0].occurredAt.getTime() > timeout
    ) {
      return [];
    }

    const sessionId = events[0].trackingSessionId;
    const views: Array<{
      productId: bigint;
      categoryId: bigint;
      sourceItemId: number | null;
    }> = [];
    let previousTime = events[0].occurredAt.getTime();

    for (const event of events) {
      const currentTime = event.occurredAt.getTime();

      if (
        event.trackingSessionId !== sessionId ||
        previousTime - currentTime > timeout
      ) {
        break;
      }

      previousTime = currentTime;

      if (event.eventType !== 'view' || !event.productId || !event.product)
        continue;

      const sourceId = event.product?.retailrocketItemId;
      const itemId = Number(sourceId);
      views.push({
        productId: event.productId,
        categoryId: event.product.categoryId,
        sourceItemId:
          sourceId && Number.isSafeInteger(itemId) && itemId > 0
            ? itemId
            : null,
      });
      if (views.length === 3) break;
    }

    // FastAPI yêu cầu thứ tự cũ -> mới.
    return views.reverse();
  }

  // Chỉ lấy các sản phẩm đang bán được và có RetailRocket ID.
  // Sử dụng lại sellableSql hiện có, không bỏ qua tồn kho SKU.
  async sellableMappedProducts(limit = 5000) {
    const safeLimit = Math.min(Math.max(limit, 1), 5000);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: bigint;
        name: string;
        categoryId: bigint;
        retailrocketItemId: string;
      }>
    >`
      SELECT
        p.id,
        p.name,
        p.category_id AS "categoryId",
        p.retailrocket_item_id AS "retailrocketItemId"
      FROM products AS p
      WHERE ${this.sellableSql}
        AND p.retailrocket_item_id IS NOT NULL
      ORDER BY p.id ASC
      LIMIT ${safeLimit}
    `;

    return rows
      .map((row) => ({
        ...row,
        sourceItemId: Number(row.retailrocketItemId),
      }))
      .filter(
        (row) => Number.isSafeInteger(row.sourceItemId) && row.sourceItemId > 0,
      );
  }
}
