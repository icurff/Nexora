import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthenticatedActor } from '../../shared/decorators/current-actor.decorator.js';
import type {
  InventoryAdjustmentDto,
  InventoryListQueryDto,
} from './inventory.dto.js';
import { InventoryRepository } from './inventory.repository.js';

const MAX_STOCK = 2_147_483_647;
type VariantRow = Prisma.ProductVariantGetPayload<{
  include: {
    inventory: true;
    product: { include: { category: { select: { id: true; name: true } } } };
  };
}>;

function parseId(value: string) {
  if (!/^[1-9]\d*$/.test(value))
    throw new BadRequestException({ code: 'INVALID_SKU_ID' });
  try {
    return BigInt(value);
  } catch {
    throw new BadRequestException({ code: 'INVALID_SKU_ID' });
  }
}

function optionLabels(config: Prisma.JsonValue, options: Prisma.JsonValue) {
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
        typeof label === 'string' ? label : code,
        typeof value === 'string' ? value : (JSON.stringify(value) ?? ''),
      ];
    }),
  );
}

function inventoryResponse(row: VariantRow | null) {
  if (!row || !row.inventory)
    throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
  const { inventory, product } = row;
  return {
    skuId: row.id.toString(),
    sku: row.sku,
    options: row.options,
    optionLabels: optionLabels(product.optionConfig, row.options),
    product: {
      id: product.id.toString(),
      name: product.name,
      status: product.status,
      category: {
        id: product.category.id.toString(),
        name: product.category.name,
      },
    },
    onHand: inventory.onHand,
    reserved: inventory.reserved,
    available: inventory.onHand - inventory.reserved,
    version: inventory.version.toString(),
    updatedAt: inventory.updatedAt.toISOString(),
    deleted: row.deletedAt !== null,
  };
}

function requestPayload(variantId: bigint, input: InventoryAdjustmentDto) {
  return {
    skuId: variantId.toString(),
    type: input.type,
    quantity: input.quantity,
    expectedVersion: input.expectedVersion ?? null,
    reason: input.reason.trim(),
  };
}

