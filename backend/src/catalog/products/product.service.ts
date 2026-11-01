import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../../database/prisma.service.js';
import type {
  AddProductImagesDto,
  CreateProductDto,
  ProductImageInputDto,
  ProductListQueryDto,
  ProductOptionConfigDto,
  UpdateProductDto,
  UpdateProductImageDto,
  UpdateVariantDto,
  VariantInputDto,
} from './product.dto.js';
import { ProductRepository } from './product.repository.js';

const include = {
  category: { select: { id: true, name: true, parentId: true } },
  inventory: true,
  variants: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' as const },
    include: { inventory: true },
  },
  images: {
    orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }],
    include: { imageAsset: true },
  },
} satisfies Prisma.ProductInclude;
type ProductDetails = Prisma.ProductGetPayload<{ include: typeof include }>;
type CartVariantRow = NonNullable<
  Awaited<ReturnType<ProductRepository['cartVariant']>>
>;
export type CheckoutSelection = {
  cartItemId: bigint;
  productId: bigint;
  variantId: bigint | null;
  quantity: number;
};

function checkoutOptionSnapshot(
  config: Prisma.JsonValue,
  options: Prisma.JsonValue,
): Prisma.InputJsonObject {
  if (!options || typeof options !== 'object' || Array.isArray(options))
    return {};
  const configOptions =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, Prisma.JsonValue>).options
      : undefined;
  return Object.fromEntries(
    Object.entries(options).map(([code, value]) => {
      const item =
        configOptions &&
        typeof configOptions === 'object' &&
        !Array.isArray(configOptions)
          ? (configOptions as Record<string, Prisma.JsonValue>)[code]
          : undefined;
      const label =
        item && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, Prisma.JsonValue>).label
          : undefined;
      return [
        code,
        {
          label: typeof label === 'string' ? label : code,
          value:
            typeof value === 'string' ? value : (JSON.stringify(value) ?? ''),
        },
      ];
    }),
  );
}

function storedOptionConfig(
  config: ProductOptionConfigDto,
): Prisma.InputJsonObject {
  return {
    options: Object.fromEntries(
      config.options.map(({ code, label }) => [code, { label }]),
    ),
  };
}

function optionConfigResponse(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { options: [] };
  const options = (value as Record<string, Prisma.JsonValue>).options;
  if (!options || typeof options !== 'object' || Array.isArray(options))
    return { options: [] };
  return {
    options: Object.entries(options).flatMap(([code, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        return [];
      const label = (entry as Record<string, Prisma.JsonValue>).label;
      return typeof label === 'string' ? [{ code, label }] : [];
    }),
  };
}

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'Đ' ? 'D' : 'd'))
    .toLocaleLowerCase('vi')
    .trim()
    .replace(/\s+/g, ' ');
}
function parseId(value: string, code = 'INVALID_ID') {
  if (!/^[1-9]\d*$/.test(value)) throw new BadRequestException({ code });
  try {
    return BigInt(value);
  } catch {
    throw new BadRequestException({ code });
  }
}
function response(product: ProductDetails) {
  return {
    id: product.id.toString(),
    name: product.name,
    description: product.description,
    category: {
      id: product.category.id.toString(),
      name: product.category.name,
    },
    categoryId: product.categoryId.toString(),
    status: product.status,
    priceVnd: product.priceVnd?.toString() ?? null,
    onHand: product.inventory?.onHand ?? 0,
    optionConfig: optionConfigResponse(product.optionConfig),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map((v) => ({
      id: v.id.toString(),
      sku: v.sku,
      options: v.options,
      priceVnd: v.priceVnd.toString(),
    })),
    images: product.images.map((i) => ({
      id: i.id.toString(),
      imageAssetId: i.imageAssetId.toString(),
      variantId: i.variantId?.toString() ?? null,
      altText: i.altText,
      sortOrder: i.sortOrder,
      isPrimary: i.isPrimary,
      contentType: i.imageAsset.contentType,
      url: i.imageAsset.publicUrl,
    })),
  };
}

@Injectable()
export class ProductService {
  constructor(
    private readonly repository: ProductRepository,
    private readonly prisma: PrismaService,
  ) {}

