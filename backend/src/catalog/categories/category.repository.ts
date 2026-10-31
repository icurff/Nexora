import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';

type Db = PrismaService | TransactionClient;

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(database: Db = this.prisma) {
    return database.category.findMany({
      orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
    });
  }

  byId(id: bigint, database: Db = this.prisma) {
    return database.category.findUnique({ where: { id } });
  }

  create(data: Prisma.CategoryCreateInput, transaction: TransactionClient) {
    return transaction.category.create({ data });
  }

  update(
    id: bigint,
    data: Prisma.CategoryUpdateInput,
    transaction: TransactionClient,
  ) {
    return transaction.category.update({ where: { id }, data });
  }
}
