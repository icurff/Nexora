import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { Category as CategoryRow } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './category.dto.js';
import { CategoryRepository } from './category.repository.js';

function normalizedName(name: string) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function slugFromName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (letter) => (letter === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150)
    .replace(/-+$/g, '');
}

function toResponse(row: CategoryRow) {
  return {
    id: row.id.toString(),
    name: row.name,
    slug: row.slug,
    parentId: row.parentId?.toString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CategoryService {
  constructor(
    private readonly repository: CategoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list() {
    const rows = await this.repository.list();
    return { items: rows.map(toResponse) };
  }

  async get(id: string) {
    const categoryId = this.parseId(id);
    const row = await this.repository.byId(categoryId);
    if (!row) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    return toResponse(row);
  }

  async create(input: CreateCategoryDto) {
    return this.prisma.transaction(async (transaction) => {
      const name = input.name.normalize('NFC').trim().replace(/\s+/gu, ' ');
      const slug = input.slug || slugFromName(name);
      if (!slug)
        throw new BadRequestException({ code: 'CATEGORY_SLUG_REQUIRED' });
      await this.assertParent(input.parentId, undefined, transaction);
      try {
        const row = await this.repository.create(
          {
            name,
            nameKey: normalizedName(name),
            slug,
            parent: input.parentId
              ? { connect: { id: this.parseId(input.parentId) } }
              : undefined,
          },
          transaction,
        );
        return toResponse(row);
      } catch (error) {
        this.translatePrismaError(error);
      }
    });
  }

  async update(id: string, input: UpdateCategoryDto) {
    const categoryId = this.parseId(id);
    return this.prisma.transaction(async (transaction) => {
      const current = await this.repository.byId(categoryId, transaction);
      if (!current) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      const parentIdWasProvided = Object.hasOwn(input, 'parentId');
      const requestedParentId = input.parentId ?? null;
      const parentChanged =
        parentIdWasProvided &&
        requestedParentId !== (current.parentId?.toString() ?? null);
      if (parentChanged)
        await this.assertParent(input.parentId, categoryId, transaction);

      const name = input.name
        ? input.name.normalize('NFC').trim().replace(/\s+/gu, ' ')
        : undefined;
      const data: Prisma.CategoryUpdateInput = {
        ...(name ? { name, nameKey: normalizedName(name) } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(parentIdWasProvided
          ? input.parentId
            ? { parent: { connect: { id: this.parseId(input.parentId) } } }
            : { parent: { disconnect: true } }
          : {}),
      };
      try {
        const row = await this.repository.update(categoryId, data, transaction);
        return toResponse(row);
      } catch (error) {
        this.translatePrismaError(error);
      }
    });
  }

  private async assertParent(
    parentId: string | null | undefined,
    categoryId: bigint | undefined,
    transaction: TransactionClient,
  ) {
    if (!parentId) return;
    const id = this.parseId(parentId);
    const visited = new Set<bigint>();
    let cursor: CategoryRow | null = await this.repository.byId(
      id,
      transaction,
    );
    if (!cursor)
      throw new NotFoundException({ code: 'CATEGORY_PARENT_NOT_FOUND' });
    while (cursor) {
      if (categoryId !== undefined && cursor.id === categoryId)
        throw new BadRequestException({ code: 'CATEGORY_CYCLE' });
      if (visited.has(cursor.id))
        throw new BadRequestException({ code: 'CATEGORY_TREE_INVALID' });
      visited.add(cursor.id);
      cursor = cursor.parentId
        ? await this.repository.byId(cursor.parentId, transaction)
        : null;
    }
  }

  private parseId(id: string) {
    if (!/^[1-9]\d*$/.test(id))
      throw new BadRequestException({ code: 'INVALID_CATEGORY_ID' });
    try {
      return BigInt(id);
    } catch {
      throw new BadRequestException({ code: 'INVALID_CATEGORY_ID' });
    }
  }

  private translatePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002')
        throw new ConflictException({ code: 'CATEGORY_ALREADY_EXISTS' });
      if (error.code === 'P2003' || error.code === 'P2025')
        throw new ConflictException({ code: 'CATEGORY_REFERENCE_CONFLICT' });
    }
    throw error;
  }
}
