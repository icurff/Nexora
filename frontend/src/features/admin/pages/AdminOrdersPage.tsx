import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, PackageCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import {
  cancelAdminOrder,
  confirmAdminOrder,
  getAdminOrder,
  getAdminOrders,
} from '../../orders/services/order-api.js';

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

export function AdminOrdersPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const attemptRef = useRef<{ action: string; key: string } | null>(null);
  const list = useQuery({
    queryKey: ['admin-orders', filter],
    queryFn: () => getAdminOrders(filter === 'ALL' ? undefined : filter),
    enabled: !id,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => getAdminOrder(id!),
    enabled: Boolean(id),
    retry: false,
  });
  const beginAttempt = (action: string) => {
    const value =
      attemptRef.current?.action === action
        ? attemptRef.current
        : { action, key: crypto.randomUUID() };
    attemptRef.current = value;
    return value.key;
  };
  const finishAttempt = () => {
    attemptRef.current = null;
  };
  const confirm = useMutation({
    mutationFn: () =>
      confirmAdminOrder(
        id!,
        attemptRef.current?.key ?? beginAttempt('confirm'),
        detail.data!.version,
      ),
    onSuccess: async (order) => {
      finishAttempt();
      setError('');
      await client.setQueryData(['admin-order', id], order);
      await client.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: () =>
      setError('Không xác nhận được đơn. Tải lại để kiểm tra trạng thái.'),
  });
  const cancel = useMutation({
    mutationFn: () =>
      cancelAdminOrder(
        id!,
        attemptRef.current?.key ?? beginAttempt('cancel'),
        detail.data!.version,
        reason,
      ),
    onSuccess: async (order) => {
      finishAttempt();
      setError('');
      await client.setQueryData(['admin-order', id], order);
      await client.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: () =>
      setError('Không hủy được đơn. Tải lại để kiểm tra trạng thái.'),
  });

  if (!id)
    return (
      <div className="admin-page-content">
        <div className="breadcrumbs">
          <Link to="/admin">Quản trị</Link>
          <ChevronRight />
          <span>Đơn hàng</span>
        </div>
        <header className="admin-page-heading">
          <div>
            <span className="section-eyebrow">VẬN HÀNH CỬA HÀNG</span>
            <h1>Đơn hàng</h1>
            <p>Xem đơn mới, xác nhận hoặc hủy trước giao.</p>
          </div>
        </header>
        <div className="order-tabs">
          {[
            ['ALL', 'Tất cả'],
            ['PENDING', 'Chờ xác nhận'],
            ['CONFIRMED', 'Đã xác nhận'],
            ['CANCELLED', 'Đã hủy'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {list.isPending ? <p role="status">Đang tải đơn…</p> : null}
        {list.isError ? (
          <p role="alert">
            Chưa tải được đơn hàng.{' '}
            <button onClick={() => void list.refetch()}>Thử lại</button>
          </p>
        ) : null}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>MÃ ĐƠN</th>
                <th>KHÁCH HÀNG</th>
                <th>NGÀY ĐẶT</th>
                <th>TỔNG</th>
                <th>TRẠNG THÁI</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((order) => (
                <tr key={order.id}>
                  <td>{order.id}</td>
                  <td>
                    {order.customer.fullName}
                    <br />
                    <small>{order.customer.email}</small>
                  </td>
                  <td>{date(order.createdAt)}</td>
                  <td>{formatVnd(order.totalAmount)}</td>
                  <td>{labels[order.status] ?? order.status}</td>
                  <td>
                    <Link to={`/admin/orders/${order.id}`}>Chi tiết</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  if (detail.isPending)
    return (
      <div className="admin-page-content">
        <p role="status">Đang tải chi tiết đơn…</p>
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="admin-page-content">
        <p role="alert">Không tìm thấy đơn hàng.</p>
        <Link to="/admin/orders">Quay lại danh sách</Link>
      </div>
    );
  const order = detail.data;
  return (
    <div className="admin-page-content">
      <div className="breadcrumbs">
        <Link to="/admin">Quản trị</Link>
        <ChevronRight />
        <Link to="/admin/orders">Đơn hàng</Link>
        <ChevronRight />
        <span>{order.id}</span>
      </div>
      <header className="admin-page-heading">
        <div>
          <span className="section-eyebrow">CHI TIẾT ĐƠN HÀNG</span>
          <h1>Đơn {order.id}</h1>
          <p>
            {date(order.createdAt)} · {labels[order.status]}
          </p>
        </div>
      </header>
      <section className="checkout-panel">
        <h2>Khách hàng và giao hàng</h2>
        <p>
          {order.address.recipientName} · {order.address.recipientPhone}
        </p>
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
          <span>Tổng COD</span>
          <strong>{formatVnd(order.totalAmount)}</strong>
        </div>
        {order.customerNote ? <p>Ghi chú: {order.customerNote}</p> : null}
        {order.cancelReason ? <p>Lý do hủy: {order.cancelReason}</p> : null}
        {order.status === 'PENDING' ? (
          <div className="checkout-actions">
            <button
              className="button-primary"
              disabled={confirm.isPending}
              onClick={() => {
                setError('');
                beginAttempt('confirm');
                confirm.mutate();
              }}
            >
              {confirm.isPending ? 'Đang xác nhận…' : 'Xác nhận đơn'}
            </button>
            <button
              className="button-secondary"
              disabled={cancel.isPending}
              onClick={() => {
                if (!reason.trim()) {
                  setError('Nhập lý do hủy đơn.');
                  return;
                }
                setError('');
                beginAttempt('cancel');
                cancel.mutate();
              }}
            >
              Hủy đơn
            </button>
            <input
              aria-label="Lý do hủy đơn"
              placeholder="Lý do hủy bắt buộc"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        ) : order.status === 'CONFIRMED' ? (
          <div className="checkout-actions">
            <button
              className="button-secondary"
              disabled={cancel.isPending}
              onClick={() => {
                if (!reason.trim()) {
                  setError('Nhập lý do hủy đơn.');
                  return;
                }
                beginAttempt('cancel');
                cancel.mutate();
              }}
            >
              Hủy đơn đã xác nhận
            </button>
            <input
              aria-label="Lý do hủy đơn"
              placeholder="Lý do hủy bắt buộc"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </section>
      <section className="checkout-panel">
        <h2>Lịch sử xử lý</h2>
        {order.history.map((item, index) => (
          <p key={`${item.toStatus}-${index}`}>
            <PackageCheck size={15} /> {labels[item.toStatus] ?? item.toStatus}{' '}
            · {item.actor} · {date(item.createdAt)}
            {item.reason ? ` · ${item.reason}` : ''}
          </p>
        ))}
      </section>
      <Link to="/admin/orders">Quay lại danh sách</Link>
    </div>
  );
}
