import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, PackageCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { getOrder, cancelOrder } from '../services/order-api.js';
import { useAuth } from '../../auth/hooks/useAuth.js';

const labels: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  CANCELLED: 'Đã hủy',
};
function date(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id && user?.role === 'CUSTOMER'),
    retry: false,
  });
  const [error, setError] = useState('');
  const cancelKey = useRef<string | null>(null);
  const cancel = useMutation({
    mutationFn: () =>
      cancelOrder(
        id,
        cancelKey.current ?? (cancelKey.current = crypto.randomUUID()),
        query.data!.version,
      ),
    onSuccess: async (order) => {
      cancelKey.current = null;
      await client.setQueryData(['order', id], order);
      await client.invalidateQueries({ queryKey: ['orders', user?.id] });
    },
    onError: () =>
      setError(
        'Không thể hủy đơn. Hãy thử lại cùng yêu cầu hoặc tải lại trạng thái.',
      ),
  });
  if (query.isPending)
    return (
      <div className="page-container page-section">
        <p role="status">Đang tải đơn hàng…</p>
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="page-container page-section">
        <div className="empty-state" role="alert">
          <h1>Không tìm thấy đơn hàng</h1>
          <Link to="/orders">Quay lại danh sách</Link>
        </div>
      </div>
    );
  const order = query.data;
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <Link to="/orders">Đơn hàng</Link>
        <ChevronRight />
        <span>{order.id}</span>
      </div>
      <div className="order-detail-title">
        <div>
          <span className="section-eyebrow">ĐƠN HÀNG CỦA BẠN</span>
          <h1>Đơn hàng {order.id}</h1>
          <p>Đặt ngày {date(order.createdAt)}</p>
        </div>
        <span className="order-status in-progress">
          <i />
          {labels[order.status] ?? order.status}
        </span>
      </div>
      <div className="order-detail-grid">
        <section className="checkout-panel">
          <div className="panel-heading">
            <span className="checkout-number">
              <PackageCheck />
            </span>
            <div>
              <h2>Thông tin giao hàng</h2>
              <p>
                {order.address.recipientName} · {order.address.recipientPhone}
              </p>
            </div>
          </div>
          <p>
            {order.address.addressLine}, {order.address.wardName},{' '}
            {order.address.provinceName}
          </p>
          <h2>Sản phẩm</h2>
          {order.items.map((item) => (
            <div className="checkout-order-line" key={item.id}>
              <span>
                <strong>{item.productName}</strong>
                <small>
                  {Object.values(item.options)
                    .map(({ label, value }) => `${label}: ${value}`)
                    .join(' · ') ||
                    item.sku ||
                    'Không có phiên bản'}{' '}
                  · SL {item.quantity}
                </small>
              </span>
              <b>{formatVnd(BigInt(item.unitPrice) * BigInt(item.quantity))}</b>
            </div>
          ))}
          <div className="checkout-total-row">
            <span>Tiền hàng</span>
            <strong>{formatVnd(order.subtotal)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Phí giao hàng</span>
            <strong>{formatVnd(order.shippingFee)}</strong>
          </div>
          <div className="checkout-total-row checkout-grand-total">
            <span>Tổng thanh toán · COD</span>
            <strong>{formatVnd(order.totalAmount)}</strong>
          </div>
          {order.customerNote ? <p>Ghi chú: {order.customerNote}</p> : null}
          {order.cancelReason ? <p>Lý do hủy: {order.cancelReason}</p> : null}
          {order.status === 'PENDING' && order.paymentStatus === 'UNPAID' ? (
            <button
              className="button-secondary"
              disabled={cancel.isPending}
              onClick={() => {
                setError('');
                cancel.mutate();
              }}
            >
              {cancel.isPending ? 'Đang hủy…' : 'Hủy đơn hàng'}
            </button>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
        <section className="checkout-panel">
          <h2>Lịch sử đơn hàng</h2>
          {order.history.map((entry, index) => (
            <div
              className="tracking-step done"
              key={`${entry.toStatus}-${entry.createdAt}-${index}`}
            >
              <span>
                <PackageCheck size={16} />
              </span>
              <div>
                <strong>{labels[entry.toStatus] ?? entry.toStatus}</strong>
                <small>
                  {date(entry.createdAt)} · {entry.actor}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </small>
              </div>
            </div>
          ))}
          <Link className="continue-link" to="/orders">
            <ArrowLeft size={15} /> Danh sách đơn hàng
          </Link>
        </section>
      </div>
    </div>
  );
}
