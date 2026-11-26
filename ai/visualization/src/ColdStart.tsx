import { useEffect, useMemo, useState } from 'react';
import type { GraphNode } from './data';
import { ScoreBreakdown } from './ScoreBreakdown';
import { itemId, recommendSession } from './session';
import type { SessionResult, SessionScene } from './session';

interface Props {
  nodes: GraphNode[];
  selected: GraphNode | undefined;
  history: string[];
  onHistory: (ids: string[]) => void;
  onScene: (scene: SessionScene) => void;
  onSelect: (key: string) => void;
}
export function ColdStart({
  nodes,
  selected,
  history,
  onHistory,
  onScene,
  onSelect,
}: Props) {
  const items = useMemo(() => nodes.filter((n) => n.type === 'item'), [nodes]);
  const byId = useMemo(
    () => new Map(items.map((n) => [n.sourceId, n])),
    [items],
  );
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    result: SessionResult | null;
  }>({ loading: false, error: '', result: null });
  const [retry, setRetry] = useState(0);
  const matches = input.trim()
    ? items.filter((n) => n.sourceId.includes(input.trim())).slice(0, 5)
    : [];
  const signature = history.join(',');
  useEffect(() => {
    const ids = signature ? signature.split(',') : [];
    const historyKeys = ids
      .map((id) => byId.get(id)?.key)
      .filter((key): key is string => !!key);
    onScene({ historyKeys, recommendationKeys: [] });
    if (!ids.length) {
      setState({ loading: false, error: '', result: null });
      return;
    }
    const controller = new AbortController();
    let active = true;
    setState({ loading: true, error: '', result: null });
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    recommendSession(ids, items, controller.signal)
      .then((result) => {
        if (!active) return;
        setState({ loading: false, error: '', result });
        onScene({
          historyKeys,
          recommendationKeys: result.items.map((n) => n.key),
        });
      })
      .catch((error: Error) => {
        if (active)
          setState({
            loading: false,
            error:
              error.name === 'AbortError'
                ? 'AI phản hồi quá lâu. Bấm Thử lại khi dịch vụ sẵn sàng.'
                : error.message,
            result: null,
          });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [signature, retry, items, byId, onScene]);
  function add(raw: string) {
    const id = raw.trim();
    try {
      itemId(id);
      if (history.length >= 200)
        throw new Error('Đã đủ 200 lượt xem. Hãy bắt đầu phiên mới.');
      // Canonical decimal strings keep service exclusions and graph mappings aligned.
      onHistory([...history, String(itemId(id))]);
      setInput('');
      setInputError('');
    } catch (error) {
      setInputError((error as Error).message);
    }
  }
  const recent = history.filter((id) => byId.has(id)).slice(-3);
  return (
    <section className="panel cold-panel">
      <div className="section-title">
        <h2>Phiên cold-start</h2>
        <button
          onClick={() => {
            onHistory([]);
            setInput('');
            setInputError('');
          }}
        >
          Phiên mới
        </button>
      </div>
      <p className="hint">
        Phiên demo do bạn thao tác; không phải User trong train hay lịch sử
        khách đang mua trên website. Chấm điểm bằng AI serving thật.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(input);
        }}
        className="session-form"
      >
        <label htmlFor="session-item">RetailRocket Item ID vừa xem</label>
        <div>
          <input
            id="session-item"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setInputError('');
            }}
            placeholder="Tìm hoặc nhập Item ID…"
            inputMode="numeric"
            aria-describedby={inputError ? 'session-input-error' : undefined}
          />
          <button disabled={!input.trim() || history.length >= 200}>
            Ghi nhận xem
          </button>
        </div>
      </form>
      {inputError && (
        <p id="session-input-error" className="session-error" role="alert">
          {inputError}
        </p>
      )}
      {!!matches.length && (
        <div className="results">
          {matches.map((n) => (
            <button key={n.key} onClick={() => add(n.sourceId)}>
              Xem Item {n.sourceId}
            </button>
          ))}
        </div>
      )}
      {selected?.type === 'item' && (
        <button
          className="selected-view"
          disabled={history.length >= 200}
          onClick={() => add(selected.sourceId)}
        >
          Ghi nhận xem Item {selected.sourceId} đang chọn
        </button>
      )}
      {!history.length && (
        <div className="session-empty">
          <p>Chưa có lịch sử → chưa tạo vector phiên.</p>
          <p className="hint">
            Website Nexora sẽ dùng gợi ý quy tắc khi chưa có Item được mô hình
            biết. Chế độ demo này chưa gọi bộ gợi ý quy tắc.
          </p>
          <button onClick={() => add(items[0].sourceId)}>
            Thử xem Item {items[0].sourceId}
          </button>
        </div>
      )}
      {!!history.length && (
        <>
          <h4>Lượt xem · cũ đến mới ({history.length})</h4>
          <div className="history-chips">
            {history.map((id, index) => (
              <button
                key={index}
                title={`Xóa lượt xem ${index + 1}`}
                onClick={() => onHistory(history.filter((_, i) => i !== index))}
              >
                {id}
                {!byId.has(id) ? ' · ngoài mẫu' : ''} ×
              </button>
            ))}
          </div>
          <p className="hint">
            3 Item gần nhất hiển thị được: {recent.join(' · ') || 'Chưa có'}. AI
            tự lọc mapping đầy đủ trước khi lấy 3 Item gần nhất; Item ngoài mẫu
            vẫn có thể được mô hình biết.
          </p>
          {state.loading && <p role="status">Đang lấy đề xuất từ AI…</p>}
          {state.error && (
            <div role="alert" className="session-error">
              <p>{state.error}</p>
              <button onClick={() => setRetry(retry + 1)}>Thử lại</button>
            </div>
          )}
          {state.result?.strategy === 'no_known_session_items' && (
            <p role="status">
              AI không tìm thấy Item được biết trong lịch sử. Chưa có vector
              phiên; chưa vẽ dây đề xuất. Website sẽ chuyển sang gợi ý quy tắc.
            </p>
          )}
          {state.result?.strategy === 'no_eligible_candidates' && (
            <p role="status">
              Không còn ứng viên hợp lệ trong mẫu sau khi loại Item đã xem.
            </p>
          )}
          {state.result?.strategy === 'cold_session_hybrid' && (
            <>
              <h4>AI đề xuất ({state.result.items.length})</h4>
              <div className="neighbors">
                {state.result.items.map((n) => (
                  <button key={n.key} onClick={() => onSelect(n.key)}>
                    <span>
                      Item {n.sourceId} · điểm {n.score.toFixed(4)}
                    </span>
                    <small>
                      {n.reason === 'SIMILAR_TO_RECENT_VIEW'
                        ? `Tương tự Item ${n.recentSourceId} · cosine ${n.cosine?.toFixed(4)}`
                        : `Popularity train · ${n.popularity} User`}
                    </small>
                  </button>
                ))}
              </div>
              <ScoreBreakdown
                items={state.result.items.map((n) => ({
                  id: n.sourceId,
                  rank: n.rank,
                  breakdown: n.breakdown,
                }))}
              />
              {!state.result.items.length && (
                <p>AI chưa trả được đề xuất cho tập ứng viên này.</p>
              )}
            </>
          )}
        </>
      )}
      <p className="hint">
        Ứng viên: {items.length} Item trong mẫu, chưa lọc theo catalog/tồn kho
        Nexora. AI chuẩn hóa điểm trên toàn bộ 20.000 Item; α=0,75 · 3 Item gần
        nhất · decay=0,75. Không tạo embedding User mới hay retrain.
      </p>
    </section>
  );
}
