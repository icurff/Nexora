import { useEffect, useMemo, useState } from 'react';
import { Graph } from './Graph';
import type { GraphData, GraphNode } from './data';
import { liveNodes, validateLiveSnapshot } from './live-session';
import type { LiveSnapshot } from './live-session';
type SharedSession = LiveSnapshot & { userId: string | null };
export function SharedSessions({
  data,
  active,
}: {
  data: GraphData;
  active: boolean;
}) {
  const [snapshot, setSnapshot] = useState<SharedSession[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [rotate, setRotate] = useState(true);
  const [reset, setReset] = useState(0);
  const [since, setSince] = useState(() =>
    new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  );
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let timer = 0;
    let controller: AbortController;
    async function poll() {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(
          `/api/v1/tracking/shared-graph?since=${encodeURIComponent(since)}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok)
          throw new Error(
            response.status === 403
              ? 'Chế độ xem chung chưa bật. Đặt NEXORA_SHARED_GRAPH=true ở backend rồi khởi động lại.'
              : `Không đọc được database chung (HTTP ${response.status}).`,
          );
        const value = await response.json();
        if (
          !Array.isArray(value.sessions) ||
          value.sessions.length > 20 ||
          typeof value.truncated !== 'boolean'
        )
          throw new Error('Dữ liệu phiên chung không hợp lệ.');
        const sessions = value.sessions.map((entry: SharedSession) => {
          const valid = validateLiveSnapshot(entry);
          if (
            !valid.session ||
            (entry.userId !== null && !/^\d+$/.test(entry.userId))
          )
            throw new Error('Mã phiên/user không hợp lệ.');
          return { ...valid, userId: entry.userId };
        });
        if (mounted) {
          setSnapshot(sessions);
          setTruncated(value.truncated);
          setError('');
        }
      } catch (e) {
        if (mounted) setError((e as Error).message);
      } finally {
        window.clearTimeout(timeout);
        if (mounted) timer = window.setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => {
      mounted = false;
      controller?.abort();
      window.clearTimeout(timer);
    };
  }, [since, active]);
  const scene = useMemo(() => {
    const nodes = new Map<string, GraphNode>();
    const groups = snapshot.map((entry) => {
      const source = `session:${entry.session!.id}`;
      const angle = Number(BigInt(entry.session!.id) % 97n) * 2.399963;
      nodes.set(source, {
        key: source,
        type: 'user',
        index: nodes.size,
        sourceId: entry.session!.id,
        name: entry.userId
          ? `User #${entry.userId} · Phiên #${entry.session!.id}`
          : `Khách · Phiên #${entry.session!.id}`,
        layout: 'schematic',
        position: [
          Math.cos(angle) * 80,
          20 + Math.sin(angle) * 30,
          Math.sin(angle) * 80,
        ],
        vector: [],
        norm: 0,
        popularity: null,
        trainDegree: null,
      });
      for (const node of liveNodes(entry)) {
        const previous = nodes.get(node.key);
        nodes.set(node.key, {
          ...node,
          observed: node.observed || previous?.observed,
        });
      }
      return {
        source,
        historyKeys: [
          ...new Set(entry.events.map((e) => `product:${e.product.id}`)),
        ],
        recommendationKeys: (entry.recommendation?.items ?? [])
          .filter((i) => i.source === 'lightgcn_session')
          .map((i) => `product:${i.product.id}`),
        ruleRecommendationKeys: (entry.recommendation?.items ?? [])
          .filter((i) => i.source === 'rule_based')
          .map((i) => `product:${i.product.id}`),
      };
    });
    return {
      data: { ...data, nodes: [...nodes.values()] },
      session: { historyKeys: [], recommendationKeys: [], groups },
    };
  }, [data, snapshot]);
  const node = scene.data.nodes.find((n) => n.key === selected);
  return (
    <section className="workspace">
      <div className="graph-panel">
        <div className="graph-toolbar">
          <h2>
            Tất cả phiên <span>LIVE</span>
          </h2>
          <div className="graph-actions">
            <button onClick={() => setRotate(!rotate)}>
              {rotate ? 'Dừng xoay' : 'Tự xoay'}
            </button>
            <button onClick={() => setReset(reset + 1)}>
              Đặt lại góc nhìn
            </button>
          </div>
        </div>
        <div className="plot">
          <Graph
            data={scene.data}
            mode="coldstart"
            session={scene.session}
            users
            items
            rotate={rotate}
            links
            selected={selected}
            reset={reset}
            onSelect={setSelected}
          />
        </div>
        <div className="legend">
          <span>● users / phiên</span>
          <span>● Items</span>
          <span>━ VIEW đã lưu DB · xanh lá</span>
          <span>┄ AI đề xuất · vàng</span>
          <span>┄ Gợi ý quy tắc · xanh lam</span>
        </div>
      </div>
      <aside>
        <section className="panel">
          <h2>Database chung · {snapshot.length} phiên</h2>
          <p>
            Không cần đăng nhập admin trong bản demo. Mỗi node xanh dương là một
            phiên thật; user đăng nhập được ghi bằng mã User. Hai thiết bị có
            thể là hai phiên của cùng user.
          </p>
          <p className="hint">
            Tối đa 20 phiên đang hoạt động trong 30 phút gần nhất, 200
            VIEW/phiên kể từ {new Date(since).toLocaleString('vi-VN')}. Cập nhật
            mỗi 2,5 giây. Đề xuất chỉ là lô API gần nhất còn trong bộ nhớ
            backend; vị trí là sơ đồ minh họa.
          </p>
          <button
            onClick={() => {
              setSince(new Date().toISOString());
              setSnapshot([]);
            }}
          >
            Theo dõi từ bây giờ
          </button>
          {error && (
            <p role="alert" className="session-error">
              {error} Giữ bản đọc thành công gần nhất nếu có.
            </p>
          )}
          {truncated && (
            <p role="status">
              Có hơn 20 phiên; chỉ hiện 20 phiên hoạt động gần nhất.
            </p>
          )}
          {!snapshot.length && !error && (
            <p>
              Chưa có phiên đang hoạt động. Mở Nexora trên thiết bị dùng chung
              backend để bắt đầu.
            </p>
          )}
          <div className="neighbors">
            {snapshot.map((entry) => (
              <button
                key={entry.session!.id}
                onClick={() => setSelected(`session:${entry.session!.id}`)}
              >
                {entry.userId ? `User #${entry.userId}` : 'Khách'} · Phiên #
                {entry.session!.id}
                <small>
                  {entry.events.length} VIEW ·{' '}
                  {entry.recommendation?.items.length ?? 0} đề xuất
                </small>
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Node đang chọn</h2>
          <p>{node?.name ?? 'Bấm node hoặc chọn phiên để kiểm tra.'}</p>
          {node && (
            <p>
              {node.type === 'item'
                ? `Product #${node.productId} · RetailRocket ${node.sourceId || 'chưa mapping'}`
                : `Tracking session #${node.sourceId}`}
            </p>
          )}
        </section>
      </aside>
    </section>
  );
}
