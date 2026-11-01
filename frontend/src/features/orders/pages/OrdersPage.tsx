import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { getOrders } from '../services/order-api.js';

const labels: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SHIPPING: 'Đang giao',
  DELIVERY_FAILED: 'Giao thất bại',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
};
function date(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}

export function OrdersPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['orders', user?.id, filter, page],
    queryFn: () => getOrders(filter === 'ALL' ? undefined : filter, page),
    enabled: Boolean(user?.role === 'CUSTOMER'),
    retry: false,
  });
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <span>Đơn hàng</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">TÀI KHOẢN CỦA BẠN</span>
          <h1>Đơn hàng của tôi</h1>
          <p>Theo dõi các đơn hàng bạn đã đặt.</p>
        </div>
      </div>
      <div className="order-tabs">
        {[
          ['ALL', 'Tất cả'],
          ['PENDING', 'Chờ xác nhận'],
          ['CONFIRMED', 'Đã xác nhận'],
          ['SHIPPING', 'Đang giao'],
          ['DELIVERY_FAILED', 'Giao thất bại'],
          ['DELIVERED', 'Đã giao'],
          ['CANCELLED', 'Đã hủy'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {query.isPending ? <p role="status">Đang tải đơn hàng…</p> : null}
      {query.isError ? (
        <div className="empty-state" role="alert">
          <p>Chưa tải được đơn hàng.</p>
          <button
            className="button-secondary"
            onClick={() => void query.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : null}
      {query.data?.items.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag />
          <h2>Chưa có đơn hàng</h2>
          <Link className="button-primary" to="/products">
            Tiếp tục mua sắm
          </Link>
        </div>
      ) : null}
      <div className="orders-list">
        {query.data?.items.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-card-head">
              <div>
                <span>MÃ ĐƠN HÀNG</span>
                <strong>{order.id}</strong>
              </div>
              <span
                className={`order-status ${order.status === 'PENDING' ? 'in-progress' : 'complete'}`}
              >
                <i />
                {labels[order.status] ?? order.status}
              </span>
            </div>
            <div className="order-card-content">
              <div className="order-summary-text">
                <strong>
                  {order.items.map((item) => item.productName).join(', ')}
                </strong>
                <small>
                  {date(order.createdAt)} ·{' '}
                  {order.items.reduce(
                    (count, item) => count + item.quantity,
                    0,
                  )}{' '}
                  sản phẩm
                </small>
              </div>
              <div className="order-total">
                <span>Tổng cộng</span>
                <strong>{formatVnd(order.totalAmount)}</strong>
              </div>
              <Link className="button-secondary" to={`/orders/${order.id}`}>
                Chi tiết <ArrowRight size={15} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {query.data && query.data.total > 20 ? (
        <nav className="order-tabs" aria-label="Phân trang đơn hàng">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Trước
          </button>
          <span>
            Trang {page} / {Math.ceil(query.data.total / 20)}
          </span>
          <button
            disabled={page * 20 >= query.data.total}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
        </nav>
      ) : null}
    </div>
  );
}