function samePayload(left: Prisma.JsonValue, right: object) {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, stable(entry)]),
      );
    return value;
  };
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: InventoryListQueryDto) {
    const filters: Parameters<InventoryRepository['list']>[0] = {
      ...(query.q ? { q: query.q } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.availability ? { availability: query.availability } : {}),
      ...(query.productId ? { productId: parseId(query.productId) } : {}),
    };
    if (query.categoryId) {
      const root = parseId(query.categoryId);
      const categories = await this.repository.categories();
      if (!categories.some((category) => category.id === root))
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
      const ids = new Set([root.toString()]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const category of categories)
          if (
            category.parentId &&
            ids.has(category.parentId.toString()) &&
            !ids.has(category.id.toString())
          ) {
            ids.add(category.id.toString());
            changed = true;
          }
      }
      filters.categoryIds = [...ids].map(BigInt);
    }
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const result = await this.repository.list(
      filters,
      (page - 1) * pageSize,
      pageSize,
    );
    return {
      items: result.items.map((row) => ({
        skuId: row.variant.id.toString(),
        sku: row.variant.sku,
        options: row.variant.options,
        optionLabels: optionLabels(
          row.variant.product.optionConfig,
          row.variant.options,
        ),
        product: {
          id: row.variant.product.id.toString(),
          name: row.variant.product.name,
          status: row.variant.product.status,
          category: {
            id: row.variant.product.category.id.toString(),
            name: row.variant.product.category.name,
          },
        },
        onHand: row.onHand,
        reserved: row.reserved,
        available: row.onHand - row.reserved,
        version: row.version.toString(),
        updatedAt: row.updatedAt.toISOString(),
        deleted: false,
      })),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }

  async get(variantIdValue: string) {
    const row = await this.repository.variant(parseId(variantIdValue));
    return inventoryResponse(row);
  }

  async history(variantIdValue: string, page: number, pageSize: number) {
    const variantId = parseId(variantIdValue);
    const row = await this.repository.variant(variantId);
    if (!row?.inventory) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
    const result = await this.repository.history(
      variantId,
      (page - 1) * pageSize,
      pageSize,
    );
    return {
      items: result.items.map((entry) => ({
        id: entry.id.toString(),
        type: entry.movementType ?? 'LEGACY',
        quantityBefore: entry.quantityBefore,
        quantityAfter: entry.quantityAfter,
        delta: entry.quantityAfter - entry.quantityBefore,
        reservedBefore: entry.reservedBefore,
        reservedAfter: entry.reservedAfter,
        actor: entry.actor?.fullName ?? 'Hệ thống',
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }

  async adjust(
    variantIdValue: string,
    input: InventoryAdjustmentDto,
    actor: AuthenticatedActor,
  ) {
    const variantId = parseId(variantIdValue);
    const payload = requestPayload(variantId, input);
    if (!payload.reason)
      throw new BadRequestException({ code: 'INVENTORY_REASON_REQUIRED' });
    if (input.type === 'RESTOCK' && input.quantity <= 0)
      throw new BadRequestException({ code: 'INVENTORY_QUANTITY_INVALID' });
    if (input.type === 'ADJUSTMENT' && input.quantity === 0)
      throw new BadRequestException({ code: 'INVENTORY_NO_CHANGE' });
    if (input.type === 'STOCKTAKE' && input.quantity < 0)
      throw new BadRequestException({ code: 'INVENTORY_QUANTITY_INVALID' });
    if (input.type === 'STOCKTAKE' && input.expectedVersion === undefined)
      throw new BadRequestException({ code: 'INVENTORY_VERSION_REQUIRED' });

    try {
      return await this.prisma.transaction(async (tx) => {
        await tx.inventoryAdjustmentRequest.create({
          data: {
            actorUserId: BigInt(actor.userId),
            key: input.idempotencyKey,
            payload,
          },
        });

        const beforeLock = await tx.productVariant.findUnique({
          where: { id: variantId },
          select: { productId: true },
        });
        if (!beforeLock) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
        await this.repository.lockProduct(beforeLock.productId, tx);
        await this.repository.lockVariant(variantId, tx);
        const variant = await this.repository.variant(variantId, tx);
        if (!variant?.inventory)
          throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
        const current = await this.repository.lockInventory(variantId, tx);
        if (!current) throw new NotFoundException({ code: 'SKU_NOT_FOUND' });
        if (variant.deletedAt)
          throw new ConflictException({ code: 'SKU_DELETED' });

        const version = current.version.toString();
        if (input.type === 'STOCKTAKE' && input.expectedVersion !== version)
          throw new ConflictException({
            code: 'INVENTORY_VERSION_CONFLICT',
            currentVersion: version,
          });
        const next =
          input.type === 'STOCKTAKE'
            ? input.quantity
            : current.onHand + input.quantity;
        if (!Number.isSafeInteger(next) || next < 0 || next > MAX_STOCK)
          throw new BadRequestException({ code: 'INVENTORY_QUANTITY_INVALID' });
        if (next < current.reserved)
          throw new ConflictException({
            code: 'INVENTORY_BELOW_RESERVED',
            reserved: current.reserved,
          });
        if (next === current.onHand)
          throw new BadRequestException({ code: 'INVENTORY_NO_CHANGE' });

        const updated = await tx.inventory.update({
          where: { variantId },
          data: { onHand: next, version: { increment: 1n } },
        });
        await tx.inventoryLedger.create({
          data: {
            variantId,
            actorUserId: BigInt(actor.userId),
            reason: payload.reason,
            quantityBefore: current.onHand,
            quantityAfter: next,
            movementType: input.type,
            reservedBefore: current.reserved,
            reservedAfter: current.reserved,
          },
        });
        const response = {
          skuId: variant.id.toString(),
          sku: variant.sku,
          options: variant.options,
          optionLabels: optionLabels(
            variant.product.optionConfig,
            variant.options,
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
          onHand: updated.onHand,
          reserved: updated.reserved,
          available: updated.onHand - updated.reserved,
          version: updated.version.toString(),
          updatedAt: updated.updatedAt.toISOString(),
          deleted: false,
        };
        await tx.inventoryAdjustmentRequest.update({
          where: {
            actorUserId_key: {
              actorUserId: BigInt(actor.userId),
              key: input.idempotencyKey,
            },
          },
          data: { response },
        });
        return response;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing =
          await this.prisma.inventoryAdjustmentRequest.findUnique({
            where: {
              actorUserId_key: {
                actorUserId: BigInt(actor.userId),
                key: input.idempotencyKey,
              },
            },
          });
        if (existing) {
          if (!samePayload(existing.payload, payload))
            throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
          if (existing.response) return existing.response;
        }
      }
      throw error;
    }
  }
}
