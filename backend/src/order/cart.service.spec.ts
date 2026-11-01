import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CartService } from './cart.service.js';
import type { PrismaService } from '../database/prisma.service.js';

function setup() {
  const prisma = {
    cart: { upsert: vi.fn(), findUnique: vi.fn() },
    cartItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  Object.assign(prisma, {
    transaction: (
      work: (tx: {
        $queryRaw: () => Promise<unknown>;
        cart: typeof prisma.cart;
        cartItem: typeof prisma.cartItem;
      }) => Promise<unknown>,
    ) =>
      work({
        $queryRaw: vi.fn().mockResolvedValue([]),
        cart: prisma.cart,
        cartItem: prisma.cartItem,
      }),
  });
  const catalog = {
    cartVariant: vi.fn(),
    cartVariants: vi.fn(),
    cartProduct: vi.fn(),
    cartProducts: vi.fn(),
  };
  return {
    prisma,
    catalog,
    service: new CartService(
      prisma as unknown as PrismaService,
      catalog as never,
    ),
  };
}

describe('CartService', () => {
  it('adds a product without a SKU as a product-level cart row', async () => {
    const { prisma, service, catalog } = setup();
    prisma.cart.upsert.mockResolvedValueOnce({ id: 4n }).mockResolvedValueOnce({
      id: 4n,
      items: [{ id: 7n, quantity: 2, variantId: null, productId: 11n }],
    });
    prisma.cartItem.findUnique.mockResolvedValue(null);
    catalog.cartProduct.mockResolvedValue({
      id: '11',
      name: 'Túi vải',
      status: 'ACTIVE',
      priceVnd: '50000',
      available: 5,
      category: { id: '2', name: 'Phụ kiện' },
      image: null,
    });
    catalog.cartProducts.mockResolvedValue([
      {
        id: '11',
        name: 'Túi vải',
        status: 'ACTIVE',
        priceVnd: '50000',
        available: 5,
        category: { id: '2', name: 'Phụ kiện' },
        image: null,
      },
    ]);
    catalog.cartVariants.mockResolvedValue([]);

    const result = await service.add('12', { productId: '11' }, 2);

    expect(prisma.cartItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { cartId: 4n, productId: 11n, quantity: 2 },
      }),
    );
    expect(result.items[0]).toMatchObject({
      priceVnd: '50000',
      available: 5,
      variant: null,
    });
  });

  it('rejects an add that would exceed currently available stock', async () => {
    const { prisma, service, catalog } = setup();
    prisma.cart.upsert.mockResolvedValue({ id: 4n });
    prisma.cartItem.findUnique.mockResolvedValue({ quantity: 3 });
    catalog.cartVariant.mockResolvedValue({
      id: '8',
      deleted: false,
      product: { status: 'ACTIVE' },
      available: 4,
    });

    await expect(
      service.add('12', { variantId: '8' }, 2),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('rejects updates to a cart item that belongs to another account', async () => {
    const { prisma, service } = setup();
    prisma.cart.findUnique.mockResolvedValue({ id: 4n });
    prisma.cartItem.findFirst.mockResolvedValue(null);

    await expect(service.setQuantity('12', '99', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it('does not accept zero or fractional quantities at the DTO boundary', async () => {
    const { AddCartItemDto, UpdateCartItemDto } = await import('./cart.dto.js');
    const { BadRequestException, ValidationPipe } =
      await import('@nestjs/common');
    const pipe = new ValidationPipe({ transform: true, whitelist: true });

    for (const [metatype, body] of [
      [AddCartItemDto, { variantId: '1', quantity: 0 }],
      [UpdateCartItemDto, { quantity: 1.5 }],
    ] as const) {
      await expect(
        pipe.transform(body, { type: 'body', metatype }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });
});
