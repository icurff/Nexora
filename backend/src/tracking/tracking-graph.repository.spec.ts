import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../database/prisma.service.js';
import { TrackingGraphRepository } from './tracking-graph.repository.js';

function setup() {
  const db = {
    visitor: { findUnique: vi.fn() },
    trackingSession: { findFirst: vi.fn() },
    interactionEvent: { findMany: vi.fn() },
  };
  return {
    db,
    repo: new TrackingGraphRepository(db as unknown as PrismaService),
  };
}
describe('TrackingGraphRepository', () => {
  it('returns no identity without a valid cookie, with no database writes or reads', async () => {
    const { db, repo } = setup();
    for (const token of [undefined, '123', '../session'])
      expect(await repo.snapshot(token, new Date())).toEqual({
        session: null,
        events: [],
        truncated: false,
      });
    expect(db.visitor.findUnique).not.toHaveBeenCalled();
  });
  it('never falls back to another visitor or expired session', async () => {
    const { db, repo } = setup();
    db.visitor.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 123n });
    db.trackingSession.findFirst.mockResolvedValue(null);
    expect((await repo.snapshot('a'.repeat(43), new Date())).events).toEqual(
      [],
    );
    expect(
      (await repo.snapshot('a'.repeat(43), new Date())).session,
    ).toBeNull();
    expect(db.interactionEvent.findMany).not.toHaveBeenCalled();
    const args = db.trackingSession.findFirst.mock.calls[0][0] as {
      where: { visitorId: bigint; endedAt: null; lastSeenAt: { gt: Date } };
    };
    expect(args.where.visitorId).toBe(123n);
    expect(args.where.endedAt).toBeNull();
    expect(args.where.lastSeenAt.gt.getTime()).toBeGreaterThan(
      Date.now() - 30 * 60 * 1000 - 1000,
    );
    expect(args.where.lastSeenAt.gt.getTime()).toBeLessThanOrEqual(
      Date.now() - 30 * 60 * 1000,
    );
  });
  it('scopes LIVE views to the cookie owner and active session, preserves bigint IDs and chronological window', async () => {
    const { db, repo } = setup();
    const now = new Date();
    const since = new Date(now.getTime() - 10000);
    const id = 9007199254740993n;
    db.visitor.findUnique.mockResolvedValue({ id: 123n });
    db.trackingSession.findFirst.mockResolvedValue({ id, startedAt: now });
    db.interactionEvent.findMany.mockResolvedValue([
      {
        eventId: 'newer',
        occurredAt: now,
        receivedAt: now,
        product: { id, name: 'Real product', retailrocketItemId: '506' },
      },
      {
        eventId: 'older',
        occurredAt: since,
        receivedAt: since,
        product: { id: 2n, name: 'Another', retailrocketItemId: null },
      },
    ]);
    const result = await repo.snapshot('a'.repeat(43), since);
    expect(db.visitor.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update('a'.repeat(43)).digest('hex'),
      },
      select: { id: true },
    });
    expect(db.interactionEvent.findMany.mock.calls[0][0]).toMatchObject({
      where: {
        visitorId: 123n,
        trackingSessionId: id,
        dataOrigin: 'LIVE',
        eventType: 'view',
        receivedAt: { gt: since },
      },
      take: 201,
    });
    expect(result.session?.id).toBe(String(id));
    expect(result.events.map((e) => e.eventId)).toEqual(['older', 'newer']);
    expect(result.events[1].product.id).toBe(String(id));
    expect(result.events[0].product.retailrocketItemId).toBeNull();
    expect(JSON.stringify(result)).not.toContain('tokenHash');
    expect(JSON.stringify(result)).not.toContain('visitorId');
  });
  it('bounds the response to the most recent 200 events and reports truncation', async () => {
    const { db, repo } = setup();
    const now = new Date();
    db.visitor.findUnique.mockResolvedValue({ id: 1n });
    db.trackingSession.findFirst.mockResolvedValue({ id: 2n, startedAt: now });
    db.interactionEvent.findMany.mockResolvedValue(
      Array.from({ length: 201 }, (_, i) => ({
        eventId: String(i),
        occurredAt: now,
        receivedAt: now,
        product: { id: 1n, name: 'Product', retailrocketItemId: null },
      })),
    );
    const result = await repo.snapshot('a'.repeat(43), now);
    expect(result.truncated).toBe(true);
    expect(result.events).toHaveLength(200);
    expect(result.events[0].eventId).toBe('199');
    expect(result.events[199].eventId).toBe('0');
  });
});
