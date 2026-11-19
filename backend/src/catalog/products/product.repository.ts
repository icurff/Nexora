import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type TransactionClient } from '../../database/prisma.service.js';

type Db = PrismaService | TransactionClient;

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  categories(database: Db = this.prisma) {
    return database.category.findMany();
  }

  category(id: bigint, database: Db = this.prisma) {
    return database.category.findUnique({ where: { id } });
  }

  list(where: Prisma.ProductWhereInput, skip: number, take: number) {
    return this.prisma.product.findMany({
      where,
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.detailsInclude,
    });
  }

  count(where: Prisma.ProductWhereInput) {
    return this.prisma.product.count({ where });
  }

  private publicWhere(search?: string, query?: string): Prisma.ProductWhereInput {
    return {
      status: 'ACTIVE',
      ...(search ? { OR: [
        { nameKey: { contains: search } },
        { category: { name: { contains: query, mode: 'insensitive' } } },
      ] } : {}),
    };
  }

  publicList(skip: number, take: number, search?: string, query?: string) {
    return this.prisma.product.findMany({
      where: this.publicWhere(search, query),
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.detailsInclude,
    });
  }

  publicCount(search?: string, query?: string) {
    return this.prisma.product.count({ where: this.publicWhere(search, query) });
  }

  cartProduct(id: bigint) {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        inventory: true,
        category: { select: { id: true, name: true } },
        images: {
          orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
          include: { imageAsset: true },
        },
        variants: { where: { deletedAt: null }, select: { id: true } },
      },
    });
  }

  cartVariant(id: bigint) {
    return this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        inventory: true,
        product: {
          include: {
            category: { select: { id: true, name: true } },
            images: {
              orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
              include: { imageAsset: true },
            },
          },
        },
        images: {
          orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
          include: { imageAsset: true },
        },
      },
    });
  }

  cartVariants(ids: bigint[]) {
    return this.prisma.productVariant.findMany({
      where: { id: { in: ids } },
      include: {
        inventory: true,
        product: {
          include: {
            category: { select: { id: true, name: true } },
            images: {
              orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
              include: { imageAsset: true },
            },
          },
        },
        images: {
          orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
          include: { imageAsset: true },
        },
      },
    });
  }

  byId(id: bigint, database: Db = this.prisma) {
    return database.product.findUnique({ where: { id }, include: this.detailsInclude });
  }

  private readonly detailsInclude = {
    category: { select: { id: true, name: true, parentId: true } },
    inventory: true,
    variants: { where: { deletedAt: null }, orderBy: { id: 'asc' as const }, include: { inventory: true } },
    images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }], include: { imageAsset: true } },
  } satisfies Prisma.ProductInclude;

  async lockInventory(variantId: bigint, transaction: TransactionClient) {
    await transaction.$queryRaw`SELECT variant_id FROM inventory WHERE variant_id = ${variantId} FOR UPDATE`;
    return transaction.inventory.findUnique({ where: { variantId } });
  }
}
