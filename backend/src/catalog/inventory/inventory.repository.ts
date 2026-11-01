import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';

export type InventoryListFilters = {
  q?: string;
  categoryIds?: bigint[];
  status?: 'ACTIVE' | 'INACTIVE';
  availability?: 'IN_STOCK' | 'OUT_OF_STOCK';
  productId?: bigint;
};

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: InventoryListFilters, skip: number, take: number) {
    const conditions: Prisma.Sql[] = [Prisma.sql`v.deleted_at IS NULL`];
    if (filters.q) {
      const q = filters.q
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, (c) => (c === 'Đ' ? 'D' : 'd'))
        .toLocaleLowerCase('vi')
        .trim();
      conditions.push(
        Prisma.sql`(p.name_key LIKE ${`%${q}%`} OR v.sku ILIKE ${`%${filters.q}%`})`,
      );
    }
    if (filters.categoryIds)
      conditions.push(
        Prisma.sql`p.category_id IN (${Prisma.join(filters.categoryIds)})`,
      );
    if (filters.status)
      conditions.push(Prisma.sql`p.status = ${filters.status}`);
    if (filters.productId)
      conditions.push(Prisma.sql`p.id = ${filters.productId}`);
    if (filters.availability === 'IN_STOCK')
      conditions.push(Prisma.sql`i.on_hand > i.reserved`);
    if (filters.availability === 'OUT_OF_STOCK')
      conditions.push(Prisma.sql`i.on_hand <= i.reserved`);
    const where = Prisma.join(conditions, ' AND ');
    const [ids, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ variant_id: bigint }>>(
        Prisma.sql`SELECT i.variant_id FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE ${where} ORDER BY i.variant_id DESC LIMIT ${take} OFFSET ${skip}`,
      ),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT COUNT(*)::bigint AS total FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE ${where}`,
      ),
    ]);
    if (!ids.length)
      return { items: [], total: Number(totalRows[0]?.total ?? 0) };
    const order = new Map(
      ids.map((row, index) => [row.variant_id.toString(), index]),
    );
    const rows = await this.prisma.inventory.findMany({
      where: { variantId: { in: ids.map((row) => row.variant_id) } },
      include: {
        variant: {
          include: {
            product: {
              include: { category: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });
    rows.sort(
      (a, b) =>
        order.get(a.variantId.toString())! - order.get(b.variantId.toString())!,
    );
    return { items: rows, total: Number(totalRows[0]?.total ?? 0) };
  }

  categories() {
    return this.prisma.category.findMany({
      select: { id: true, parentId: true },
    });
  }

  variant(
    variantId: bigint,
    database: PrismaService | TransactionClient = this.prisma,
  ) {
    return database.productVariant.findUnique({
      where: { id: variantId },
      include: {
        inventory: true,
        product: {
          include: { category: { select: { id: true, name: true } } },
        },
      },
    });
  }

  async lockProduct(productId: bigint, tx: TransactionClient) {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
  }

  async lockVariant(variantId: bigint, tx: TransactionClient) {
    await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId} FOR UPDATE`;
  }

  async lockInventory(variantId: bigint, tx: TransactionClient) {
    await tx.$queryRaw`SELECT variant_id FROM inventory WHERE variant_id = ${variantId} FOR UPDATE`;
    return tx.inventory.findUnique({ where: { variantId } });
  }
}
