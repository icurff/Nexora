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
    const skuConditions: Prisma.Sql[] = [Prisma.sql`v.deleted_at IS NULL`];
    const productConditions: Prisma.Sql[] = [
      Prisma.sql`NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL)`,
    ];
    if (filters.q) {
      const q = filters.q
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, (c) => (c === 'Đ' ? 'D' : 'd'))
        .toLocaleLowerCase('vi')
        .trim();
      skuConditions.push(
        Prisma.sql`(p.name_key LIKE ${`%${q}%`} OR v.sku ILIKE ${`%${filters.q}%`})`,
      );
      productConditions.push(Prisma.sql`p.name_key LIKE ${`%${q}%`}`);
    }
    if (filters.categoryIds) {
      const categoryFilter = Prisma.sql`p.category_id IN (${Prisma.join(filters.categoryIds)})`;
      skuConditions.push(categoryFilter);
      productConditions.push(categoryFilter);
    }
    if (filters.status) {
      const statusFilter = Prisma.sql`p.status = ${filters.status}`;
      skuConditions.push(statusFilter);
      productConditions.push(statusFilter);
    }
    if (filters.productId) {
      const productFilter = Prisma.sql`p.id = ${filters.productId}`;
      skuConditions.push(productFilter);
      productConditions.push(productFilter);
    }
    if (filters.availability === 'IN_STOCK') {
      skuConditions.push(Prisma.sql`i.on_hand > i.reserved`);
      productConditions.push(Prisma.sql`pi.on_hand > pi.reserved`);
    }
    if (filters.availability === 'OUT_OF_STOCK') {
      skuConditions.push(Prisma.sql`i.on_hand <= i.reserved`);
      productConditions.push(Prisma.sql`pi.on_hand <= pi.reserved`);
    }
    const skuWhere = Prisma.join(skuConditions, ' AND ');
    const productWhere = Prisma.join(productConditions, ' AND ');
    const [ids, totalRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ kind: 'SKU' | 'PRODUCT'; id: bigint }>>(
        Prisma.sql`SELECT kind, id FROM (SELECT 'SKU'::text AS kind, i.variant_id AS id FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE ${skuWhere} UNION ALL SELECT 'PRODUCT'::text AS kind, pi.product_id AS id FROM product_inventory pi JOIN products p ON p.id = pi.product_id WHERE ${productWhere}) rows ORDER BY id DESC, kind ASC LIMIT ${take} OFFSET ${skip}`,
      ),
      this.prisma.$queryRaw<Array<{ total: bigint }>>(
        Prisma.sql`SELECT COUNT(*)::bigint AS total FROM (SELECT i.variant_id AS id FROM inventory i JOIN product_variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id WHERE ${skuWhere} UNION ALL SELECT pi.product_id AS id FROM product_inventory pi JOIN products p ON p.id = pi.product_id WHERE ${productWhere}) rows`,
      ),
    ]);
    if (!ids.length)
      return { items: [], total: Number(totalRows[0]?.total ?? 0) };
    const skuIds = ids.filter((row) => row.kind === 'SKU').map((row) => row.id);
    const productIds = ids
      .filter((row) => row.kind === 'PRODUCT')
      .map((row) => row.id);
    const [skuRows, productRows] = await Promise.all([
      this.prisma.inventory.findMany({
        where: { variantId: { in: skuIds } },
        include: {
          variant: {
            include: {
              product: {
                include: { category: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      this.prisma.productInventory.findMany({
        where: { productId: { in: productIds } },
        include: {
          product: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
      }),
    ]);
    const skuById = new Map(
      skuRows.map((row) => [row.variantId.toString(), row]),
    );
    const productById = new Map(
      productRows.map((row) => [row.productId.toString(), row]),
    );
    const items: Array<
      | { kind: 'SKU'; row: (typeof skuRows)[number] }
      | { kind: 'PRODUCT'; row: (typeof productRows)[number] }
    > = [];
    for (const row of ids) {
      const id = row.id.toString();
      if (row.kind === 'SKU') {
        const item = skuById.get(id);
        if (item) items.push({ kind: 'SKU', row: item });
      } else {
        const item = productById.get(id);
        if (item) items.push({ kind: 'PRODUCT', row: item });
      }
    }
    return { items, total: Number(totalRows[0]?.total ?? 0) };
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