  async reserveForOrder(
    tx: TransactionClient,
    selections: CheckoutSelection[],
  ) {
    const productIds = [
      ...new Set(selections.map((item) => item.productId)),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const variantIds = [
      ...new Set(
        selections.flatMap((item) => (item.variantId ? [item.variantId] : [])),
      ),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const id of productIds)
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    for (const id of variantIds)
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${id} FOR UPDATE`;
    for (const id of productIds)
      await tx.$queryRaw`SELECT product_id FROM product_inventory WHERE product_id = ${id} FOR UPDATE`;
    for (const id of variantIds)
      await tx.$queryRaw`SELECT variant_id FROM inventory WHERE variant_id = ${id} FOR UPDATE`;
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: {
        inventory: true,
        variants: { where: { deletedAt: null }, include: { inventory: true } },
        images: {
          where: { isPrimary: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
          include: { imageAsset: true },
        },
      },
    });
    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );
    const variantMap = new Map(
      products
        .flatMap((product) => product.variants)
        .map((variant) => [variant.id, variant]),
    );
    const result = [];
    for (const selection of selections) {
      const product = productMap.get(selection.productId);
      if (!product || product.status !== 'ACTIVE')
        throw new ConflictException({ code: 'PRODUCT_NOT_SELLABLE' });
      let unitPrice: bigint;
      let sku: string | null = null;
      let options: Prisma.InputJsonObject = {};
      let variantId: bigint | null = null;
      const image = product.images[0]?.imageAsset.publicUrl ?? null;
      if (selection.variantId) {
        const variant = variantMap.get(selection.variantId);
        if (
          !variant ||
          variant.productId !== product.id ||
          variant.deletedAt ||
          !variant.inventory
        )
          throw new ConflictException({ code: 'SKU_NOT_SELLABLE' });
        const current = variant.inventory;
        if (selection.quantity > current.onHand - current.reserved)
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            available: Math.max(0, current.onHand - current.reserved),
          });
        await tx.inventory.update({
          where: { variantId: variant.id },
          data: {
            reserved: { increment: selection.quantity },
            version: { increment: 1n },
          },
        });
        unitPrice = variant.priceVnd;
        sku = variant.sku;
        options = checkoutOptionSnapshot(product.optionConfig, variant.options);
        variantId = variant.id;
      } else {
        if (
          product.variants.length ||
          product.priceVnd === null ||
          !product.inventory
        )
          throw new ConflictException({ code: 'PRODUCT_NOT_SELLABLE' });
        const current = product.inventory;
        if (selection.quantity > current.onHand - current.reserved)
          throw new ConflictException({
            code: 'INSUFFICIENT_STOCK',
            available: Math.max(0, current.onHand - current.reserved),
          });
        await tx.productInventory.update({
          where: { productId: product.id },
          data: {
            reserved: { increment: selection.quantity },
            version: { increment: 1n },
          },
        });
        unitPrice = product.priceVnd;
      }
      result.push({
        cartItemId: selection.cartItemId,
        productId: product.id,
        variantId,
        productName: product.name,
        sku,
        options,
        imageUrl: image,
        unitPrice,
        quantity: selection.quantity,
      });
    }
    return result;
  }

  async releaseOrderReservation(
    tx: TransactionClient,
    lines: Array<{
      productId: bigint;
      variantId: bigint | null;
      quantity: number;
    }>,
  ) {
    const productIds = [...new Set(lines.map((line) => line.productId))].sort(
      (a, b) => (a < b ? -1 : a > b ? 1 : 0),
    );
    const variantIds = [
      ...new Set(
        lines.flatMap((line) => (line.variantId ? [line.variantId] : [])),
      ),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const id of productIds)
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    for (const id of variantIds)
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${id} FOR UPDATE`;
    for (const id of productIds)
      await tx.$queryRaw`SELECT product_id FROM product_inventory WHERE product_id = ${id} FOR UPDATE`;
    for (const id of variantIds)
      await tx.$queryRaw`SELECT variant_id FROM inventory WHERE variant_id = ${id} FOR UPDATE`;
    for (const line of lines) {
      if (line.variantId) {
        const current = await tx.inventory.findUnique({
          where: { variantId: line.variantId },
        });
        if (!current || current.reserved < line.quantity)
          throw new ConflictException({ code: 'ORDER_RESERVATION_MISMATCH' });
        await tx.inventory.update({
          where: { variantId: line.variantId },
          data: {
            reserved: { decrement: line.quantity },
            version: { increment: 1n },
          },
        });
      } else {
        const current = await tx.productInventory.findUnique({
          where: { productId: line.productId },
        });
        if (!current || current.reserved < line.quantity)
          throw new ConflictException({ code: 'ORDER_RESERVATION_MISMATCH' });
        await tx.productInventory.update({
          where: { productId: line.productId },
          data: {
            reserved: { decrement: line.quantity },
            version: { increment: 1n },
          },
        });
      }
    }
  }

  async cartVariant(id: string) {
    if (!/^[1-9]\d*$/.test(id)) return null;
    const variant = await this.repository.cartVariant(BigInt(id));
    if (!variant) return null;
    return this.mapCartVariant(variant);
  }

  async cartProduct(id: string) {
    if (!/^[1-9]\d*$/.test(id)) return null;
    const product = await this.repository.cartProduct(BigInt(id));
    if (!product) return null;
    const image = product.images
      .filter((row) => row.imageAsset.contentType.startsWith('image/'))
      .sort(
        (a, b) =>
          Number(b.isPrimary) - Number(a.isPrimary) ||
          a.sortOrder - b.sortOrder,
      )[0];
    return {
      id: product.id.toString(),
      name: product.name,
      status: product.status,
      priceVnd: product.priceVnd?.toString() ?? null,
      hasSkus: product.variants.length > 0,
      available: Math.max(
        0,
        (product.inventory?.onHand ?? 0) - (product.inventory?.reserved ?? 0),
      ),
      category: {
        id: product.category.id.toString(),
        name: product.category.name,
      },
      image: image
        ? { url: image.imageAsset.publicUrl, altText: image.altText }
        : null,
    };
  }

  async cartProducts(ids: string[]) {
    const products = await Promise.all(ids.map((id) => this.cartProduct(id)));
    return products.filter((product) => product !== null);
  }

  private mapCartVariant(variant: CartVariantRow) {
    const images = [...variant.images, ...variant.product.images]
      .filter((image) => image.imageAsset.contentType.startsWith('image/'))
      .map((image) => ({
        url: image.imageAsset.publicUrl,
        altText: image.altText,
        isPrimary: image.isPrimary,
        variantSpecific: image.variantId === variant.id,
        sortOrder: image.sortOrder,
      }));
    return {
      id: variant.id.toString(),
      sku: variant.sku,
      options: variant.options as Record<string, string>,
      optionLabels: Object.fromEntries(
        optionConfigResponse(variant.product.optionConfig).options.map(
          (option) => [option.code, option.label],
        ),
      ),
      priceVnd: variant.priceVnd.toString(),
      deleted: Boolean(variant.deletedAt),
      available: Math.max(
        0,
        (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0),
      ),
      product: {
        id: variant.product.id.toString(),
        name: variant.product.name,
        status: variant.product.status,
        category: {
          id: variant.product.category.id.toString(),
          name: variant.product.category.name,
        },
      },
      image:
        images.find((image) => image.variantSpecific && image.isPrimary) ??
        images.find((image) => image.variantSpecific) ??
        images.find((image) => !image.variantSpecific && image.isPrimary) ??
        images.find((image) => !image.variantSpecific) ??
        null,
    };
  }

  async cartVariants(ids: string[]) {
    const validIds = ids
      .filter((id) => /^[1-9]\d*$/.test(id))
      .map((id) => BigInt(id));
    if (!validIds.length) return [];
    const rows = await this.repository.cartVariants(validIds);
    return rows.map((row) => this.mapCartVariant(row));
  }

  async publicList(page = 1, pageSize = 20) {
    const [products, total] = await Promise.all([
      this.repository.publicList((page - 1) * pageSize, pageSize),
      this.repository.publicCount(),
    ]);
    return {
      items: products.map((product) => {
        const sellable = product.variants.filter(
          (variant) => !variant.deletedAt,
        );
        const priceVnd = sellable.reduce<bigint | null>(
          (lowest, variant) =>
            lowest === null || variant.priceVnd < lowest
              ? variant.priceVnd
              : lowest,
          null,
        );
        const images = product.images.map((image) => ({
          id: image.id.toString(),
          variantId: image.variantId?.toString() ?? null,
          altText: image.altText,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
          contentType: image.imageAsset.contentType,
          url: image.imageAsset.publicUrl,
        }));
        return {
          id: product.id.toString(),
          name: product.name,
          description: product.description,
          category: {
            id: product.category.id.toString(),
            name: product.category.name,
          },
          priceVnd: (priceVnd ?? product.priceVnd)?.toString() ?? null,
          available: sellable.length
            ? sellable.reduce(
                (sum, variant) =>
                  sum +
                  Math.max(
                    0,
                    (variant.inventory?.onHand ?? 0) -
                      (variant.inventory?.reserved ?? 0),
                  ),
                0,
              )
            : Math.max(
                0,
                (product.inventory?.onHand ?? 0) -
                  (product.inventory?.reserved ?? 0),
              ),
          image:
            images.find(
              (image) => image.isPrimary && image.variantId === null,
            ) ??
            images.find((image) => image.variantId === null) ??
            images.find((image) => image.contentType.startsWith('image/')) ??
            null,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async publicGet(id: string) {
    if (!/^[1-9]\d*$/.test(id))
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    const product = await this.repository.byId(BigInt(id));
    if (!product || product.status !== 'ACTIVE')
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    return {
      id: product.id.toString(),
      name: product.name,
      description: product.description,
      category: {
        id: product.category.id.toString(),
        name: product.category.name,
      },
      optionConfig: optionConfigResponse(product.optionConfig),
      priceVnd: product.priceVnd?.toString() ?? null,
      available: Math.max(
        0,
        (product.inventory?.onHand ?? 0) - (product.inventory?.reserved ?? 0),
      ),
      variants: product.variants
        .filter((variant) => !variant.deletedAt)
        .map((variant) => ({
          id: variant.id.toString(),
          sku: variant.sku,
          options: variant.options,
          priceVnd: variant.priceVnd.toString(),
          available: Math.max(
            0,
            (variant.inventory?.onHand ?? 0) -
              (variant.inventory?.reserved ?? 0),
          ),
          images: product.images
            .filter((image) => image.variantId === variant.id)
            .map((image) => ({
              id: image.id.toString(),
              altText: image.altText,
              sortOrder: image.sortOrder,
              isPrimary: image.isPrimary,
              contentType: image.imageAsset.contentType,
              url: image.imageAsset.publicUrl,
            })),
        })),
      images: product.images
        .filter((image) => image.variantId === null)
        .map((image) => ({
          id: image.id.toString(),
          altText: image.altText,
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
          contentType: image.imageAsset.contentType,
          url: image.imageAsset.publicUrl,
        })),
    };
  }

  async list(query: ProductListQueryDto) {
    const where: Prisma.ProductWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) where.nameKey = { contains: normalized(query.q) };
    if (query.categoryId) {
      const rootId = parseId(query.categoryId, 'INVALID_CATEGORY_ID');
      const categories = await this.repository.categories();
      if (!categories.some((c) => c.id === rootId))
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      const ids = new Set([rootId.toString()]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of categories)
          if (
            c.parentId &&
            ids.has(c.parentId.toString()) &&
            !ids.has(c.id.toString())
          ) {
            ids.add(c.id.toString());
            changed = true;
          }
      }
      where.categoryId = { in: [...ids].map(BigInt) };
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const [rows, total] = await Promise.all([
      this.repository.list(where, (page - 1) * pageSize, pageSize),
      this.repository.count(where),
    ]);
    return {
      items: rows.map(response),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async get(id: string) {
    const row = await this.repository.byId(parseId(id, 'INVALID_PRODUCT_ID'));
    if (!row) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
    return response(row);
  }

  async create(input: CreateProductDto) {
    return this.prisma.transaction(async (tx) => {
      if (!input.variants.length && (!input.priceVnd || input.priceVnd <= 0))
        throw new BadRequestException({ code: 'PRODUCT_NEEDS_PRICE' });
      if (input.variants.length && input.onHand !== undefined)
        throw new BadRequestException({
          code: 'PRODUCT_STOCK_REQUIRES_NO_SKU',
        });
      const category = await this.assertCategory(
        parseId(input.categoryId, 'INVALID_CATEGORY_ID'),
        tx,
      );
      this.assertVariantSet(
        input.variants,
        storedOptionConfig(input.optionConfig),
      );
      const mediaTypes = await this.assertAssetsExist(input.images, tx);
      this.assertPrimaryImage(input.images, mediaTypes);
      const product = await tx.product.create({
        data: {
          name: input.name,
          nameKey: normalized(input.name),
          description: input.description,
          categoryId: category.id,
          status: 'ACTIVE',
          optionConfig: storedOptionConfig(input.optionConfig),
          priceVnd:
            input.priceVnd === undefined ? null : BigInt(input.priceVnd),
          ...(!input.variants.length
            ? { inventory: { create: { onHand: input.onHand ?? 0 } } }
            : {}),
        },
      });
      for (const variant of input.variants)
        await this.createVariant(product.id, variant, tx);
      await this.createImageLinks(product.id, input.images, tx);
      return response(
        await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include,
        }),
      );
    });
  }

  async update(id: string, input: UpdateProductDto) {
    const productId = parseId(id, 'INVALID_PRODUCT_ID');
    return this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
      const current = await tx.product.findUnique({
        where: { id: productId },
        include,
      });
      if (!current) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const categoryId = input.categoryId
        ? parseId(input.categoryId, 'INVALID_CATEGORY_ID')
        : current.categoryId;
      if (categoryId !== current.categoryId)
        await this.assertCategory(categoryId, tx);
      if (input.status === 'ACTIVE') this.assertSellable(current.images);
      if (
        !current.variants.length &&
        input.priceVnd === undefined &&
        current.priceVnd === null
      )
        throw new BadRequestException({ code: 'PRODUCT_NEEDS_PRICE' });
      return response(
        await tx.product.update({
          where: { id: productId },
          data: {
            ...(input.name !== undefined
              ? { name: input.name, nameKey: normalized(input.name) }
              : {}),
            ...(input.description !== undefined
              ? { description: input.description }
              : {}),
            ...(input.categoryId ? { categoryId } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.priceVnd !== undefined
              ? { priceVnd: BigInt(input.priceVnd) }
              : {}),
          },
          include,
        }),
      );
    });
  }

  async addVariant(productId: string, input: VariantInputDto) {
    return this.prisma.transaction(async (tx) => {
      const id = parseId(productId, 'INVALID_PRODUCT_ID');
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include });
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      if (!product.variants.length && (product.inventory?.onHand ?? 0) > 0)
        throw new ConflictException({
          code: 'PRODUCT_STOCK_MUST_BE_ZERO_BEFORE_ADDING_SKU',
        });
      this.assertVariantSet(
        [
          ...product.variants.map((v) => ({
            options: v.options as Record<string, string>,
          })),
          input,
        ],
        product.optionConfig,
      );
      await this.createVariant(product.id, input, tx);
      return response(
        await tx.product.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }

  async setProductStock(idValue: string, onHand: number) {
    const id = parseId(idValue, 'INVALID_PRODUCT_ID');
    return this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id },
        include: { variants: { where: { deletedAt: null } }, inventory: true },
      });
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      if (product.variants.length)
        throw new ConflictException({ code: 'PRODUCT_HAS_SKUS' });
      if (onHand < (product.inventory?.reserved ?? 0))
        throw new ConflictException({ code: 'STOCK_BELOW_RESERVED' });
      await tx.productInventory.upsert({
        where: { productId: id },
        create: { productId: id, onHand },
        update: { onHand, version: { increment: 1n } },
      });
      return response(
        await tx.product.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }

  async updateVariant(id: string, input: UpdateVariantDto) {
    const variantId = parseId(id, 'INVALID_VARIANT_ID');
    return this.prisma.transaction(async (tx) => {
      const v = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { product: { include }, inventory: true },
      });
      if (!v || v.deletedAt)
        throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId} FOR UPDATE`;
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...(input.priceVnd !== undefined
            ? { priceVnd: BigInt(input.priceVnd) }
            : {}),
        },
      });
      return response(
        await tx.product.findUniqueOrThrow({
          where: { id: v.productId },
          include,
        }),
      );
    });
  }

  async deleteVariant(id: string) {
    const variantId = parseId(id, 'INVALID_VARIANT_ID');
    return this.prisma.transaction(async (tx) => {
      const v = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { inventory: true },
      });
      if (!v || v.deletedAt)
        throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId} FOR UPDATE`;
      const current = await tx.productVariant.findUnique({
        where: { id: variantId },
        include: { inventory: true },
      });
      if (!current || current.deletedAt)
        throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
      const stock = await this.repository.lockInventory(variantId, tx);
      if (stock?.reserved)
        throw new ConflictException({ code: 'SKU_HAS_RESERVED_STOCK' });
      if (stock?.onHand)
        throw new ConflictException({ code: 'SKU_HAS_ON_HAND_STOCK' });
      await tx.productImage.updateMany({
        where: { variantId },
        data: { variantId: null },
      });
      await tx.productVariant.update({
        where: { id: variantId },
        data: { deletedAt: new Date() },
      });
      return { deleted: true };
    });
  }

  async addImages(productId: string, input: AddProductImagesDto) {
    const id = parseId(productId, 'INVALID_PRODUCT_ID');
    return this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const p = await tx.product.findUnique({ where: { id }, include });
      if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const mediaTypes = await this.assertAssetsExist(input.images, tx);
      if (
        input.images.filter((image) => image.isPrimary).length > 1 ||
        input.images.some((image) => image.isPrimary && image.variantId) ||
        input.images.some(
          (image) =>
            image.isPrimary &&
            !mediaTypes.get(image.imageAssetId)?.startsWith('image/'),
        )
      )
        throw new BadRequestException({ code: 'PRODUCT_NEEDS_PRIMARY_IMAGE' });
      if (
        input.images.some((i) => i.isPrimary) &&
        p.images.some((i) => i.isPrimary)
      )
        throw new ConflictException({ code: 'PRIMARY_IMAGE_EXISTS' });
      await this.createImageLinks(id, input.images, tx);
      return response(
        await tx.product.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }

  async updateImage(
    productId: string,
    imageId: string,
    input: UpdateProductImageDto,
  ) {
    const id = parseId(productId, 'INVALID_PRODUCT_ID');
    const linkId = parseId(imageId, 'INVALID_IMAGE_ID');
    return this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include });
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const link = await tx.productImage.findFirst({
        where: { id: linkId, productId: id },
      });
      if (!link)
        throw new NotFoundException({ code: 'PRODUCT_IMAGE_NOT_FOUND' });
      const linkedMedia = product.images.find((image) => image.id === linkId);
      if (
        input.isPrimary &&
        linkedMedia &&
        !linkedMedia.imageAsset.contentType.startsWith('image/')
      )
        throw new BadRequestException({ code: 'PRIMARY_IMAGE_MUST_BE_IMAGE' });
      if (input.isPrimary && link.variantId)
        throw new BadRequestException({ code: 'PRIMARY_IMAGE_MUST_BE_SHARED' });
      if (
        product.status === 'ACTIVE' &&
        input.isPrimary === false &&
        link.isPrimary &&
        product.images.filter((image) => image.id !== linkId && image.isPrimary)
          .length === 0
      )
        throw new ConflictException({ code: 'ACTIVE_PRODUCT_NEEDS_IMAGE' });
      if (input.isPrimary)
        await tx.productImage.updateMany({
          where: { productId: id },
          data: { isPrimary: false },
        });
      await tx.productImage.update({ where: { id: linkId }, data: input });
      return response(
        await tx.product.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }

  async deleteImage(productId: string, imageId: string) {
    const id = parseId(productId, 'INVALID_PRODUCT_ID');
    const linkId = parseId(imageId, 'INVALID_IMAGE_ID');
    return this.prisma.transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const p = await tx.product.findUnique({ where: { id }, include });
      if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const link = p.images.find((i) => i.id === linkId);
      if (!link)
        throw new NotFoundException({ code: 'PRODUCT_IMAGE_NOT_FOUND' });
      if (
        p.status === 'ACTIVE' &&
        link.imageAsset.contentType.startsWith('image/') &&
        link.variantId === null &&
        !p.images.some(
          (image) =>
            image.id !== linkId &&
            image.variantId === null &&
            image.imageAsset.contentType.startsWith('image/'),
        )
      )
        throw new ConflictException({ code: 'ACTIVE_PRODUCT_NEEDS_IMAGE' });
      await tx.productImage.delete({ where: { id: linkId } });
      const nextPrimary = link.isPrimary
        ? p.images.find(
            (i) =>
              i.id !== linkId &&
              i.variantId === null &&
              i.imageAsset.contentType.startsWith('image/'),
          )
        : undefined;
      if (nextPrimary)
        await tx.productImage.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      return response(
        await tx.product.findUniqueOrThrow({ where: { id }, include }),
      );
    });
  }

  private async assertCategory(id: bigint, tx: TransactionClient) {
    const category = await this.repository.category(id, tx);
    if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    const all = await this.repository.categories(tx);
    const byId = new Map(all.map((c) => [c.id.toString(), c]));
    let cursor: typeof category | undefined = category;
    const seen = new Set<string>();
    while (cursor) {
      const key = cursor.id.toString();
      if (seen.has(key))
        throw new BadRequestException({ code: 'CATEGORY_TREE_INVALID' });
      seen.add(key);
      cursor = cursor.parentId
        ? byId.get(cursor.parentId.toString())
        : undefined;
    }
    return category;
  }

  private assertVariantSet(
    variants: Array<{ options: Record<string, string> }>,
    config: Prisma.JsonValue | Prisma.InputJsonObject,
  ) {
    const root =
      config && typeof config === 'object' && !Array.isArray(config)
        ? (config as Record<string, Prisma.JsonValue>)
        : {};
    const optionMap =
      root.options &&
      typeof root.options === 'object' &&
      !Array.isArray(root.options)
        ? (root.options as Record<string, Prisma.JsonValue>)
        : {};
    const codes = Object.keys(optionMap).sort();
    const combos = new Set<string>();
    for (const variant of variants) {
      const options = variant.options;
      if (!options || typeof options !== 'object' || Array.isArray(options))
        throw new BadRequestException({ code: 'SKU_OPTIONS_INVALID' });
      const variantCodes = Object.keys(options).sort();
      if (
        variantCodes.join('\0') !== codes.join('\0') ||
        Object.values(options).some(
          (value) => typeof value !== 'string' || !value.trim(),
        )
      )
        throw new BadRequestException({ code: 'SKU_OPTIONS_INVALID' });
      const combo = variantCodes
        .map((code) => `${normalized(code)}=${normalized(options[code])}`)
        .join('|');
      if (combos.has(combo))
        throw new ConflictException({ code: 'SKU_OPTIONS_DUPLICATE' });
      combos.add(combo);
    }
  }

  private assertSellable(images: ProductDetails['images']) {
    if (
      !images.length ||
      !images.some(
        (image) =>
          image.isPrimary && image.imageAsset.contentType.startsWith('image/'),
      )
    )
      throw new BadRequestException({ code: 'PRODUCT_NEEDS_IMAGE' });
  }
  private async assertAssetsExist(
    images: ProductImageInputDto[],
    tx: TransactionClient,
  ) {
    const ids = images.map((i) =>
      parseId(i.imageAssetId, 'INVALID_IMAGE_ASSET_ID'),
    );
    const assets = await tx.imageAsset.findMany({ where: { id: { in: ids } } });
    if (assets.length !== ids.length)
      throw new BadRequestException({ code: 'IMAGE_ASSET_NOT_FOUND' });
    return new Map(
      assets.map((asset) => [asset.id.toString(), asset.contentType]),
    );
  }
  private assertPrimaryImage(
    images: ProductImageInputDto[],
    mediaTypes: Map<string, string>,
  ) {
    if (
      images.filter((i) => i.isPrimary).length !== 1 ||
      images.some(
        (image) =>
          image.isPrimary &&
          (image.variantId ||
            !mediaTypes.get(image.imageAssetId)?.startsWith('image/')),
      )
    )
      throw new BadRequestException({ code: 'PRODUCT_NEEDS_PRIMARY_IMAGE' });
  }
  private async createVariant(
    productId: bigint,
    input: VariantInputDto,
    tx: TransactionClient,
  ) {
    const v = await tx.productVariant.create({
      data: {
        productId,
        sku: `NEW-${randomUUID()}`,
        options: input.options,
        priceVnd: BigInt(input.priceVnd),
        inventory: { create: { onHand: input.onHand ?? 0, reserved: 0 } },
      },
    });
    await tx.productVariant.update({
      where: { id: v.id },
      data: { sku: `SKU-${v.id.toString().padStart(10, '0')}` },
    });
  }
  private async createImageLinks(
    productId: bigint,
    images: ProductImageInputDto[],
    tx: TransactionClient,
  ) {
    for (const image of images) {
      const variantId = image.variantId
        ? parseId(image.variantId, 'INVALID_VARIANT_ID')
        : undefined;
      if (
        variantId &&
        !(await tx.productVariant.findFirst({
          where: { id: variantId, productId, deletedAt: null },
        }))
      )
        throw new BadRequestException({ code: 'IMAGE_VARIANT_MISMATCH' });
      await tx.productImage.create({
        data: {
          productId,
          imageAssetId: parseId(image.imageAssetId, 'INVALID_IMAGE_ASSET_ID'),
          variantId,
          altText: image.altText ?? '',
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
        },
      });
    }
  }
}
