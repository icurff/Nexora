import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService, type TransactionClient } from '../../database/prisma.service.js';
import type { AddProductImagesDto, CreateProductDto, ProductImageInputDto, ProductListQueryDto, ProductOptionConfigDto, UpdateProductDto, UpdateProductImageDto, UpdateVariantDto, VariantInputDto } from './product.dto.js';
import { ProductRepository } from './product.repository.js';

const include = {
  category: { select: { id: true, name: true, parentId: true } },
  variants: { where: { deletedAt: null }, orderBy: { id: 'asc' as const }, include: { inventory: true } },
  images: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }], include: { imageAsset: true } },
} satisfies Prisma.ProductInclude;
type ProductDetails = Prisma.ProductGetPayload<{ include: typeof include }>;

function storedOptionConfig(config: ProductOptionConfigDto): Prisma.InputJsonObject {
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
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const label = (entry as Record<string, Prisma.JsonValue>).label;
      return typeof label === 'string' ? [{ code, label }] : [];
    }),
  };
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, c => c === 'Đ' ? 'D' : 'd').toLocaleLowerCase('vi').trim().replace(/\s+/g, ' ');
}
function parseId(value: string, code = 'INVALID_ID') {
  if (!/^[1-9]\d*$/.test(value)) throw new BadRequestException({ code });
  try { return BigInt(value); } catch { throw new BadRequestException({ code }); }
}
function response(product: ProductDetails) {
  return {
    id: product.id.toString(), name: product.name, description: product.description,
    category: { id: product.category.id.toString(), name: product.category.name },
    categoryId: product.categoryId.toString(), status: product.status,
    optionConfig: optionConfigResponse(product.optionConfig),
    createdAt: product.createdAt.toISOString(), updatedAt: product.updatedAt.toISOString(),
    variants: product.variants.map(v => ({ id: v.id.toString(), sku: v.sku, options: v.options, priceVnd: v.priceVnd.toString() })),
    images: product.images.map(i => ({ id: i.id.toString(), imageAssetId: i.imageAssetId.toString(), variantId: i.variantId?.toString() ?? null, altText: i.altText, sortOrder: i.sortOrder, isPrimary: i.isPrimary, contentType: i.imageAsset.contentType, url: i.imageAsset.publicUrl })),
  };
}

@Injectable()
export class ProductService {
  constructor(private readonly repository: ProductRepository, private readonly prisma: PrismaService) {}

