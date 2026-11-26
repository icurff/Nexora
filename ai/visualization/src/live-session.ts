import type { GraphData, GraphNode } from './data';
import {
  CATALOG500_RUN, CATALOG500_HISTORY, CATALOG500_DECAY, CATALOG500_MAPPING,
} from './catalog500-map';
export interface LiveSnapshot {
  session: { id: string; startedAt: string } | null;
  events: {
    eventId: string;
    occurredAt: string;
    receivedAt: string;
    product: { id: string; name: string; retailrocketItemId: string | null };
  }[];
  truncated: boolean;
  recommendation?: {
    id: string;
    generatedAt: string;
    surface: 'home' | 'detail' | 'cart';
    contextProductId?: string;
    items: {
      product: { id: string; name: string; retailrocketItemId: string | null };
      source: 'lightgcn_session' | 'rule_based';
      reason: string;
      score?: number;
      rank?: number;
      score_breakdown?: unknown;
    }[];
  };
}
export const emptyLive: LiveSnapshot = {
  session: null,
  events: [],
  truncated: false,
};
export async function readLiveSession(
  since: string,
  signal: AbortSignal,
): Promise<LiveSnapshot> {
  const response = await fetch(
    `/api/v1/tracking/session-graph?since=${encodeURIComponent(since)}`,
    { cache: 'no-store', credentials: 'same-origin', signal },
  );
  if (!response.ok)
    throw new Error(
      `Không đọc được tracking (HTTP ${response.status}). Kiểm tra backend tại cổng 3000.`,
    );
  return validateLiveSnapshot(await response.json());
}
export function validateLiveSnapshot(value: unknown): LiveSnapshot {
  if (!value || typeof value !== 'object')
    throw new Error('Dữ liệu tracking không hợp lệ.');
  const data = value as LiveSnapshot;
  if (
    !Array.isArray(data.events) ||
    typeof data.truncated !== 'boolean' ||
    (data.session !== null && !/^\d+$/.test(data.session?.id ?? ''))
  )
    throw new Error('Tracking trả về dữ liệu không hợp lệ.');
  for (const event of data.events)
    if (
      !event.product ||
      !/^\d+$/.test(event.product.id) ||
      typeof event.product.name !== 'string' ||
      typeof event.eventId !== 'string'
    )
      throw new Error('Sự kiện VIEW không hợp lệ.');
  if (data.recommendation) {
    if (
      typeof data.recommendation.id !== 'string' ||
      !['home', 'detail', 'cart'].includes(data.recommendation.surface) ||
      !Array.isArray(data.recommendation.items)
    )
      throw new Error('Đề xuất trả về không hợp lệ.');
    for (const entry of data.recommendation.items)
      if (
        !entry.product ||
        !/^\d+$/.test(entry.product.id) ||
        typeof entry.product.name !== 'string' ||
        !['lightgcn_session', 'rule_based'].includes(entry.source) ||
        typeof entry.reason !== 'string' ||
        (entry.score !== undefined && !Number.isFinite(entry.score))
      )
        throw new Error('Sản phẩm đề xuất không hợp lệ.');
  }
  return data;
}
export interface CatalogProduct {
  id: string;
  name: string;
  retailrocketItemId?: string | null;
}
interface CatalogPage {
  items: CatalogProduct[];
  page: number;
  total: number;
  totalPages: number;
}
export async function readCatalog(
  signal: AbortSignal,
): Promise<CatalogProduct[]> {
  async function page(number: number): Promise<CatalogPage> {
    const res = await fetch(`/api/v1/products?page=${number}&pageSize=100`, {
      signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!res.ok)
      throw new Error(`Không tải được catalog (HTTP ${res.status}).`);
    const data = (await res.json()) as CatalogPage;
    if (
      !Array.isArray(data.items) ||
      data.page !== number ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      !Number.isSafeInteger(data.totalPages) ||
      data.totalPages < 0 ||
      data.totalPages > 200
    )
      throw new Error(
        'Catalog không đúng định dạng hoặc vượt giới hạn 20.000 sản phẩm.',
      );
    for (const product of data.items)
      if (
        typeof product.id !== 'string' ||
        !/^\d+$/.test(product.id) ||
        typeof product.name !== 'string'
      )
        throw new Error('Thông tin sản phẩm không hợp lệ.');
    return data;
  }
  const first = await page(1);
  const pages = [first];
  // Bounded batches avoid flooding the commerce backend for large catalogs.
  for (let start = 2; start <= first.totalPages; start += 5) {
    pages.push(
      ...(await Promise.all(
        Array.from(
          { length: Math.min(5, first.totalPages - start + 1) },
          (_, i) => page(start + i),
        ),
      )),
    );
  }
  if (
    pages.some(
      (p) => p.total !== first.total || p.totalPages !== first.totalPages,
    )
  )
    throw new Error(
      'Catalog vừa thay đổi khi tải. Hãy tắt/bật nút để tải lại.',
    );
  const products = pages.flatMap((p) => p.items);
  if (
    products.length !== first.total ||
    new Set(products.map((p) => p.id)).size !== first.total
  )
    throw new Error(
      'Chưa tải đủ sản phẩm hoặc catalog có thay đổi. Hãy tắt/bật nút để thử lại.',
    );
  return products.sort((a, b) =>
    BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0,
  );
}
// Same coordinates and full-dimensional vectors as the verified training export.
function itemIndex(data: GraphData): Map<string, GraphNode> {
  return new Map(data.nodes.filter((n) => n.type === 'item').map((n) => [n.sourceId, n]));
}

export function liveNodes(
  snapshot: LiveSnapshot,
  catalog: CatalogProduct[] = [],
  data: GraphData | null = null,
): GraphNode[] {
  if (!data) return [];
  const indexed = itemIndex(data);
  const fallbackMapping =
    data.model.runId === CATALOG500_RUN &&
    indexed.size === 500 &&
    Object.values(CATALOG500_MAPPING).every((id) => indexed.has(id));

  const viewed = new Map(
    snapshot.events.map((event) => [event.product.id, event.product]),
  );
  const products = new Map(
    catalog.map((product) => [
      product.id,
      {
        ...product,
        retailrocketItemId: product.retailrocketItemId === undefined
          ? (fallbackMapping ? CATALOG500_MAPPING[product.id] ?? null : null)
          : product.retailrocketItemId,
      },
    ]),
  );
  const recommended = new Map(
    (snapshot.recommendation?.items ?? []).map((item) => [item.product.id, item]),
  );
  for (const [id, item] of recommended) products.set(id, item.product);
  for (const [id, product] of viewed) products.set(id, product);

  return [...products.values()].flatMap((product): GraphNode[] => {
    const trained = product.retailrocketItemId
      ? indexed.get(product.retailrocketItemId) : undefined;
    // Never invent a position for a product without a trained vector.
    if (!trained) return [];
    return [{
      ...trained,
      key: `product:${product.id}`,
      productId: product.id,
      name: product.name,
      layout: 'pca',
      observed: viewed.has(product.id),
      mappingUnknown: false,
      recommendationSource: recommended.get(product.id)?.source,
    }];
  });
}

export function projectVector(
  vector: number[], data: GraphData,
): [number, number, number] | null {
  const { mean, components, displayScale } = data.projection;
  const dim = data.model.config.embedding_dim;
  if (!Array.isArray(mean) || mean.length !== dim ||
      !Array.isArray(components) || components.length !== 3 ||
      components.some((axis) => !Array.isArray(axis) || axis.length !== dim ||
        !axis.every(Number.isFinite)) ||
      !mean.every(Number.isFinite) ||
      !Number.isFinite(displayScale) || displayScale <= 0 ||
      vector.length !== dim || !vector.every(Number.isFinite)) return null;
  const position = components.map((axis) =>
    axis.reduce((sum, value, i) => sum + value * (vector[i] - mean[i]), 0)
      / displayScale * 90);
  return position.every(Number.isFinite)
    ? position as [number, number, number] : null;
}

function unit(vector: number[]): number[] {
  const norm = Math.max(Math.hypot(...vector), 1e-12);
  return vector.map((v) => v / norm);
}

export function liveSessionNode(
  snapshot: LiveSnapshot, data: GraphData | null,
): GraphNode | null {
  if (!snapshot.session || !data) return null;
  let vector: number[] | null = null;
  let provenance: 'inference' | 'view-only' = 'view-only';
  const recommendation = snapshot.recommendation;
  // Do not attach the previous recommendation vector to a newer VIEW state.
  const generated = Date.parse(recommendation?.generatedAt ?? '');
  const fresh = Number.isFinite(generated) && snapshot.events.every(
    (event) => Date.parse(event.receivedAt) <= generated,
  );
  if (fresh) {
    for (const entry of recommendation?.items ?? []) {
      if (entry.source !== 'lightgcn_session') continue;
      const breakdown = entry.score_breakdown as {
        session_geometry?: { model_run_id?: string; vector?: unknown };
      } | undefined;
      const geometry = breakdown?.session_geometry;
      if (geometry?.model_run_id === data.model.runId &&
          Array.isArray(geometry.vector) &&
          geometry.vector.length === data.model.config.embedding_dim &&
          geometry.vector.every((v) => typeof v === 'number' && Number.isFinite(v))) {
        vector = geometry.vector as number[];
        provenance = 'inference';
        break;
      }
    }
  }
  // A separately labelled reconstruction from observed VIEWs, not an assertion
  // that these are the exact inputs to the website's most recent inference.
  if (!vector && data.model.runId === CATALOG500_RUN) {
    const indexed = itemIndex(data);
    const history = snapshot.events.slice().sort(
      (a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt),
    ).flatMap((event) => {
      const id = event.product.retailrocketItemId;
      const node = id ? indexed.get(id) : undefined;
      return node ? [node.vector] : [];
    }).slice(-CATALOG500_HISTORY);
    if (history.length) {
      const sum = Array.from({ length: data.model.config.embedding_dim }, () => 0);
      history.forEach((v, index) => {
        const weight = CATALOG500_DECAY ** (history.length - 1 - index);
        unit(v).forEach((value, dim) => { sum[dim] += weight * value; });
      });
      vector = unit(sum);
    }
  }
  if (!vector) return null;
  const position = projectVector(vector, data);
  if (!position) return null;
  return {
    key: `session:${snapshot.session.id}`,
    type: 'user',
    index: -1,
    sourceId: snapshot.session.id,
    name: `Phiên #${snapshot.session.id} · ${provenance === 'inference' ? 'AI vector' : 'VIEW-only'}`,
    layout: 'pca',
    sessionGeometry: provenance,
    position,
    vector,
    norm: Math.hypot(...vector),
    popularity: null,
    trainDegree: null,
  };
}
