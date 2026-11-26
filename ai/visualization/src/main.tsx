import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SharedSessions } from './SharedSessions';
import { Graph } from './Graph';
import { LiveSession } from './LiveSession';
import { ScoreBreakdown, parseBreakdown } from './ScoreBreakdown';
import { emptyLive, liveNodes, liveSessionNode, readCatalog } from './live-session';
import type { CatalogProduct, LiveSnapshot } from './live-session';
import { loadData } from './data';
import type { GraphData, GraphNode, GraphMode } from './data';
import './style.css';
const fmt = (v: number) => v.toLocaleString('vi-VN');
const percent = (v: number) => `${(v * 100).toFixed(2)}%`;
function App() {
  const [data, setData] = useState<GraphData | null>(null);
  const [shared, setShared] = useState(false);
  const [mode, setMode] = useState<GraphMode>('interaction');
  const [live, setLive] = useState<LiveSnapshot>(emptyLive);
  // Owned by the app so unmounting the LIVE panel cannot reset the window.
  const [liveSince, setLiveSince] = useState<string | null>(null);
  const resetLive = useCallback(() => {
    setLive(emptyLive);
    setLiveSince(new Date().toISOString());
  }, []);
  const acceptLive = useCallback((next: LiveSnapshot) => {
    setLive((prev) =>
      prev.session?.id === next.session?.id &&
      prev.truncated === next.truncated &&
      prev.recommendation?.id === next.recommendation?.id &&
      prev.events.map((e) => e.eventId).join(',') ===
        next.events.map((e) => e.eventId).join(',')
        ? prev
        : next,
    );
  }, []);
  const [showAllItems, setShowAllItems] = useState(false);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  useEffect(() => {
    if (mode !== 'coldstart' || !showAllItems || catalog !== null) return;
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    setCatalogLoading(true);
    setCatalogError('');
    readCatalog(controller.signal)
      .then((value) => {
        if (active) setCatalog(value);
      })
      .catch((e: Error) => {
        if (active)
          setCatalogError(
            e.name === 'AbortError'
              ? 'Tải catalog quá lâu. Tắt/bật nút để thử lại.'
              : e.message,
          );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [mode, showAllItems, catalog]);
  const viewedItems = useMemo(
    () => liveNodes(live, [], data).filter((n) => n.observed),
    [live, data],
  );
  const liveItems = useMemo(
    () => liveNodes(live, showAllItems ? (catalog ?? []) : [], data),
    [live, showAllItems, catalog, data],
  );
  const livePoint = useMemo(() => liveSessionNode(live, data), [live, data]);
  const session = useMemo(() => {
    const keys = new Set(liveItems.map((n) => n.key));
    const historyKeys = viewedItems.map((n) => n.key);
    const recommendationKeys = (live.recommendation?.items ?? [])
      .filter((n) => n.source === 'lightgcn_session')
      .map((n) => `product:${n.product.id}`).filter((key) => keys.has(key));
    const ruleRecommendationKeys = (live.recommendation?.items ?? [])
      .filter((n) => n.source === 'rule_based')
      .map((n) => `product:${n.product.id}`).filter((key) => keys.has(key));
    return {
      historyKeys, recommendationKeys, ruleRecommendationKeys,
      groups: livePoint ? [{ source: livePoint.key, historyKeys,
        recommendationKeys, ruleRecommendationKeys }] : [],
    };
  }, [viewedItems, live.recommendation, liveItems, livePoint]);
  const displayedData = useMemo(
    () => (mode === 'coldstart' && data
      ? { ...data, nodes: [...(livePoint ? [livePoint] : []), ...liveItems] }
      : data),
    [data, mode, liveItems, livePoint],
  );
  const [error, setError] = useState('');
  const [users, setUsers] = useState(true),
    [items, setItems] = useState(true);
  const [rotate, setRotate] = useState(
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [links, setLinks] = useState(false),
    [reset, setReset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState('');
  const [provenance, setProvenance] = useState(false);
  useEffect(() => {
    loadData()
      .then((value) => {
        setData(value);
        if (value.interactions) {
          setMode('interaction');
          setLinks(false);
        }
      })
      .catch((e) => setError(String(e.message)));
  }, []);
  const node = displayedData?.nodes.find((n) => n.key === selected);
  const matches =
    query.trim() && displayedData
      ? displayedData.nodes
          .filter(
            (n) =>
              (n.type === 'user' ? users && mode === 'interaction' : items) &&
              (n.sourceId.includes(query.trim()) ||
                n.key.includes(query.trim()) ||
                n.productId?.includes(query.trim()) ||
                n.name?.toLowerCase().includes(query.trim().toLowerCase())),
          )
          .slice(0, 8)
      : [];
  const select = (key: string) => {
    setSelected(key);
    setQuery('');
  };
  const incident = (edge: { source: string; target: string }) =>
    edge.source === selected || edge.target === selected;
  const edges = data?.interactions?.edges.filter(incident) ?? [];
  const modeEdges = data?.interactions?.edges ?? [];
  const hasLiveActivity =
    viewedItems.length > 0 || (live.recommendation?.items.length ?? 0) > 0;
  const visibleCount =
    mode === 'coldstart'
      ? (livePoint ? 1 : 0) + (items ? liveItems.length : 0)
      : data
        ? (users ? data.sample.users : 0) + (items ? data.sample.items : 0)
        : 0;
  const changeMode = (next: GraphMode) => {
    if (next === mode) return;
    setMode(next);
    setSelected(null);
    setQuery('');
    if (next === 'coldstart' && liveSince === null) {
      setLiveSince(new Date().toISOString());
    }
  };
  return (
    <main>
      <header>
        <a className="brand" href="/">
          N<span>✳</span>XORA <b>LAB</b>
        </a>
        <div className="header-note">AI / EMBEDDING EXPLORER</div>
        <span className="local-tag">Dữ liệu cục bộ</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">BÊN TRONG HỆ GỢI Ý</p>
          <h1>
            Một không gian.
            <br />
            <em>Hàng nghìn kết nối.</em>
          </h1>
          <p className="subtitle">
            Khám phá biểu diễn User & Item của Nexora LightGCN trong không gian
            ba chiều.
          </p>
        </div>
        <div className="model-card">
          <span>MÔ HÌNH ĐƯỢC CHỌN</span>
          <strong>{data?.model.family ?? 'LightGCN'}</strong>
          <p>
            {data
              ? `${data.model.config.embedding_dim} chiều · ${data.model.config.layers} lớp · Seed ${data.model.seed}`
              : 'Đang đọc metadata…'}
          </p>
          <small>Embedding đã export cho serving • Không gian PCA</small>
        </div>
      </section>
      {error ? (
        <section className="error" role="alert">
          <h2>Chưa thể mở dữ liệu</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Tải lại</button>
        </section>
      ) : !data ? (
        <p className="loading" role="status">
          Đang tải embedding và metadata thực tế…
        </p>
      ) : (
        <>
          <section className="stats" aria-label="Quy mô dữ liệu">
            <div>
              <span>USER TRONG ARTIFACTS</span>
              <strong>{fmt(data.totals.users)}</strong>
              <small>{fmt(data.sample.users)} trong mẫu</small>
            </div>
            <div>
              <span>ITEM TRONG ARTIFACTS</span>
              <strong>{fmt(data.totals.items)}</strong>
              <small>{fmt(data.sample.items)} trong mẫu</small>
            </div>
            <div>
              <span>KHÔNG GIAN HIỂN THỊ</span>
              <strong>
                {data.model.config.embedding_dim} <i>→</i> 3D
              </strong>
              <small>
                PCA giữ{' '}
                {percent(
                  data.projection.explainedVariance.reduce((a, b) => a + b, 0),
                )}{' '}
                phương sai
              </small>
            </div>
            <div>
              <span>CẠNH TƯƠNG TÁC THẬT</span>
              <strong className={data.interactions ? '' : 'unavailable'}>
                {data.interactions
                  ? fmt(data.interactions.totalEdges)
                  : 'Chưa có'}
              </strong>
              <small>
                {data.interactions
                  ? `${fmt(data.interactions.edges.length)} cạnh trong mẫu · SHA-256 khớp checkpoint`
                  : 'Không có adjacency đã xác minh'}
              </small>
            </div>
          </section>
          <section className="mode-bar" aria-label="Chế độ đồ thị">
            <div className="mode-buttons">
              <button
                aria-pressed={mode === 'interaction'}
                disabled={!data.interactions}
                onClick={() => changeMode('interaction')}
              >
                Tương tác train
              </button>
              <button
                aria-pressed={mode === 'coldstart'}
                onClick={() => changeMode('coldstart')}
              >
                Phiên cold-start
              </button>
            </div>
            <p>
              {mode === 'interaction'
                ? 'Cặp User–Item có thật trong tập train; vị trí node vẫn là PCA embedding.'
                : 'VIEW từ PostgreSQL; dây đề xuất lấy từ kết quả API thực sự trả cho website trong cùng phiên.'}
            </p>
          </section>
          {mode === 'coldstart' && (
            <section className="mode-switch">
              <button aria-pressed={shared} onClick={() => setShared(!shared)}>
                {shared
                  ? 'Chỉ phiên trình duyệt này'
                  : 'Tất cả phiên · Database chung'}
              </button>
            </section>
          )}
          {shared && (
            <div style={mode !== 'coldstart' ? { display: 'none' } : undefined}>
              <SharedSessions data={data!} active={mode === 'coldstart'} />
            </div>
          )}
          <section
            className={`workspace ${mode === 'coldstart' ? 'live-workspace' : ''}`}
            style={
              mode === 'coldstart' && shared ? { display: 'none' } : undefined
            }
          >
            <div className="workspace-primary">
            <div className="graph-panel">
              <div className="graph-toolbar">
                <div>
                  <span className="eyebrow">
                    {mode === 'coldstart'
                      ? 'PHIÊN TRACKING LIVE'
                      : 'KHÔNG GIAN EMBEDDING'}
                  </span>
                  <h2>
                    {mode === 'interaction'
                      ? 'Training graph'
                      : 'Cold-start session'}{' '}
                    <span>3D</span>
                  </h2>
                </div>
                <div className="graph-actions">
                  {mode === 'coldstart' && (
                    <button
                      aria-pressed={showAllItems}
                      onClick={() => {
                        setShowAllItems(!showAllItems);
                        setSelected(null);
                      }}
                    >
                      {showAllItems
                        ? 'Chỉ hiện đã xem'
                        : 'Hiện tất cả sản phẩm'}
                    </button>
                  )}
                  <button
                    aria-pressed={rotate}
                    onClick={() => setRotate(!rotate)}
                  >
                    {rotate ? 'Dừng xoay' : 'Tự xoay'}
                  </button>
                  <button onClick={() => setReset(reset + 1)}>
                    Đặt lại góc nhìn
                  </button>
                </div>
              </div>
              <div className="plot">
                <Graph
                  data={displayedData!}
                  referenceData={data!}
                  mode={mode}
                  session={session}
                  users={mode === 'coldstart' ? true : users}
                  items={items}
                  rotate={rotate}
                  links={links}
                  selected={selected}
                  reset={reset}
                  onSelect={select}
                />
                <div className="plot-label">
                  {mode === 'coldstart'
                    ? 'PHIÊN LIVE / PCA 01 / 02 / 03'
                    : 'PCA 01 / 02 / 03'}
                  <br />
                  <span>
                    {fmt(visibleCount)} node ·{' '}
                    {fmt(
                      mode === 'coldstart'
                        ? items && livePoint
                          ? new Set(session.historyKeys).size +
                            session.recommendationKeys.length +
                            session.ruleRecommendationKeys.length
                          : 0
                        : users && items
                          ? modeEdges.length
                          : 0,
                    )}{' '}
                    cạnh khả dụng
                  </span>
                </div>
                <div className="axis-note">
                  {mode === 'coldstart'
                    ? livePoint
                      ? `Phiên #${live.session?.id} · ${livePoint.sessionGeometry === 'inference' ? 'vector AI tại inference' : 'vector dựng từ VIEW (không phải inference)'}`
                      : hasLiveActivity ? 'Chưa có vector phiên để chiếu PCA' : 'Chờ bạn xem sản phẩm trên website…'
                    : 'Khoảng cách 3D chỉ là xấp xỉ sau chiếu PCA'}
                </div>
              </div>
              <div className="graph-bottom">
                <span>
                  <i
                    className={`dot ${mode === 'coldstart' ? 'session' : 'user'}`}
                  />
                  {mode === 'coldstart' ? 'users' : 'User'}
                </span>
                <span>
                  <i className="dot item" /> Items
                </span>
                {mode === 'coldstart' ? (
                  <>
                    <span className="line-key">━ VIEW đã lưu DB</span>
                    <span className="train-line">┄ AI đề xuất</span>
                    <span className="rule-line">┄ Gợi ý quy tắc</span>
                    {showAllItems && (
                      <span>
                        <i className="dot unseen" />
                        Chưa xem trong khung theo dõi
                      </span>
                    )}
                  </>
                ) : (
                  <span className="line-key train-line">
                    ─ Tương tác train đã xác minh
                  </span>
                )}
                <small>Kéo: xoay · Cuộn: zoom · Chuột phải: pan</small>
              </div>
            </div>
              {mode === 'coldstart' && !shared && (
                <ScoreBreakdown
                  items={(live.recommendation?.items ?? [])
                    .filter((item) => item.source === 'lightgcn_session')
                    .map((item) => ({
                      id: item.product.id,
                      name: item.product.name,
                      rank: item.rank,
                      breakdown:
                        typeof item.score === 'number'
                          ? parseBreakdown(item.score_breakdown, item.score)
                          : undefined,
                    }))}
                />
              )}
            </div>
            <aside>
              {mode === 'coldstart' && showAllItems && (
                <section className="panel" aria-label="Catalog đang hiển thị">
                  <h2>Tất cả sản phẩm công khai</h2>
                  {catalogLoading && catalog === null && (
                    <p role="status">Đang tải đầy đủ catalog…</p>
                  )}
                  {catalogError && catalog === null && (
                    <p role="alert" className="session-error">
                      {catalogError} Graph vẫn giữ các sản phẩm đã xem.
                    </p>
                  )}
                  {catalog !== null && (
                    <p>
                      {fmt(catalog.length)} sản phẩm công khai được tải từ DB.{' '}
                      {fmt(viewedItems.length)} sản phẩm có VIEW và embedding trong khung
                      theo dõi.
                    </p>
                  )}
                  <p className="hint">
                    Node xám chưa được xem trong khung theo dõi nên không có
                    dây. Bấm node chỉ để xem thông tin; mở trang sản phẩm trên
                    website mới ghi VIEW. Catalog là bản chụp lúc bật nút; tải
                    lại trang để cập nhật.
                  </p>
                </section>
              )}
              {mode === 'coldstart' && !shared && (
                <LiveSession
                  since={liveSince!}
                  snapshot={live}
                  onReset={resetLive}
                  onSnapshot={acceptLive}
                  onSelect={select}
                />
              )}
              <section className="panel">
                <h2>Khám phá dữ liệu</h2>
                <label className="search-label" htmlFor="search">
                  {mode === 'coldstart'
                    ? 'Tìm sản phẩm hiển thị · tên / ID Nexora / RetailRocket ID'
                    : 'Tìm trong mẫu · RetailRocket ID / user:idx / item:idx'}
                </label>
                <input
                  id="search"
                  placeholder="Nhập ID hoặc chỉ số…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <div className="results">
                    {matches.length ? (
                      matches.map((n) => (
                        <button key={n.key} onClick={() => select(n.key)}>
                          {n.name ??
                            `${n.type === 'user' ? 'User' : 'Item'} · ${n.sourceId}`}
                          <small>
                            {n.layout === 'schematic'
                              ? `Nexora #${n.productId}`
                              : `row ${n.index}`}
                          </small>
                        </button>
                      ))
                    ) : (
                      <p>Không tìm thấy trong mẫu đang hiển thị.</p>
                    )}
                  </div>
                )}
                <div className="filters">
                  {mode === 'interaction' && (
                    <label>
                      <input
                        type="checkbox"
                        checked={users}
                        onChange={(e) => setUsers(e.target.checked)}
                      />
                      <i className="dot user" /> User{' '}
                      <small>{fmt(data.sample.users)}</small>
                    </label>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={items}
                      onChange={(e) => setItems(e.target.checked)}
                    />
                    <i className="dot item" /> Item{' '}
                    <small>
                      {fmt(
                        mode === 'coldstart'
                          ? liveItems.length
                          : data.sample.items,
                      )}
                    </small>
                  </label>
                  {mode === 'interaction' && (
                    <label>
                      <input
                        type="checkbox"
                        checked={links}
                        onChange={(e) => setLinks(e.target.checked)}
                      />
                      Hiện mọi cạnh train trong mẫu
                    </label>
                  )}
                </div>
                <p className="hint">
                  {mode === 'interaction'
                    ? `Nguồn train_binary.npz đã khớp checksum checkpoint. ${fmt(data.interactions!.edges.length)} cạnh export / ${fmt(data.interactions!.sampledEligibleEdges)} cạnh giữa các node trong mẫu. Cặp được gộp, không tách view / giỏ hàng / mua.`
                    : 'Item dùng tọa độ PCA thật theo mapping RetailRocket; sản phẩm chưa có embedding không được vẽ. Node phiên dùng vector AI hoặc vector dựng từ VIEW có ghi nhãn.'}
                </p>
              </section>
              <section className="panel inspector">
                <div className="section-title">
                  <h2>Chi tiết node</h2>
                  {node && (
                    <button onClick={() => setSelected(null)}>Bỏ chọn</button>
                  )}
                </div>
                {node ? (
                  <>
                    <span className={`node-type ${node.type}`}>
                      {node.sessionGeometry ? 'SESSION VECTOR' : node.type === 'user' ? 'USER / VISITOR' : 'ITEM'}
                    </span>
                    <h3>{node.name ?? node.sourceId}</h3>
                    <dl>
                      <dt>ID nguồn</dt>
                      <dd>
                        {node.sessionGeometry ? 'Tracking session ' : 'RetailRocket '}
                        {node.sourceId ||
                          (node.mappingUnknown
                            ? 'chưa lấy mapping'
                            : 'chưa mapping')}
                      </dd>
                      {node.productId && (
                        <>
                          <dt>VIEW trong khung</dt>
                          <dd>{node.observed ? 'Đã xem' : 'Chưa xem'}</dd>
                        </>
                      )}
                      {node.productId && (
                        <>
                          <dt>Product Nexora</dt>
                          <dd>{node.productId}</dd>
                        </>
                      )}
                      {node.layout !== 'schematic' && (
                        <>
                          <dt>{node.sessionGeometry ? 'Nguồn vector' : 'Chỉ số embedding'}</dt>
                          <dd>{node.sessionGeometry ?? node.index}</dd>
                          <dt>Số chiều</dt>
                          <dd>{node.vector.length}</dd>
                          {node.trainDegree !== null && (
                            <>
                              <dt>Số láng giềng train</dt>
                              <dd>{fmt(node.trainDegree)}</dd>
                            </>
                          )}
                          <dt>Chuẩn L2</dt>
                          <dd>{node.norm.toFixed(6)}</dd>
                        </>
                      )}
                      {node.popularity !== null && (
                        <>
                          <dt>Popularity gốc</dt>
                          <dd>{fmt(node.popularity)}</dd>
                        </>
                      )}
                    </dl>
                    {node.popularity !== null && (
                      <p className="hint">
                        Từ popularity_scores.npy; serving gọi là
                        train_user_count.{' '}
                        {data.interactions?.popularityMatchesItemDegrees
                          ? 'Đã khớp số User train phân biệt trên mỗi Item.'
                          : 'Chưa xác nhận trùng với bậc Item trong adjacency.'}
                      </p>
                    )}
                    {node.layout !== 'schematic' && <Vector node={node} />}
                    {mode === 'interaction' && (
                      <>
                        <h4>Láng giềng train trong mẫu ({edges.length})</h4>
                        <p className="hint">
                          Mỗi cạnh là một cặp User–Item trong tập train đã xác
                          minh. Không phải số lần tương tác.
                        </p>
                        <div className="neighbors">
                          {edges.slice(0, 20).map((e) => {
                            const other = data.nodes.find(
                              (n) =>
                                n.key ===
                                (e.source === selected ? e.target : e.source),
                            )!;
                            return (
                              <button
                                key={`${e.source}/${e.target}`}
                                onClick={() => select(other.key)}
                              >
                                <span>
                                  {other.type} · {other.sourceId}
                                </span>
                                <small>Cặp train đã ghi nhận</small>
                              </button>
                            );
                          })}
                          {!edges.length && (
                            <p className="hint">
                              Không có cạnh train đã export cho node này trong
                              mẫu. Điều này không có nghĩa node không có tương
                              tác ở tập đầy đủ.
                            </p>
                          )}
                          {edges.length > 20 && (
                            <p className="hint">
                              Hiển thị 20/{edges.length} cạnh theo chỉ số
                              embedding .
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="empty">
                    <span>◎</span>
                    <p>
                      Chọn một điểm để xem
                      <br />
                      {mode === 'coldstart'
                        ? 'thông tin sản phẩm đã xem.'
                        : 'embedding thực tế.'}
                    </p>
                    <small>Hoặc tìm ID bằng bàn phím ở trên.</small>
                  </div>
                )}
              </section>
            </aside>
          </section>
          <section className="provenance">
            <div>
              <span className="eyebrow">ĐỌC ĐÚNG BIỂU ĐỒ</span>
              <h2>
                {mode === 'coldstart'
                  ? 'Phiên thực, từ dữ liệu tracking.'
                  : 'Biểu diễn học được, từ artifacts thật.'}
              </h2>
              <p>
                {mode === 'interaction'
                  ? 'Các điểm là embedding đã export, cùng được chiếu PCA. '
                  : ''}
                {mode === 'interaction'
                  ? 'Các cạnh màu vàng là cặp tương tác train đã khớp checksum checkpoint.'
                  : 'Dây xanh liền là VIEW đã lưu DB; dây vàng nét đứt là AI đề xuất; dây xanh lam nét đứt là gợi ý quy tắc. Đề xuất là kết quả API trả cho web, không chứng minh người dùng đã xem hoặc mua. Vị trí Item là PCA thật; node phiên dùng vector inference hoặc VIEW-only có ghi nhãn. Đường tím nối các vị trí phiên đã quan sát.'}{' '}
                Không mô phỏng lan truyền qua lớp.
              </p>
            </div>
            <button
              aria-expanded={provenance}
              onClick={() => setProvenance(!provenance)}
            >
              {provenance ? 'Ẩn nguồn dữ liệu' : 'Xem nguồn & phương pháp'}
            </button>
            {provenance && (
              <div className="source-details">
                <p>
                  Run: <code>{data.model.runId}</code> · Best epoch:{' '}
                  {data.model.bestEpoch}. Mẫu ngẫu nhiên không hoàn lại, seed{' '}
                  {data.sample.seed}. Tổng số là số hàng embedding giữ lại,
                  không phải toàn bộ RetailRocket hay catalog Nexora.
                </p>
                <p>
                  PCA fit trên toàn bộ vector gốc của cả hai loại node; phương
                  sai từng trục:{' '}
                  {data.projection.explainedVariance.map(percent).join(' / ')}.
                  Cosine dùng vector đầy đủ, không dùng khoảng cách PCA. Chưa có
                  embedding riêng cho từng lớp; chỉ biết cấu hình{' '}
                  {data.model.config.layers} lớp từ checkpoint.
                </p>
                <p>
                  {data.interactions
                    ? 'Adjacency từ tập train; SHA-256 của train_binary.npz khớp checkpoint. '
                    : 'Chưa nạp adjacency đã xác minh. '}
                  Mapping được đối chiếu checksum với metadata serving và
                  checkpoint. Checksum embedding ghi lại bản dùng để export;
                  không tự chứng minh cách chúng được tính từ checkpoint.
                </p>
                <h4>SHA-256 của đầu vào</h4>
                {Object.entries(data.provenance.sha256).map(([name, hash]) => (
                  <p key={name}>
                    <b>{name}</b>
                    <code>{hash}</code>
                  </p>
                ))}
              </div>
            )}
          </section>
          <footer>
            NEXORA AI LAB{' '}
            <span>
              Standalone explorer · Đọc artifacts / tracking phiên của bạn
            </span>
          </footer>
        </>
      )}
    </main>
  );
}
function Vector({ node }: { node: GraphNode }) {
  const max = Math.max(...node.vector.map(Math.abs), 1e-12);
  return (
    <details className="vector">
      <summary>Xem {node.vector.length} giá trị embedding</summary>
      <div className="bars" aria-hidden="true">
        {node.vector.map((value, i) => (
          <span
            key={i}
            title={`d${i}: ${value}`}
            style={{
              height: `${Math.max(3, (Math.abs(value) / max) * 100)}%`,
              background: value < 0 ? '#729fff' : '#52e3bd',
            }}
          />
        ))}
      </div>
      <div className="vector-values">
        {node.vector.map((value, i) => (
          <span key={i}>
            d{i}
            <b>{value.toPrecision(7)}</b>
          </span>
        ))}
      </div>
    </details>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
