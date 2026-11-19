import { describe, expect, it, vi } from 'vitest';
import { ProductRepository } from './product.repository.js';
import { ProductService } from './product.service.js';

describe('public product search', () => {
  it('applies the same ACTIVE and search conditions to results and count', async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const repository = new ProductRepository(prisma as never);
    const service = new ProductService(repository, {} as never);
    await service.publicList(2, 20, 'Điện thoại');
    const list = prisma.product.findMany.mock.calls[0][0] as {
      where: unknown;
      skip: number;
      take: number;
    };
    const count = prisma.product.count.mock.calls[0][0] as { where: unknown };
    expect(list.where).toEqual(count.where);
    expect(list.where).toEqual({
      status: 'ACTIVE',
      OR: [
        { nameKey: { contains: 'dien thoai' } },
        { category: { name: { contains: 'Điện thoại', mode: 'insensitive' } } },
      ],
    });
    expect(list.skip).toBe(20);
    expect(list.take).toBe(20);
  });

  it('filters public results and counts by the selected category and descendants', async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      category: {
        findMany: vi.fn().mockResolvedValue([
          { id: 1n, parentId: null },
          { id: 2n, parentId: 1n },
          { id: 3n, parentId: 2n },
          { id: 4n, parentId: null },
        ]),
      },
    };
    const service = new ProductService(
      new ProductRepository(prisma as never),
      {} as never,
    );
    await service.publicList(1, 20, undefined, '1');
    const list = prisma.product.findMany.mock.calls[0][0] as { where: unknown };
    const count = prisma.product.count.mock.calls[0][0] as { where: unknown };
    expect(list.where).toEqual({
      status: 'ACTIVE',
      categoryId: { in: [1n, 2n, 3n] },
    });
    expect(count.where).toEqual(list.where);
  });
});
