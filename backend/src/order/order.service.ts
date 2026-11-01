import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import {
  PrismaService,
  type TransactionClient,
} from '../database/prisma.service.js';
import { ProductService } from '../catalog/products/product.service.js';
import { UserAddressService } from '../auth/services/user-address.service.js';
import type { AuthenticatedActor } from '../shared/decorators/current-actor.decorator.js';
import type {
  CancelOrderDto,
  ConfirmOrderDto,
  OrderListQueryDto,
  PlaceOrderDto,
} from './order.dto.js';
import { OrderRepository } from './order.repository.js';
import { NotificationService } from '../notification/notification.service.js';

const SHIPPING_FEE = 30_000n;
const INCLUDE = {
  items: { orderBy: { id: 'asc' as const } },
  history: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { actor: { select: { fullName: true, role: true } } },
  },
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function view(
  order: NonNullable<Awaited<ReturnType<OrderRepository['findOrder']>>>,
) {
  return {
    id: order.id.toString(),
    userId: order.userId.toString(),
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: order.subtotal.toString(),
    shippingFee: order.shippingFee.toString(),
    totalAmount: order.totalAmount.toString(),
    address: {
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      provinceName: order.provinceName,
      wardName: order.wardName,
      addressLine: order.addressLine,
    },
    customerNote: order.customerNote,
    expiresAt: order.expiresAt.toISOString(),
    version: order.version.toString(),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    confirmedAt: order.confirmedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    items: order.items.map((item) => ({
      id: item.id.toString(),
      productId: item.productId.toString(),
      variantId: item.variantId?.toString() ?? null,
      productName: item.productName,
      sku: item.sku,
      options: item.options,
      imageUrl: item.imageUrl,
      unitPrice: item.unitPrice.toString(),
      quantity: item.quantity,
    })),
    history: order.history.map((item) => ({
      fromStatus: item.fromStatus,
      toStatus: item.toStatus,
      reason: item.reason,
      actor: item.actor?.fullName ?? 'Hệ thống',
      actorRole: item.actor?.role ?? 'SYSTEM',
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
type OrderView = ReturnType<typeof view>;

@Injectable()
export class OrderService implements OnModuleInit, OnModuleDestroy {
  private expiryTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderRepository,
    private readonly catalog: ProductService,
    private readonly addresses: UserAddressService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    void this.expirePending();
    this.expiryTimer = setInterval(() => void this.expirePending(), 60_000);
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  async place(actor: AuthenticatedActor, body: PlaceOrderDto) {
    const userId = BigInt(actor.userId);
    const items = [...body.items].sort((a, b) =>
      BigInt(a.cartItemId) < BigInt(b.cartItemId) ? -1 : 1,
    );
    if (new Set(items.map((item) => item.cartItemId)).size !== items.length)
      throw new BadRequestException({ code: 'CHECKOUT_ITEMS_DUPLICATE' });
    const payload = {
      operation: 'PLACE',
      items,
      addressId: body.addressId,
      addressUpdatedAt: body.addressUpdatedAt,
      customerNote: body.customerNote ?? '',
    };
    const placed = await this.idempotentTransaction(
      userId,
      body.idempotencyKey,
      payload,
      async (tx) => {
        const prior = await this.priorOrder(
          userId,
          body.idempotencyKey,
          payload,
          tx,
        );
        if (prior) return prior;
        await this.orders.reserveIdempotency(
          userId,
          body.idempotencyKey,
          payload as unknown as Prisma.InputJsonValue,
          tx,
        );
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const user = await this.orders.user(userId, tx);
        if (!user || user.status !== 'ACTIVE' || user.role !== 'CUSTOMER')
          throw new ConflictException({ code: 'CUSTOMER_NOT_ACTIVE' });
        if (!(await this.orders.activeSession(userId, actor.sessionId, tx)))
          throw new ConflictException({ code: 'CUSTOMER_SESSION_EXPIRED' });
        const address = await this.addresses.checkoutSnapshot(
          actor.userId,
          body.addressId,
          body.addressUpdatedAt,
          tx,
        );
        const cartId = await this.orders.lockCart(userId, tx);
        if (!cartId) throw new ConflictException({ code: 'CART_EMPTY' });
        const cartItemIds = items.map((item) => BigInt(item.cartItemId));
        const cartItems = await this.orders.cartItems(cartId, cartItemIds, tx);
        if (cartItems.length !== items.length)
          throw new ConflictException({ code: 'CART_CHANGED' });
        for (const item of items) {
          const current = cartItems.find(
            (row) => row.id === BigInt(item.cartItemId),
          );
          if (!current || current.quantity !== item.quantity)
            throw new ConflictException({ code: 'CART_CHANGED' });
        }
        const selections = cartItems.map((item) => ({
          cartItemId: item.id,
          productId: item.productId ?? item.variant?.productId ?? 0n,
          variantId: item.variantId,
          quantity: item.quantity,
        }));
        if (selections.some((item) => item.productId === 0n))
          throw new ConflictException({ code: 'CART_ITEM_INVALID' });
        const snapshots = await this.catalog.reserveForOrder(tx, selections);
        let subtotal = 0n;
        for (const snapshot of snapshots) {
          const expected = items.find(
            (item) => BigInt(item.cartItemId) === snapshot.cartItemId,
          )!;
          if (snapshot.unitPrice.toString() !== expected.unitPrice)
            throw new ConflictException({ code: 'PRICE_CHANGED' });
          subtotal += snapshot.unitPrice * BigInt(snapshot.quantity);
        }
        if (subtotal <= 0n || subtotal + SHIPPING_FEE > 99_999_999_999_999n)
          throw new BadRequestException({ code: 'ORDER_TOTAL_INVALID' });
        const createdAt = await this.databaseNow(tx);
        const order = await tx.order.create({
          data: {
            userId,
            subtotal,
            shippingFee: SHIPPING_FEE,
            totalAmount: subtotal + SHIPPING_FEE,
            recipientName: address.recipientName,
            recipientPhone: address.recipientPhone,
            provinceName: address.provinceName,
            wardName: address.wardName,
            addressLine: address.addressLine,
            customerNote: body.customerNote || null,
            expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
            createdAt,
            items: {
              create: snapshots.map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                productName: item.productName,
                sku: item.sku,
                options: item.options,
                imageUrl: item.imageUrl,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
              })),
            },
            history: {
              create: {
                actorId: userId,
                fromStatus: null,
                toStatus: 'PENDING',
              },
            },
          },
          include: INCLUDE,
        });
        await this.orders.event(order.id, tx);
        const createdHistory = await tx.orderStatusHistory.findFirst({
          where: { orderId: order.id },
          orderBy: { id: 'desc' },
        });
        if (createdHistory)
          await this.notifications.recordOrderChange(
            tx,
            order,
            createdHistory.id,
          );
        await this.orders.deletePurchasedCartItems(cartItemIds, tx);
        await this.orders.completeIdempotency(
          userId,
          body.idempotencyKey,
          { orderId: order.id.toString() },
          tx,
        );
        return view(order);
      },
    );
    this.notifications.publishChanged(BigInt(placed.userId));
    return placed;
  }

  async listCustomer(actor: AuthenticatedActor, query: OrderListQueryDto) {
    const result = await this.orders.list(
      BigInt(actor.userId),
      query.status,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    return {
      items: result.items.map((row) => {
        const { user, ...order } = row;
        void user;
        return {
          ...order,
          id: order.id.toString(),
          userId: order.userId.toString(),
          subtotal: order.subtotal.toString(),
          shippingFee: order.shippingFee.toString(),
          totalAmount: order.totalAmount.toString(),
          version: order.version.toString(),
          items: order.items.map((item) => {
            const { orderId, ...snapshot } = item;
            void orderId;
            return {
              ...snapshot,
              id: snapshot.id.toString(),
              productId: snapshot.productId.toString(),
              variantId: snapshot.variantId?.toString() ?? null,
              unitPrice: snapshot.unitPrice.toString(),
            };
          }),
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async listAdmin(query: OrderListQueryDto) {
    const result = await this.orders.list(
      null,
      query.status,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    return {
      items: result.items.map((order) => ({
        ...order,
        id: order.id.toString(),
        userId: order.userId.toString(),
        subtotal: order.subtotal.toString(),
        shippingFee: order.shippingFee.toString(),
        totalAmount: order.totalAmount.toString(),
        version: order.version.toString(),
        customer: order.user,
        items: order.items.map((item) => {
          const { orderId, ...snapshot } = item;
          void orderId;
          return {
            ...snapshot,
            id: snapshot.id.toString(),
            productId: snapshot.productId.toString(),
            variantId: snapshot.variantId?.toString() ?? null,
            unitPrice: snapshot.unitPrice.toString(),
          };
        }),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  async get(actor: AuthenticatedActor, idValue: string, admin = false) {
    const id = this.parseId(idValue);
    const order = await this.orders.findOrder(id);
    if (!order || (!admin && order.userId.toString() !== actor.userId))
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return view(order);
  }

  async findByKey(actor: AuthenticatedActor, key: string) {
    const userId = BigInt(actor.userId);
    const row = await this.orders.idempotency(userId, key);
    const result = row?.response as { orderId?: string } | null | undefined;
    if (!result?.orderId)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    const order = await this.orders.findOrder(BigInt(result.orderId));
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    return view(order);
  }

  async cancel(
    actor: AuthenticatedActor,
    idValue: string,
    body: CancelOrderDto,
    admin = false,
  ) {
    const id = this.parseId(idValue);
    const actorId = BigInt(actor.userId);
    const reason = body.reason?.trim() || (admin ? '' : 'Khách hàng hủy đơn');
    if (admin && !reason)
      throw new BadRequestException({ code: 'CANCEL_REASON_REQUIRED' });
    const payload = {
      operation: 'CANCEL',
      orderId: id.toString(),
      expectedVersion: body.expectedVersion ?? '',
      reason,
    };
    const cancelled = await this.idempotentTransaction(
      actorId,
      body.idempotencyKey,
      payload,
      async (tx) => {
        const prior = await this.priorOrder(
          actorId,
          body.idempotencyKey,
          payload,
          tx,
        );
        if (prior) return prior;
        await this.orders.reserveIdempotency(
          actorId,
          body.idempotencyKey,
          payload,
          tx,
        );
        await this.orders.lockOrder(id, tx);
        const order = await this.orders.findOrder(id, tx);
        if (!order || (!admin && order.userId !== actorId))
          throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
        if (
          body.expectedVersion &&
          body.expectedVersion !== order.version.toString()
        )
          throw new ConflictException({
            code: 'ORDER_VERSION_CONFLICT',
            currentVersion: order.version.toString(),
          });
        if (
          order.paymentStatus !== 'UNPAID' ||
          !['PENDING', 'CONFIRMED'].includes(order.status) ||
          (!admin && order.status !== 'PENDING')
        )
          throw new ConflictException({ code: 'ORDER_CANNOT_CANCEL' });
        const now = await this.databaseNow(tx);
        if (order.status === 'PENDING' && order.expiresAt <= now) {
          await this.catalog.releaseOrderReservation(
            tx,
            order.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          );
          await this.orders.changeStatus(
            id,
            'CANCELLED',
            now,
            now,
            'EXPIRED',
            null,
            tx,
          );
          const history = await this.orders.history(
            id,
            null,
            'PENDING',
            'CANCELLED',
            'EXPIRED',
            tx,
          );
          const updated = await this.orders.findOrder(id, tx);
          if (updated)
            await this.notifications.recordOrderChange(
              tx,
              updated,
              history.id,
              'EXPIRED',
            );
          await this.orders.completeIdempotency(
            actorId,
            body.idempotencyKey,
            { orderId: id.toString() },
            tx,
          );
          return view(updated!);
        }
        await this.catalog.releaseOrderReservation(
          tx,
          order.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        );
        await this.orders.changeStatus(
          id,
          'CANCELLED',
          now,
          now,
          reason,
          order.confirmedAt,
          tx,
        );
        const history = await this.orders.history(
          id,
          actorId,
          order.status,
          'CANCELLED',
          reason,
          tx,
        );
        const updated = await this.orders.findOrder(id, tx);
        if (updated)
          await this.notifications.recordOrderChange(tx, updated, history.id);
        await this.orders.completeIdempotency(
          actorId,
          body.idempotencyKey,
          { orderId: id.toString() },
          tx,
        );
        return view(updated!);
      },
    );
    this.notifications.publishChanged(BigInt(cancelled.userId));
    return cancelled;
  }

  async confirm(
    actor: AuthenticatedActor,
    idValue: string,
    body: ConfirmOrderDto,
  ) {
    const id = this.parseId(idValue);
    const actorId = BigInt(actor.userId);
    const payload = {
      operation: 'CONFIRM',
      orderId: id.toString(),
      expectedVersion: body.expectedVersion,
    };
    const confirmed = await this.idempotentTransaction(
      actorId,
      body.idempotencyKey,
      payload,
      async (tx) => {
        const prior = await this.priorOrder(
          actorId,
          body.idempotencyKey,
          payload,
          tx,
        );
        if (prior) return prior;
        await this.orders.reserveIdempotency(
          actorId,
          body.idempotencyKey,
          payload,
          tx,
        );
        await this.orders.lockOrder(id, tx);
        const order = await this.orders.findOrder(id, tx);
        if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
        if (order.version.toString() !== body.expectedVersion)
          throw new ConflictException({
            code: 'ORDER_VERSION_CONFLICT',
            currentVersion: order.version.toString(),
          });
        if (order.status !== 'PENDING' || order.paymentStatus !== 'UNPAID')
          throw new ConflictException({ code: 'ORDER_CANNOT_CONFIRM' });
        const checkTime = await this.databaseNow(tx);
        if (order.expiresAt <= checkTime) {
          const now = checkTime;
          await this.catalog.releaseOrderReservation(
            tx,
            order.items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          );
          await this.orders.changeStatus(
            id,
            'CANCELLED',
            now,
            now,
            'EXPIRED',
            null,
            tx,
          );
          const history = await this.orders.history(
            id,
            null,
            'PENDING',
            'CANCELLED',
            'EXPIRED',
            tx,
          );
          const updated = await this.orders.findOrder(id, tx);
          if (updated)
            await this.notifications.recordOrderChange(
              tx,
              updated,
              history.id,
              'EXPIRED',
            );
          await this.orders.completeIdempotency(
            actorId,
            body.idempotencyKey,
            { orderId: id.toString() },
            tx,
          );
          return view(updated!);
        }
        const now = checkTime;
        await this.orders.changeStatus(
          id,
          'CONFIRMED',
          now,
          null,
          null,
          now,
          tx,
        );
        const history = await this.orders.history(
          id,
          actorId,
          'PENDING',
          'CONFIRMED',
          null,
          tx,
        );
        const updated = await this.orders.findOrder(id, tx);
        if (updated)
          await this.notifications.recordOrderChange(tx, updated, history.id);
        await this.orders.completeIdempotency(
          actorId,
          body.idempotencyKey,
          { orderId: id.toString() },
          tx,
        );
        return view(updated!);
      },
    );
    this.notifications.publishChanged(BigInt(confirmed.userId));
    return confirmed;
  }

  private async idempotentTransaction(
    actorId: bigint,
    key: string,
    payload: unknown,
    work: (tx: TransactionClient) => Promise<OrderView>,
  ): Promise<OrderView> {
    try {
      return await this.prisma.transaction(work);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const prior = await this.priorOrder(actorId, key, payload);
      if (prior) return prior;
      throw error;
    }
  }

  private async priorOrder(
    actorId: bigint,
    key: string,
    payload: unknown,
    tx: TransactionClient | PrismaService = this.prisma,
  ) {
    const previous = await this.orders.idempotency(actorId, key, tx);
    if (!previous) return null;
    if (canonical(previous.payload) !== canonical(payload))
      throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REUSED' });
    const result = previous.response as { orderId?: string } | null;
    if (!result?.orderId)
      throw new ConflictException({ code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
    const order = await this.orders.findOrder(BigInt(result.orderId), tx);
    if (!order)
      throw new ConflictException({ code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
    return view(order);
  }

  private parseId(value: string) {
    if (!/^[1-9]\d*$/.test(value))
      throw new BadRequestException({ code: 'INVALID_ORDER_ID' });
    return BigInt(value);
  }

  private async databaseNow(
    tx: import('../database/prisma.service.js').TransactionClient,
  ) {
    const rows = await tx.$queryRaw<
      Array<{ now: Date }>
    >`SELECT clock_timestamp() AS now`;
    return rows[0].now;
  }

  private async expirePending() {
    try {
      const due = await this.orders.dueOrders(100);
      for (const { id } of due)
        await this.prisma
          .transaction(async (tx) => {
            await this.orders.lockOrder(id, tx);
            const order = await this.orders.findOrder(id, tx);
            if (
              !order ||
              order.status !== 'PENDING' ||
              order.paymentStatus !== 'UNPAID'
            )
              return;
            const now = await this.databaseNow(tx);
            if (order.expiresAt > now) return;
            await this.catalog.releaseOrderReservation(
              tx,
              order.items.map((item) => ({
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
              })),
            );
            await this.orders.changeStatus(
              id,
              'CANCELLED',
              now,
              now,
              'EXPIRED',
              null,
              tx,
            );
            const history = await this.orders.history(
              id,
              null,
              'PENDING',
              'CANCELLED',
              'EXPIRED',
              tx,
            );
            const updated = await this.orders.findOrder(id, tx);
            if (updated)
              await this.notifications.recordOrderChange(
                tx,
                updated,
                history.id,
                'EXPIRED',
              );
            return order.userId;
          })
          .then((userId) => {
            if (userId) this.notifications.publishChanged(userId);
          });
    } catch {
      /* A later sweep retries any orders left pending. */
    }
  }
}
