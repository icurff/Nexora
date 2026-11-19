import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { getOrders } from '../services/order-api.js';

const labels: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  SHIPPING: 'Shipping',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
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
    enabled: Boolean(user),
    retry: false,
  });
  return (
    <div className="account-panel account-orders-panel">
      <div className="account-panel-title">
        <div>
          <span className="section-eyebrow">YOUR ACCOUNT</span>
          <h2>My orders</h2>
          <p>Track the orders you have placed.</p>
        </div>
      </div>
      <div className="order-tabs">
        {[
          ['ALL', 'All'],
          ['PENDING', 'Pending'],
          ['CONFIRMED', 'Confirmed'],
          ['SHIPPING', 'Shipping'],
          ['DELIVERY_FAILED', 'Delivery failed'],
          ['DELIVERED', 'Delivered'],
          ['CANCELLED', 'Cancelled'],
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
      {query.isPending ? <p role="status">Loading orders…</p> : null}
      {query.isError ? (
        <div className="empty-state" role="alert">
          <p>Unable to load orders.</p>
          <button
            className="button-secondary"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {query.data?.items.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag />
          <h2>No orders yet</h2>
          <Link className="button-primary" to="/products">
            Continue shopping
          </Link>
        </div>
      ) : null}
      <div className="orders-list">
        {query.data?.items.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-card-head">
              <div>
                <span>ORDER NUMBER</span>
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
                  items
                </small>
              </div>
              <div className="order-total">
                <span>Total</span>
                <strong>{formatVnd(order.totalAmount)}</strong>
              </div>
              <Link className="button-secondary" to={`/account/orders/${order.id}`}>
                Details <ArrowRight size={15} />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {query.data && query.data.total > 20 ? (
        <nav className="order-tabs" aria-label="Order pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} / {Math.ceil(query.data.total / 20)}
          </span>
          <button
            disabled={page * 20 >= query.data.total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
