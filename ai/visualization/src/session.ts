import { parseBreakdown } from './ScoreBreakdown';
import type { RankingBreakdown } from './ScoreBreakdown';
import type { GraphNode } from './data';

export interface SessionItem {
  rank?: number;
  breakdown?: RankingBreakdown;
  sourceId: string;
  key: string;
  score: number;
  reason: 'SIMILAR_TO_RECENT_VIEW' | 'POPULAR_TRAIN';
  recentSourceId?: string;
  cosine?: number;
  popularity?: number;
}
export interface SessionResult {
  strategy:
    'cold_session_hybrid' | 'popularity_only' |
    'no_known_session_items' | 'no_eligible_candidates';
  policy?: {
    alpha: number;
    history_length: number;
    recency_decay: number;
  };
  items: SessionItem[];
}
export interface SessionScene {
  groups?: {
    source: string;
    historyKeys: string[];
    recommendationKeys: string[];
    ruleRecommendationKeys: string[];
  }[];
  historyKeys: string[];
  recommendationKeys: string[];
  ruleRecommendationKeys?: string[];
}
export function itemId(value: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error('ID phải là số nguyên không âm trong phạm vi an toàn.');
  }
  return Number(value);
}
export function sessionPayload(history: string[], items: GraphNode[]) {
  if (history.length > 200)
    throw new Error('Tối đa 200 lượt xem mỗi phiên demo.');
  return {
    recent_itemids: history.map(itemId),
    candidate_itemids: items.map((n) => itemId(n.sourceId)),
    exclude_itemids: [],
    limit: 5,
  };
}
// Scoring is performed by the real serving endpoint over all active model item embeddings.
// Only the final candidate pool is restricted to the displayed item sample.
export async function recommendSession(
  history: string[],
  items: GraphNode[],
  signal: AbortSignal,
): Promise<SessionResult> {
  const payload = sessionPayload(history, items);
  const response = await fetch('/ai-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok)
    throw new Error(
      `AI serving chưa sẵn sàng (HTTP ${response.status}). Kiểm tra dịch vụ tại 127.0.0.1:8000 rồi bấm Thử lại.`,
    );
  const result = await response.json();
  const strategies = [
    'cold_session_hybrid',
    'popularity_only',
    'no_known_session_items',
    'no_eligible_candidates',
  ];
  if (
    result.source !== 'lightgcn_session' ||
    !strategies.includes(result.strategy) ||
    !Array.isArray(result.items)
  )
    throw new Error('AI trả về dữ liệu không đúng hợp đồng session.');
  const rankedStrategy =
    result.strategy === 'cold_session_hybrid' ||
    result.strategy === 'popularity_only';

  const policy = result.policy;

  if (
    rankedStrategy &&
    (!policy ||
      !Number.isFinite(policy.alpha) ||
      policy.alpha < 0 ||
      policy.alpha > 1 ||
      !Number.isInteger(policy.history_length) ||
      policy.history_length < 1 ||
      !Number.isFinite(policy.recency_decay) ||
      policy.recency_decay <= 0 ||
      policy.recency_decay > 1 ||
      (result.strategy === 'popularity_only' && policy.alpha !== 0))
  )
    throw new Error(
      'Chính sách AI đã thay đổi so với chế độ demo. Cần đối chiếu serving trước khi hiển thị.',
    );
  if (
    result.items.length > payload.limit ||
    (!rankedStrategy && result.items.length)
  )
    throw new Error('Kết quả AI không nhất quán với trạng thái phiên.');
  const byId = new Map(items.map((n) => [n.sourceId, n]));
  const seen = new Set(history);
  const returned = new Set<string>();
  const mapped = result.items.map(
    (entry: Record<string, unknown>): SessionItem => {
      if (
        !Number.isSafeInteger(entry.retailrocket_itemid) ||
        typeof entry.score !== 'number' ||
        !Number.isFinite(entry.score)
      )
        throw new Error('ID hoặc điểm AI không hợp lệ.');
      const sourceId = String(entry.retailrocket_itemid);
      const node = byId.get(sourceId);
      if (!node || seen.has(sourceId) || returned.has(sourceId))
        throw new Error(
          'AI trả Item ngoài tập ứng viên, đã xem hoặc trùng lặp.',
        );
      returned.add(sourceId);
      const evidence = entry.evidence as Record<string, unknown> | undefined;
      if (entry.reason_code === 'SIMILAR_TO_RECENT_VIEW') {
        if (
          !evidence ||
          !Number.isSafeInteger(evidence.recent_source_item_id) ||
          !seen.has(String(evidence.recent_source_item_id)) ||
          typeof evidence.cosine_similarity !== 'number' ||
          !Number.isFinite(evidence.cosine_similarity)
        )
          throw new Error('Bằng chứng Item tương tự không hợp lệ.');
        return {
          sourceId,
          key: node.key,
          score: entry.score,
          rank: typeof entry.rank === 'number'
            ? entry.rank : undefined,
          breakdown: parseBreakdown(
            entry.score_breakdown,
            entry.score,
          ),
          reason: entry.reason_code,
          recentSourceId: String(evidence.recent_source_item_id),
          cosine: evidence.cosine_similarity,
        };
      }
      if (
        entry.reason_code !== 'POPULAR_TRAIN' ||
        !evidence ||
        typeof evidence.train_user_count !== 'number' ||
        !Number.isFinite(evidence.train_user_count) ||
        evidence.train_user_count < 0
      )
        throw new Error('Bằng chứng popularity không hợp lệ.');
      return {
        sourceId,
        key: node.key,
        score: entry.score,
          rank: typeof entry.rank === 'number'
            ? entry.rank : undefined,
          breakdown: parseBreakdown(
            entry.score_breakdown,
            entry.score,
          ),
        reason: entry.reason_code,
        popularity: evidence.train_user_count,
      };
    },
  );
  return {
    strategy: result.strategy,
    items: mapped,
    policy: result.policy,
  };
}
