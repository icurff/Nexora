import { Injectable } from '@nestjs/common';

export interface GraphRecommendation {
  id: string;
  generatedAt: string;
  surface: 'home' | 'detail' | 'cart';
  contextProductId?: string;
  items: {
    productId: string;
    name: string;
    source: 'lightgcn_session' | 'rule_based';
    reason: string;
    score?: number;
  }[];
}

/** Bounded, transient copy of the latest actual API response per tracking session.
 * No inference, tracking writes, credentials or account/profile data are stored.
 */
@Injectable()
export class RecommendationGraphStore {
  private readonly cache = new Map<string, GraphRecommendation>();
  private sequence = 0;
  private readonly ttl = 30 * 60 * 1000;

  record(
    sessionId: bigint,
    surface: GraphRecommendation['surface'],
    value: unknown,
    contextProductId?: string,
  ) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('items' in value) ||
      !Array.isArray(value.items)
    )
      return;
    const items: GraphRecommendation['items'] = [];
    const seen = new Set<string>();
    for (const raw of value.items as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as Record<string, unknown>;
      if (
        typeof row.productId !== 'string' ||
        !/^[1-9]\d*$/.test(row.productId) ||
        typeof row.name !== 'string' ||
        typeof row.reason !== 'string' ||
        (row.source !== 'lightgcn_session' && row.source !== 'rule_based') ||
        seen.has(row.productId)
      )
        continue;
      seen.add(row.productId);
      items.push({
        productId: row.productId,
        name: row.name,
        source: row.source,
        reason: row.reason,
        ...(typeof row.score === 'number' && Number.isFinite(row.score)
          ? { score: row.score }
          : {}),
      });
      if (items.length === 20) break;
    }
    const now = Date.now();
    for (const [key, entry] of this.cache)
      if (now - Date.parse(entry.generatedAt) >= this.ttl)
        this.cache.delete(key);
    const key = sessionId.toString();
    this.cache.delete(key);
    if (this.cache.size >= 500)
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, {
      id: `${now}:${++this.sequence}`,
      generatedAt: new Date(now).toISOString(),
      surface,
      contextProductId,
      items,
    });
  }

  read(sessionId: bigint, since: Date) {
    const key = sessionId.toString();
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - Date.parse(entry.generatedAt) >= this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    if (Date.parse(entry.generatedAt) <= since.getTime()) return undefined;
    return entry;
  }
}
