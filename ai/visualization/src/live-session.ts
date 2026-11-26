import type { GraphNode } from './data';
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
export function liveNodes(
  snapshot: LiveSnapshot,
  catalog: CatalogProduct[] = [],
): GraphNode[] {
  const viewed = new Map(
    snapshot.events.map((event) => [event.product.id, event.product]),
  );
  const products = new Map(
    catalog.map((product) => [
      product.id,
      { ...product, retailrocketItemId: null as string | null },
    ]),
  );
  const recommended = new Map(
    (snapshot.recommendation?.items ?? []).map((item) => [
      item.product.id,
      item,
    ]),
  );
  for (const [id, item] of recommended) products.set(id, item.product);
  for (const [id, product] of viewed) products.set(id, product);
  return [...products.values()].map((product, index) => {
    // Product-ID based placement remains unchanged when all-items is toggled.
    let hash = 2166136261;
    for (const char of product.id)
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const angle = hash * 2.399963229728653;
    const z = ((Math.imul(hash, 2654435761) >>> 0) / 4294967295) * 2 - 1;
    const radius = 25 + (hash % 40);
    const plane = Math.sqrt(Math.max(0, 1 - z * z));
    return {
      key: `product:${product.id}`,
      type: 'item',
      index,
      sourceId: product.retailrocketItemId ?? '',
      productId: product.id,
      name: product.name,
      layout: 'schematic',
      observed: viewed.has(product.id),
      mappingUnknown: !viewed.has(product.id) && !recommended.has(product.id),
      recommendationSource: recommended.get(product.id)?.source,
      position: [
        Math.cos(angle) * radius * plane,
        z * radius,
        Math.sin(angle) * radius * plane,
      ],
      vector: [],
      norm: 0,
      popularity: null,
      trainDegree: null,
    };
  });
}
