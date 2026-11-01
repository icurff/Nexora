import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CreateCategoryDto, UpdateCategoryDto } from './category.dto.js';
import { CategoryService } from './category.service.js';
import type { CategoryRepository } from './category.repository.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { Category } from '../../generated/prisma/client.js';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe('Category classification contract', () => {
  it.each([CreateCategoryDto, UpdateCategoryDto])(
    'does not accept product SKU options on Category %s',
    async (metatype) => {
      await expect(
        pipe.transform(
          {
            name: 'Clothing',
            optionConfig: { options: [{ code: 'size', label: 'Size' }] },
          },
          { type: 'body', metatype },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

const row: Category = {
  id: 9007199254740993n,
  name: 'Clothing',
  nameKey: 'clothing',
  slug: 'clothing',
  parentId: null,
  isActive: true,
  legacyOptionConfig: {
    options: { color: { label: 'Color' }, size: { label: 'Size' } },
  },
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
};

function setup() {
  let stored = { ...row };
  const repository = {
    list: vi.fn(() => Promise.resolve([stored])),
    byId: vi.fn(() => Promise.resolve(stored)),
    create: vi.fn((data: Partial<Category>) => {
      stored = { ...stored, ...data };
      return Promise.resolve(stored);
    }),
    update: vi.fn((_id: bigint, data: Partial<Category>) => {
      stored = { ...stored, ...data };
      return Promise.resolve(stored);
    }),
  };
  const transaction = {};
  const prisma = {
    transaction: <T>(work: (tx: object) => Promise<T>) => work(transaction),
  };
  const service = new CategoryService(
    repository as unknown as CategoryRepository,
    prisma as unknown as PrismaService,
  );
  return { service, repository };
}

describe('Category service classification behavior', () => {
  it('returns category fields and string IDs without SKU configuration', async () => {
    const { service } = setup();
    const { items } = await service.list();
    expect(items[0].id).toBe('9007199254740993');
    expect(items[0].name).toBe('Clothing');
    expect(items[0]).not.toHaveProperty('optionConfig');
    expect(items[0]).not.toHaveProperty('attributeConfig');
  });

  it('creates a category without SKU configuration', async () => {
    const { service, repository } = setup();
    const created = await service.create({ name: 'Clothing' });
    expect(created?.name).toBe('Clothing');
    expect(repository.create.mock.calls[0][0]).not.toHaveProperty(
      'legacyOptionConfig',
    );
  });

  it('updates category classification fields without changing legacy config', async () => {
    const { service, repository } = setup();
    const updated = await service.update(row.id.toString(), { name: 'Shirts' });
    expect(updated?.name).toBe('Shirts');
    expect(repository.update.mock.calls[0][1]).not.toHaveProperty(
      'legacyOptionConfig',
    );
  });
});
