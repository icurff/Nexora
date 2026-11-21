import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RecommendationGraphStore } from './recommendation-graph.store.js';
import { PrismaService } from '../database/prisma.service.js';

/** Read only the current browser's active session; never accepts visitor/session IDs. */
@Injectable()
export class TrackingGraphRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly recommendations?: RecommendationGraphStore,
  ) {}

  async snapshot(token: string | undefined, since: Date) {
    const empty = { session: null, events: [], truncated: false };
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return empty;
    const visitor = await this.prisma.visitor.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      select: { id: true },
    });
    if (!visitor) return empty;
    const session = await this.prisma.trackingSession.findFirst({
      where: {
        visitorId: visitor.id,
        endedAt: null,
        lastSeenAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { id: 'desc' }],
      select: { id: true, startedAt: true },
    });
    if (!session) return empty;
    const rows = await this.prisma.interactionEvent.findMany({
      where: {
        visitorId: visitor.id,
        trackingSessionId: session.id,
        dataOrigin: 'LIVE',
        eventType: 'view',
        productId: { not: null },
        receivedAt: { gt: since },
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: 201,
      select: {
        eventId: true,
        occurredAt: true,
        receivedAt: true,
        product: { select: { id: true, name: true, retailrocketItemId: true } },
      },
    });
    const cached = this.recommendations?.read(session.id, since);
    const mappings = cached?.items.length
      ? await this.prisma.product.findMany({
          where: {
            id: { in: cached.items.map((item) => BigInt(item.productId)) },
          },
          select: { id: true, retailrocketItemId: true },
        })
      : [];
    const mapping = new Map(
      mappings.map((product) => [
        product.id.toString(),
        product.retailrocketItemId,
      ]),
    );
    const recommendation = cached
      ? {
          ...cached,
          items: cached.items.map((item) => ({
            ...item,
            product: {
              id: item.productId,
              name: item.name,
              retailrocketItemId: mapping.get(item.productId) ?? null,
            },
          })),
        }
      : undefined;
    return {
      ...(recommendation ? { recommendation } : {}),
      session: {
        id: session.id.toString(),
        startedAt: session.startedAt.toISOString(),
      },
      events: rows
        .slice(0, 200)
        .reverse()
        .flatMap((row) =>
          row.product
            ? [
                {
                  eventId: row.eventId,
                  occurredAt: row.occurredAt.toISOString(),
                  receivedAt: row.receivedAt.toISOString(),
                  product: {
                    id: row.product.id.toString(),
                    name: row.product.name,
                    retailrocketItemId: row.product.retailrocketItemId,
                  },
                },
              ]
            : [],
        ),
      truncated: rows.length > 200,
    };
  }
}
