import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ProductService } from '../catalog/products/product.service.js';
import type { AddCartItemDto } from './cart.dto.js';

const cartInclude = { items: { orderBy: { id: 'asc' as const } } };
type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductService,
  ) {}

  private async loadCart(userId: string) {
    if (!/^[1-9]\d*$/.test(userId))
      throw new BadRequestException({ code: 'INVALID_USER_ID' });
    return this.prisma.cart.upsert({
      where: { userId: BigInt(userId) },
      create: { userId: BigInt(userId) },
      update: {},
      include: cartInclude,
    });
  }

  async get(userId: string) {
    return this.mapCart(await this.loadCart(userId));
  }

  async add(
    userId: string,
    target: Pick<AddCartItemDto, 'variantId' | 'productId'>,
    quantity: number,
  ) {
    if (Boolean(target.variantId) === Boolean(target.productId))
      throw new BadRequestException({ code: 'CART_ITEM_TARGET_INVALID' });
    const cart = await this.prisma.cart.upsert({
      where: { userId: BigInt(userId) },
      create: { userId: BigInt(userId) },
      update: {},
      select: { id: true },
    });

    await this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE`;
      if (target.variantId) {
        const variant = await this.catalog.cartVariant(target.variantId);
        if (!variant || variant.deleted || variant.product.status !== 'ACTIVE')
          throw new ConflictException({ code: 'SKU_NOT_SELLABLE' });
        const current = await tx.cartItem.findUnique({
          where: {
            cartId_variantId: {
              cartId: cart.id,
              variantId: BigInt(target.variantId),
            },
          },
        });
        const nextQuantity = (current?.quantity ?? 0) + quantity;
        if (nextQuantity > variant.available)
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            available: variant.available,
          });
        await tx.cartItem.upsert({
          where: {
            cartId_variantId: {
              cartId: cart.id,
              variantId: BigInt(target.variantId),
            },
          },
          create: {
            cartId: cart.id,
            variantId: BigInt(target.variantId),
            quantity,
          },
          update: { quantity: { increment: quantity } },
        });
      } else {
        const product = await this.catalog.cartProduct(target.productId!);
        if (!product || product.status !== 'ACTIVE' || product.hasSkus)
          throw new ConflictException({ code: 'PRODUCT_NOT_SELLABLE' });
        if (product.priceVnd === null)
          throw new ConflictException({ code: 'PRODUCT_NEEDS_PRICE' });
        const current = await tx.cartItem.findUnique({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: BigInt(target.productId!),
            },
          },
        });
        const nextQuantity = (current?.quantity ?? 0) + quantity;
        if (nextQuantity > product.available)
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            available: product.available,
          });
        await tx.cartItem.upsert({
          where: {
            cartId_productId: {
              cartId: cart.id,
              productId: BigInt(target.productId!),
            },
          },
          create: {
            cartId: cart.id,
            productId: BigInt(target.productId!),
            quantity,
          },
          update: { quantity: { increment: quantity } },
        });
      }
    });
    return this.get(userId);
  }

  async setQuantity(userId: string, itemId: string, quantity: number) {
    await this.prisma.transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: BigInt(userId) },
        select: { id: true },
      });
      if (!cart) throw new NotFoundException({ code: 'CART_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE`;
      const item = await this.ownedItem(userId, itemId, tx);
      if (quantity > item.quantity) {
        if (item.variantId) {
          const target = await this.catalog.cartVariant(
            item.variantId.toString(),
          );
          const available = target?.available ?? 0;
          if (
            !target ||
            target.deleted ||
            target.product.status !== 'ACTIVE' ||
            quantity > available
          )
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              available,
            });
        } else {
          const target = await this.catalog.cartProduct(
            item.productId!.toString(),
          );
          const available = target?.available ?? 0;
          if (
            !target ||
            target.status !== 'ACTIVE' ||
            target.hasSkus ||
            quantity > available
          )
            throw new ConflictException({
              code: 'INSUFFICIENT_STOCK',
              available,
            });
        }
      }
      await tx.cartItem.update({ where: { id: item.id }, data: { quantity } });
    });
    return this.get(userId);
  }

  async remove(userId: string, itemId: string) {
    await this.prisma.transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId: BigInt(userId) },
        select: { id: true },
      });
      if (!cart) throw new NotFoundException({ code: 'CART_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE`;
      const item = await this.ownedItem(userId, itemId, tx);
      await tx.cartItem.delete({ where: { id: item.id } });
    });
    return this.get(userId);
  }

  private async ownedItem(
    userId: string,
    itemId: string,
    database: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (!/^[1-9]\d*$/.test(itemId))
      throw new BadRequestException({ code: 'INVALID_CART_ITEM_ID' });
    const item = await database.cartItem.findFirst({
      where: { id: BigInt(itemId), cart: { userId: BigInt(userId) } },
    });
    if (!item) throw new NotFoundException({ code: 'CART_ITEM_NOT_FOUND' });
    return item;
  }

  private async mapCart(cart: CartRecord) {
    const variantIds = cart.items.flatMap((item) =>
      item.variantId ? [item.variantId.toString()] : [],
    );
    const productIds = cart.items.flatMap((item) =>
      item.productId ? [item.productId.toString()] : [],
    );
    const [variants, products] = await Promise.all([
      this.catalog.cartVariants(variantIds),
      this.catalog.cartProducts(productIds),
    ]);
    const variantMap = new Map(variants.map((row) => [row.id, row]));
    const productMap = new Map(products.map((row) => [row.id, row]));
    return {
      id: cart.id.toString(),
      items: cart.items.map(({ id, quantity, variantId, productId }) => {
        if (variantId) {
          const variant = variantMap.get(variantId.toString());
          if (!variant) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
          const available = variant.available;
          const sellable =
            !variant.deleted && variant.product.status === 'ACTIVE';
          const unavailableReason = !sellable
            ? 'UNAVAILABLE'
            : available === 0
              ? 'OUT_OF_STOCK'
              : quantity > available
                ? 'INSUFFICIENT_STOCK'
                : null;
          return {
            id: id.toString(),
            quantity,
            priceVnd: variant.priceVnd,
            available,
            variant: {
              id: variant.id,
              sku: variant.sku,
              options: variant.options,
              optionLabels: variant.optionLabels,
            },
            product: { ...variant.product, image: variant.image },
            unavailableReason,
          };
        }
        const product = productMap.get(productId!.toString());
        if (!product)
          throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
        const available = product.available;
        const unavailableReason =
          product.status !== 'ACTIVE'
            ? 'UNAVAILABLE'
            : product.hasSkus
              ? 'SKU_SELECTION_REQUIRED'
              : available === 0
                ? 'OUT_OF_STOCK'
                : quantity > available
                  ? 'INSUFFICIENT_STOCK'
                  : null;
        return {
          id: id.toString(),
          quantity,
          priceVnd: product.priceVnd ?? '0',
          available,
          variant: null,
          product,
          unavailableReason,
        };
      }),
    };
  }
}