  async list(query: ProductListQueryDto) {
    const where: Prisma.ProductWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) where.nameKey = { contains: normalized(query.q) };
    if (query.categoryId) {
      const rootId = parseId(query.categoryId, 'INVALID_CATEGORY_ID'); const categories = await this.repository.categories();
      if (!categories.some(c => c.id === rootId)) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      const ids = new Set([rootId.toString()]); let changed = true;
      while (changed) { changed = false; for (const c of categories) if (c.parentId && ids.has(c.parentId.toString()) && !ids.has(c.id.toString())) { ids.add(c.id.toString()); changed = true; } }
      where.categoryId = { in: [...ids].map(BigInt) };
    }
    const page = query.page || 1; const pageSize = query.pageSize || 20;
    const [rows, total] = await Promise.all([this.repository.list(where, (page - 1) * pageSize, pageSize), this.repository.count(where)]);
    return { items: rows.map(response), page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async get(id: string) {
    const row = await this.repository.byId(parseId(id, 'INVALID_PRODUCT_ID'));
    if (!row) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' }); return response(row);
  }

  async create(input: CreateProductDto) {
    return this.prisma.transaction(async tx => {
      const category = await this.assertCategory(parseId(input.categoryId, 'INVALID_CATEGORY_ID'), tx);
      this.assertVariantSet(input.variants, storedOptionConfig(input.optionConfig)); const mediaTypes = await this.assertAssetsExist(input.images, tx); this.assertPrimaryImage(input.images, mediaTypes);
      const product = await tx.product.create({ data: { name: input.name, nameKey: normalized(input.name), description: input.description, categoryId: category.id, status: 'ACTIVE', optionConfig: storedOptionConfig(input.optionConfig) } });
      for (const variant of input.variants) await this.createVariant(product.id, variant, tx);
      await this.createImageLinks(product.id, input.images, tx);
      return response(await tx.product.findUniqueOrThrow({ where: { id: product.id }, include }));
    });
  }

  async update(id: string, input: UpdateProductDto) {
    const productId = parseId(id, 'INVALID_PRODUCT_ID');
    return this.prisma.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
      const current = await tx.product.findUnique({ where: { id: productId }, include });
      if (!current) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const categoryId = input.categoryId ? parseId(input.categoryId, 'INVALID_CATEGORY_ID') : current.categoryId;
      if (categoryId !== current.categoryId) await this.assertCategory(categoryId, tx);
      if (input.status === 'ACTIVE') this.assertSellable(current.variants, current.images);
      return response(await tx.product.update({ where: { id: productId }, data: {
        ...(input.name !== undefined ? { name: input.name, nameKey: normalized(input.name) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}), ...(input.categoryId ? { categoryId } : {}), ...(input.status ? { status: input.status } : {}),
      }, include }));
    });
  }

  async addVariant(productId: string, input: VariantInputDto) {
    return this.prisma.transaction(async tx => {
      const id = parseId(productId, 'INVALID_PRODUCT_ID'); await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include }); if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      this.assertVariantSet([...product.variants.map(v => ({ options: v.options as Record<string, string> })), input], product.optionConfig);
      await this.createVariant(product.id, input, tx); return response(await tx.product.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  async updateVariant(id: string, input: UpdateVariantDto) {
    const variantId = parseId(id, 'INVALID_VARIANT_ID');
    return this.prisma.transaction(async tx => {
      const v = await tx.productVariant.findUnique({ where: { id: variantId }, include: { product: { include }, inventory: true } });
      if (!v || v.deletedAt) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId} FOR UPDATE`;
      await tx.productVariant.update({ where: { id: variantId }, data: { ...(input.priceVnd !== undefined ? { priceVnd: BigInt(input.priceVnd) } : {}) } });
      return response(await tx.product.findUniqueOrThrow({ where: { id: v.productId }, include }));
    });
  }

  async deleteVariant(id: string) {
    const variantId = parseId(id, 'INVALID_VARIANT_ID');
    return this.prisma.transaction(async tx => {
      const v = await tx.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true } });
      if (!v || v.deletedAt) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${v.productId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ${variantId} FOR UPDATE`;
      const current = await tx.productVariant.findUnique({ where: { id: variantId }, include: { inventory: true } });
      if (!current || current.deletedAt) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
      const stock = await this.repository.lockInventory(variantId, tx);
      if (stock?.reserved) throw new ConflictException({ code: 'SKU_HAS_RESERVED_STOCK' });
      if (stock?.onHand) throw new ConflictException({ code: 'SKU_HAS_ON_HAND_STOCK' });
      const [count, product] = await Promise.all([tx.productVariant.count({ where: { productId: v.productId, deletedAt: null } }), tx.product.findUnique({ where: { id: v.productId } })]);
      if (product?.status === 'ACTIVE' && count <= 1) throw new ConflictException({ code: 'PRODUCT_NEEDS_SKU' });
      await tx.productImage.updateMany({ where: { variantId }, data: { variantId: null } });
      await tx.productVariant.update({ where: { id: variantId }, data: { deletedAt: new Date() } }); return { deleted: true };
    });
  }

  async addImages(productId: string, input: AddProductImagesDto) {
    const id = parseId(productId, 'INVALID_PRODUCT_ID');
    return this.prisma.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const p = await tx.product.findUnique({ where: { id }, include }); if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const mediaTypes = await this.assertAssetsExist(input.images, tx);
      if (input.images.filter(image => image.isPrimary).length > 1 || input.images.some(image => image.isPrimary && image.variantId) || input.images.some(image => image.isPrimary && !mediaTypes.get(image.imageAssetId)?.startsWith('image/'))) throw new BadRequestException({ code: 'PRODUCT_NEEDS_PRIMARY_IMAGE' });
      if (input.images.some(i => i.isPrimary) && p.images.some(i => i.isPrimary)) throw new ConflictException({ code: 'PRIMARY_IMAGE_EXISTS' });
      await this.createImageLinks(id, input.images, tx); return response(await tx.product.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  async updateImage(productId: string, imageId: string, input: UpdateProductImageDto) {
    const id = parseId(productId, 'INVALID_PRODUCT_ID'); const linkId = parseId(imageId, 'INVALID_IMAGE_ID');
    return this.prisma.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const product = await tx.product.findUnique({ where: { id }, include }); if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const link = await tx.productImage.findFirst({ where: { id: linkId, productId: id } }); if (!link) throw new NotFoundException({ code: 'PRODUCT_IMAGE_NOT_FOUND' });
      const linkedMedia = product.images.find(image => image.id === linkId);
      if (input.isPrimary && linkedMedia && !linkedMedia.imageAsset.contentType.startsWith('image/')) throw new BadRequestException({ code: 'PRIMARY_IMAGE_MUST_BE_IMAGE' });
      if (input.isPrimary && link.variantId) throw new BadRequestException({ code: 'PRIMARY_IMAGE_MUST_BE_SHARED' });
      if (product.status === 'ACTIVE' && input.isPrimary === false && link.isPrimary && product.images.filter(image => image.id !== linkId && image.isPrimary).length === 0) throw new ConflictException({ code: 'ACTIVE_PRODUCT_NEEDS_IMAGE' });
      if (input.isPrimary) await tx.productImage.updateMany({ where: { productId: id }, data: { isPrimary: false } });
      await tx.productImage.update({ where: { id: linkId }, data: input }); return response(await tx.product.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  async deleteImage(productId: string, imageId: string) {
    const id = parseId(productId, 'INVALID_PRODUCT_ID'); const linkId = parseId(imageId, 'INVALID_IMAGE_ID');
    return this.prisma.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const p = await tx.product.findUnique({ where: { id }, include }); if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND' });
      const link = p.images.find(i => i.id === linkId); if (!link) throw new NotFoundException({ code: 'PRODUCT_IMAGE_NOT_FOUND' });
      if (p.status === 'ACTIVE' && link.imageAsset.contentType.startsWith('image/') && link.variantId === null && !p.images.some(image => image.id !== linkId && image.variantId === null && image.imageAsset.contentType.startsWith('image/'))) throw new ConflictException({ code: 'ACTIVE_PRODUCT_NEEDS_IMAGE' });
      await tx.productImage.delete({ where: { id: linkId } });
      const nextPrimary = link.isPrimary ? p.images.find(i => i.id !== linkId && i.variantId === null && i.imageAsset.contentType.startsWith('image/')) : undefined;
      if (nextPrimary) await tx.productImage.update({ where: { id: nextPrimary.id }, data: { isPrimary: true } });
      return response(await tx.product.findUniqueOrThrow({ where: { id }, include }));
    });
  }

  private async assertCategory(id: bigint, tx: TransactionClient) {
    const category = await this.repository.category(id, tx); if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    const all = await this.repository.categories(tx); const byId = new Map(all.map(c => [c.id.toString(), c])); let cursor: typeof category | undefined = category; const seen = new Set<string>();
    while (cursor) { const key = cursor.id.toString(); if (seen.has(key)) throw new BadRequestException({ code: 'CATEGORY_TREE_INVALID' }); seen.add(key); cursor = cursor.parentId ? byId.get(cursor.parentId.toString()) : undefined; }
    return category;
  }

  private assertVariantSet(variants: Array<{ options: Record<string, string> }>, config: Prisma.JsonValue | Prisma.InputJsonObject) {
    const root = config && typeof config === 'object' && !Array.isArray(config) ? config as Record<string, Prisma.JsonValue> : {};
    const optionMap = root.options && typeof root.options === 'object' && !Array.isArray(root.options) ? root.options as Record<string, Prisma.JsonValue> : {};
    const codes = Object.keys(optionMap).sort(); const combos = new Set<string>();
    for (const variant of variants) {
      const options = variant.options; if (!options || typeof options !== 'object' || Array.isArray(options)) throw new BadRequestException({ code: 'SKU_OPTIONS_INVALID' });
      const variantCodes = Object.keys(options).sort();
      if (variantCodes.join('\0') !== codes.join('\0') || Object.values(options).some(value => typeof value !== 'string' || !value.trim())) throw new BadRequestException({ code: 'SKU_OPTIONS_INVALID' });
      const combo = variantCodes.map(code => `${normalized(code)}=${normalized(options[code])}`).join('|');
      if (combos.has(combo)) throw new ConflictException({ code: 'SKU_OPTIONS_DUPLICATE' }); combos.add(combo);
    }
  }

  private assertSellable(variants: ProductDetails['variants'], images: ProductDetails['images']) {
    if (!variants.length) throw new BadRequestException({ code: 'PRODUCT_NEEDS_SKU' });
    if (!images.length || !images.some(image => image.isPrimary && image.imageAsset.contentType.startsWith('image/'))) throw new BadRequestException({ code: 'PRODUCT_NEEDS_IMAGE' });
  }
  private async assertAssetsExist(images: ProductImageInputDto[], tx: TransactionClient) {
    const ids = images.map(i => parseId(i.imageAssetId, 'INVALID_IMAGE_ASSET_ID')); const assets = await tx.imageAsset.findMany({ where: { id: { in: ids } } });
    if (assets.length !== ids.length) throw new BadRequestException({ code: 'IMAGE_ASSET_NOT_FOUND' });
    return new Map(assets.map(asset => [asset.id.toString(), asset.contentType]));
  }
  private assertPrimaryImage(images: ProductImageInputDto[], mediaTypes: Map<string, string>) { if (images.filter(i => i.isPrimary).length !== 1 || images.some(image => image.isPrimary && (image.variantId || !mediaTypes.get(image.imageAssetId)?.startsWith('image/')))) throw new BadRequestException({ code: 'PRODUCT_NEEDS_PRIMARY_IMAGE' }); }
  private async createVariant(productId: bigint, input: VariantInputDto, tx: TransactionClient) {
    const v = await tx.productVariant.create({ data: { productId, sku: `NEW-${randomUUID()}`, options: input.options, priceVnd: BigInt(input.priceVnd), inventory: { create: { onHand: 0, reserved: 0 } } } });
    await tx.productVariant.update({ where: { id: v.id }, data: { sku: `SKU-${v.id.toString().padStart(10, '0')}` } });
  }
  private async createImageLinks(productId: bigint, images: ProductImageInputDto[], tx: TransactionClient) {
    for (const image of images) {
      const variantId = image.variantId ? parseId(image.variantId, 'INVALID_VARIANT_ID') : undefined;
      if (variantId && !await tx.productVariant.findFirst({ where: { id: variantId, productId, deletedAt: null } })) throw new BadRequestException({ code: 'IMAGE_VARIANT_MISMATCH' });
      await tx.productImage.create({ data: { productId, imageAssetId: parseId(image.imageAssetId, 'INVALID_IMAGE_ASSET_ID'), variantId, altText: image.altText ?? '', sortOrder: image.sortOrder, isPrimary: image.isPrimary } });
    }
  }
}
