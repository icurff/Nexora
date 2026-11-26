import { useEffect, useState } from 'react';
import { readLiveSession } from './live-session';
import type { LiveSnapshot } from './live-session';
interface Props {
  since: string;
  snapshot: LiveSnapshot;
  onReset: () => void;
  onSnapshot: (value: LiveSnapshot) => void;
  onSelect: (key: string) => void;
}
export function LiveSession({
  since,
  snapshot,
  onReset,
  onSnapshot,
  onSelect,
}: Props) {
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let timer = 0;
    let controller: AbortController | null = null;
    setError('');
    async function poll() {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8000);
      try {
        const data = await readLiveSession(since, controller.signal);
        if (!active) return;
        setError('');
        onSnapshot(data);
      } catch (e) {
        if (active)
          setError(
            (e as Error).name === 'AbortError'
              ? 'Backend phản hồi quá lâu; đang thử lại.'
              : (e as Error).message,
          );
      } finally {
        window.clearTimeout(timeout);
        if (active) timer = window.setTimeout(poll, 1500);
      }
    }
    void poll();
    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timer);
    };
  }, [since, onSnapshot]);
  const origin = `http://${window.location.hostname}:5173`;
  return (
    <section className="panel cold-panel">
      <h2>Phiên thật trên website</h2>
      <p>
        Ban đầu graph trống. Mở website bên dưới, bấm xem chi tiết sản phẩm;
        graph hiện dây VIEW từ DB và các dây đề xuất từ API website.
      </p>
      <a
        className="store-link"
        href={origin}
        target="_blank"
        rel="noopener noreferrer"
      >
        Mở website Nexora đầy đủ
      </a>
      <button onClick={onReset}>Theo dõi từ bây giờ</button>
      <p className="hint">
        Dùng cùng trình duyệt và cùng địa chỉ {window.location.hostname}; cookie
        phiên được dùng chung giữa hai cổng. Nếu graph ở đây, hãy mở web bằng
        nút trên.
      </p>
      {error && (
        <p className="session-error" role="alert">
          {error} Dữ liệu đang hiển thị là lần đọc thành công gần nhất.
        </p>
      )}
      {!snapshot.events.length ? (
        <p role="status">Đang chờ lượt xem mới được ghi nhận…</p>
      ) : (
        <>
          <p>
            Phiên tracking #{snapshot.session?.id} · {snapshot.events.length}{' '}
            lượt xem · {new Set(snapshot.events.map((e) => e.product.id)).size}{' '}
            sản phẩm.
          </p>
          <div className="neighbors">
            {snapshot.events
              .slice()
              .reverse()
              .map((event) => (
                <button
                  key={event.eventId}
                  onClick={() => onSelect(`product:${event.product.id}`)}
                >
                  <span>{event.product.name}</span>
                  <small>
                    Product Nexora #{event.product.id} · RetailRocket{' '}
                    {event.product.retailrocketItemId ?? 'chưa mapping'}
                  </small>
                  <small>
                    {new Date(event.receivedAt).toLocaleTimeString('vi-VN')} ·
                    VIEW đã lưu DB
                  </small>
                </button>
              ))}
          </div>
        </>
      )}
      {snapshot.truncated && (
        <p className="hint">
          Chỉ hiển thị 200 lượt xem mới nhất trong cửa sổ theo dõi.
        </p>
      )}
      <h4>Đề xuất gần nhất API trả cho website</h4>
      {snapshot.recommendation ? (
        <>
          <p className="hint">
            Ngữ cảnh: {snapshot.recommendation.surface}
            {snapshot.recommendation.contextProductId
              ? ` · Product #${snapshot.recommendation.contextProductId}`
              : ''}{' '}
            ·{' '}
            {new Date(snapshot.recommendation.generatedAt).toLocaleTimeString(
              'vi-VN',
            )}
          </p>
          <div className="neighbors">
            {snapshot.recommendation.items.map((item) => (
              <button
                key={item.product.id}
                onClick={() => onSelect(`product:${item.product.id}`)}
              >
                <span>{item.product.name}</span>
                <small>
                  {item.source === 'lightgcn_session'
                    ? 'AI · dây vàng'
                    : 'Quy tắc · dây xanh lam'}
                  {item.score !== undefined
                    ? ` · điểm ${item.score.toFixed(4)}`
                    : ''}
                </small>
                <small>
                  {item.reason} · Product #{item.product.id}
                </small>
              </button>
            ))}
          </div>
          {!snapshot.recommendation.items.length && (
            <p className="hint">
              API gần nhất trả danh sách rỗng; không vẽ dây đề xuất cũ.
            </p>
          )}
        </>
      ) : (
        <p className="hint">
          Chưa nhận được kết quả đề xuất mới trong khung theo dõi. Hãy mở/tải
          lại trang sản phẩm trên web. Đây không phải bằng chứng website chưa
          từng đề xuất.
        </p>
      )}
      <p className="hint">
        Node tím là vector phiên chiếu PCA; nhãn phân biệt vector AI tại inference và vector dựng từ VIEW. Dây xanh liền: VIEW đã lưu DB. Dây vàng nét đứt:
        AI đề xuất. Dây xanh lam nét đứt: gợi ý quy tắc. Chỉ hiển thị lô API gần
        nhất của phiên; đây không phải log impression/click hay toàn bộ lịch sử
        đề xuất. Bản sao đề xuất tạm được giữ tối đa 30 phút và mất khi backend
        khởi động lại. Phiên chưa có vector không được vẽ; khoảng cách 3D chỉ là xấp xỉ PCA.
      </p>
      <p className="hint">
        “Theo dõi từ bây giờ” chỉ xóa cửa sổ hiển thị, không xóa dữ liệu hoặc
        tạo phiên DB mới. Phiên thực hết hạn sau 30 phút không hoạt động; việc
        đọc graph không gia hạn phiên.
      </p>
    </section>
  );
}
