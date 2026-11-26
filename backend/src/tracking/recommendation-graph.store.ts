import { Injectable } from '@nestjs/common';
import type { AiScoreBreakdown } from '../recommendation/ai-recommendation.client.js';

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
    rank?: number;
    score_breakdown?: AiScoreBreakdown;
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
      const breakdown =
        row.source === 'lightgcn_session'
          ? validatedBreakdown(row.score_breakdown, row.score)
          : undefined;

      items.push({
        productId: row.productId,
        name: row.name,
        source: row.source,
        reason: row.reason,
        ...(row.source === 'lightgcn_session' &&
        typeof row.rank === 'number' &&
        Number.isSafeInteger(row.rank) &&
        row.rank > 0
          ? { rank: row.rank }
          : {}),
        ...(breakdown
          ? { score_breakdown: breakdown }
          : {}),
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


function validatedBreakdown(
  value: unknown,
  score: unknown,
): AiScoreBreakdown | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if (typeof score !== 'number' || !Number.isFinite(score))
    return undefined;

  const b = value as AiScoreBreakdown;

  const parts = [
    [b.session_score, b.session_weight, b.session_contribution],
    [b.popularity_score, b.popularity_weight, b.popularity_contribution],
    [b.user_score, b.user_weight, b.user_contribution],
  ] as const;

  let total = 0;
  let weights = 0;

  for (const [raw, weight, contribution] of parts) {
    if (
      !Number.isFinite(weight) ||
      weight < 0 ||
      weight > 1 ||
      !Number.isFinite(contribution)
    ) return undefined;

    if (raw === null) {
      if (weight !== 0 || contribution !== 0)
        return undefined;
    } else if (
      !Number.isFinite(raw) ||
      Math.abs(raw * weight - contribution) > 1e-5
    ) return undefined;

    weights += weight;
    total += contribution;
  }

  if (
    !Number.isFinite(b.final_score) ||
    Math.abs(weights - 1) > 1e-5 ||
    Math.abs(total - b.final_score) > 1e-5 ||
    Math.abs(score - b.final_score) > 1e-5
  ) return undefined;

  return {
    session_score: b.session_score,
    popularity_score: b.popularity_score,
    user_score: b.user_score,
    session_weight: b.session_weight,
    popularity_weight: b.popularity_weight,
    user_weight: b.user_weight,
    session_contribution: b.session_contribution,
    popularity_contribution: b.popularity_contribution,
    user_contribution: b.user_contribution,
    final_score: b.final_score,
    ...(b.session_geometry &&
    typeof b.session_geometry.model_run_id === 'string' &&
    b.session_geometry.model_run_id.length <= 200 &&
    Array.isArray(b.session_geometry.vector) &&
    b.session_geometry.vector.length > 0 &&
    b.session_geometry.vector.length <= 512 &&
    b.session_geometry.vector.every((v) => typeof v === 'number' && Number.isFinite(v))
      ? { session_geometry: {
          model_run_id: b.session_geometry.model_run_id,
          vector: [...b.session_geometry.vector],
        } }
      : {}),
  };
}
