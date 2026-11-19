import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { getOrder, cancelOrder } from '../services/order-api.js';
import { useAuth } from '../../auth/hooks/useAuth.js';

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

export function OrderDetailPage({ id }: { id: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id && user),
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
        'Unable to cancel the order. Retry the same request or reload its status.',
      ),
  });
  if (query.isPending)
    return (
      <div className="account-panel">
        <p role="status">Loading orders…</p>
      </div>
    );
  if (query.isError || !query.data)
    return (
      <div className="account-panel">
        <div className="empty-state" role="alert">
          <h1>Order not found</h1>
          <Link to="/account/orders">Back to orders</Link>
        </div>
      </div>
    );
  const order = query.data;
  return (
    <div className="account-panel account-order-detail">
      <div className="order-detail-title">
        <div>
          <span className="section-eyebrow">YOUR ORDER</span>
          <h1>Order {order.id}</h1>
          <p>Placed on {date(order.createdAt)}</p>
        </div>
        <span
          className={`order-status ${['PENDING', 'CONFIRMED', 'SHIPPING', 'DELIVERY_FAILED'].includes(order.status) ? 'in-progress' : 'complete'}`}
        >
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
              <h2>Delivery details</h2>
              <p>
                {order.address.recipientName} · {order.address.recipientPhone}
              </p>
            </div>
          </div>
          <p>
            {order.address.addressLine}, {order.address.wardName},{' '}
            {order.address.provinceName}
          </p>
          <h2>Products</h2>
          {order.items.map((item) => (
            <div className="checkout-order-line" key={item.id}>
              <span>
                <strong>{item.productName}</strong>
                <small>
                  {Object.values(item.options)
                    .map(({ label, value }) => `${label}: ${value}`)
                    .join(' · ') ||
                    item.sku ||
                    'No variant'}{' '}
                  · Qty {item.quantity}
                </small>
              </span>
              <b>{formatVnd(BigInt(item.unitPrice) * BigInt(item.quantity))}</b>
            </div>
          ))}
          <div className="checkout-total-row">
            <span>Subtotal</span>
            <strong>{formatVnd(order.subtotal)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Shipping</span>
            <strong>{formatVnd(order.shippingFee)}</strong>
          </div>
          <div className="checkout-total-row checkout-grand-total">
            <span>Total · Cash on delivery</span>
            <strong>{formatVnd(order.totalAmount)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Payment status</span>
            <strong>
              {order.paymentStatus === 'PAID'
                ? 'Paid'
                : 'Unpaid'}
            </strong>
          </div>
          {order.firstShippedAt ? (
            <p>Dispatched: {date(order.firstShippedAt)}</p>
          ) : null}
          {order.deliveredAt ? (
            <p>Delivered: {date(order.deliveredAt)}</p>
          ) : null}
          {order.customerNote ? <p>Note: {order.customerNote}</p> : null}
          {order.cancelReason ? <p>Cancellation reason: {order.cancelReason}</p> : null}
          {order.status === 'PENDING' && order.paymentStatus === 'UNPAID' ? (
            <button
              className="button-secondary"
              disabled={cancel.isPending}
              onClick={() => {
                setError('');
                cancel.mutate();
              }}
            >
              {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
            </button>
          ) : null}
          {error ? <p role="alert">{error}</p> : null}
        </section>
        <section className="checkout-panel">
          <h2>Order history</h2>
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
          <Link className="continue-link" to="/account/orders">
            <ArrowLeft size={15} /> Order list
          </Link>
        </section>
      </div>
    </div>
  );
}
