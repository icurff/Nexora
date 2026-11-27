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
  getAdminPayosTransactions,
  getAdminPayosExceptions,
  transitionAdminOrder,
} from '../../orders/services/order-api.js';
import './AdminOrdersPage.css';

type OrderAction =
  | 'confirm'
  | 'cancel'
  | 'ship'
  | 'deliver'
  | 'delivery-fail'
  | 'retry-delivery'
  | 'receive-return';

const labels: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  SHIPPING: 'Shipping',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
const filters = [
  ['ALL', 'All'],
  ['PENDING', 'Pending'],
  ['CONFIRMED', 'Confirmed'],
  ['SHIPPING', 'Shipping'],
  ['DELIVERY_FAILED', 'Delivery failed'],
  ['DELIVERED', 'Delivered'],
  ['CANCELLED', 'Cancelled'],
];
const actionText: Record<
  OrderAction,
  { title: string; description: string; submit: string }
> = {
  confirm: {
    title: 'Confirm order',
    description:
      'The order will be confirmed and await handoff to the delivery provider.',
    submit: 'Confirm order',
  },
  cancel: {
    title: 'Cancel order',
    description: 'The order will be cancelled and reserved stock released.',
    submit: 'Confirm cancellation',
  },
  ship: {
    title: 'Dispatch order',
    description: 'Stock will be deducted when the order moves to shipping.',
    submit: 'Dispatch',
  },
  deliver: {
    title: 'Confirm successful delivery',
    description:
      'Confirm that the customer received the order and the full COD amount was collected. The order will be marked as paid.',
    submit: 'Delivered and COD collected',
  },
  'delivery-fail': {
    title: 'Record failed delivery',
    description:
      'The delivery will be recorded as failed; stock will not yet be returned.',
    submit: 'Record failure',
  },
  'retry-delivery': {
    title: 'Confirm redelivery',
    description:
      'The order returns to shipping. Stock will not be deducted again and no extra delivery fee is charged.',
    submit: 'Confirm redelivery',
  },
  'receive-return': {
    title: 'Receive returned items',
    description:
      'Confirm only after all items have been returned intact. The order will be cancelled and stock restored once.',
    submit: 'All items received',
  },
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
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState('');
  const [deliveryReason, setDeliveryReason] = useState('');
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null);
  const [error, setError] = useState('');
  const attemptRef = useRef<{ action: string; key: string } | null>(null);
  const list = useQuery({
    queryKey: ['admin-orders', filter, page],
    queryFn: () => getAdminOrders(filter === 'ALL' ? undefined : filter, page),
    enabled: !id,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => getAdminOrder(id!),
    enabled: Boolean(id),
    retry: false,
  });
  const transactions = useQuery({
    queryKey: ['admin-payos-transactions', id],
    queryFn: () => getAdminPayosTransactions(id!),
    enabled: Boolean(id && detail.data?.paymentMethod === 'PAYOS'),
    retry: false,
  });
  const paymentExceptions = useQuery({
    queryKey: ['admin-payos-exceptions'],
    queryFn: getAdminPayosExceptions,
    enabled: !id,
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
      setPendingAction(null);
      setError('');
      await client.setQueryData(['admin-order', id], order);
      await client.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: () => {
      setPendingAction(null);
      setError('Unable to confirm the order. Reload to check its status.');
    },
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
      setPendingAction(null);
      setError('');
      await client.setQueryData(['admin-order', id], order);
      await client.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: () => {
      setPendingAction(null);
      setError('Unable to cancel the order. Reload to check its status.');
    },
  });
  const lifecycle = useMutation({
    mutationFn: ({
      action,
      reason: actionReason,
    }: {
      action:
        | 'ship'
        | 'deliver'
        | 'delivery-fail'
        | 'retry-delivery'
        | 'receive-return';
      reason?: string;
    }) =>
      transitionAdminOrder(id!, action, {
        idempotencyKey: beginAttempt(action),
        expectedVersion: detail.data!.version,
        ...(actionReason ? { reason: actionReason } : {}),
        ...(action === 'deliver' && detail.data!.paymentMethod === 'COD'
          ? { codCollected: true as const }
          : {}),
        ...(action === 'receive-return'
          ? { allItemsReceived: true as const }
          : {}),
      }),
    onSuccess: async (order) => {
      finishAttempt();
      setPendingAction(null);
      setError('');
      setDeliveryReason('');
      await client.setQueryData(['admin-order', id], order);
      await client.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: async () => {
      setError(
        'The action failed. The order status may have changed; reloading.',
      );
      finishAttempt();
      setPendingAction(null);
      await detail.refetch();
    },
  });

  const submitPendingAction = () => {
    if (!pendingAction) return;
    setError('');
    if (pendingAction === 'confirm') {
      beginAttempt('confirm');
      confirm.mutate();
    } else if (pendingAction === 'cancel') {
      if (!reason.trim()) {
        setError('Enter a cancellation reason.');
        return;
      }
      beginAttempt('cancel');
      cancel.mutate();
    } else if (pendingAction === 'delivery-fail') {
      if (!deliveryReason.trim()) {
        setError('Enter a delivery failure reason.');
        return;
      }
      lifecycle.mutate({
        action: pendingAction,
        reason: deliveryReason.trim(),
      });
    } else {
      lifecycle.mutate({ action: pendingAction });
    }
  };

  const actionBusy =
    confirm.isPending || cancel.isPending || lifecycle.isPending;

  if (!id)
    return (
      <div className="admin-page-content">
        <header className="admin-page-heading">
          <div>
            <h1>Orders</h1>
            <p>Review new orders, confirm or cancel before delivery.</p>
          </div>
        </header>
        {paymentExceptions.isError ? (
          <p role="alert">Unable to load payOS reconciliation cases.</p>
        ) : null}
        {paymentExceptions.data?.length ? (
          <section className="admin-panel">
            <h2>payOS payments requiring review</h2>
            {paymentExceptions.data.map((item) => (
              <p key={item.reference}>
                <Link to={`/admin/orders/${item.orderId}`}>
                  Order {item.orderId}
                </Link>{' '}
                · {formatVnd(item.amount)} · {item.reference} ·{' '}
                {date(item.receivedAt)} · {item.reviewReason}
              </p>
            ))}
          </section>
        ) : null}
        <div className="order-tabs">
          {filters.map(([value, label]) => (
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
        {list.isPending ? <p role="status">Loading orders…</p> : null}
        {list.isError ? (
          <p role="alert">
            Unable to load orders.{' '}
            <button onClick={() => void list.refetch()}>Try again</button>
          </p>
        ) : null}
        <div className="admin-panel admin-table-panel admin-orders-table">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Order date</th>
                  <th>Total</th>
                  <th>Status</th>
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
                      <Link to={`/admin/orders/${order.id}`}>Details</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.data && list.data.items.length === 0 ? (
            <div className="table-empty">No orders found.</div>
          ) : null}
        </div>
        {list.data && list.data.total > 20 ? (
          <nav className="order-tabs" aria-label="Order pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} / {Math.ceil(list.data.total / 20)}
            </span>
            <button
              disabled={page * 20 >= list.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        ) : null}
      </div>
    );

  if (detail.isPending)
    return (
      <div className="admin-page-content">
        <p role="status">Loading order details…</p>
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="admin-page-content">
        <p role="alert">Order not found.</p>
        <Link to="/admin/orders">Back to list</Link>
      </div>
    );
  const order = detail.data;
  return (
    <div className="admin-page-content">
      <div className="breadcrumbs">
        <Link to="/admin">Admin</Link>
        <ChevronRight />
        <Link to="/admin/orders">Orders</Link>
        <ChevronRight />
        <span>{order.id}</span>
      </div>
      <header className="admin-page-heading">
        <div>
          <h1>Order {order.id}</h1>
          <p>
            {date(order.createdAt)} · {labels[order.status]}
          </p>
        </div>
      </header>
      <section className="checkout-panel">
        <h2>Customer and delivery</h2>
        <p>
          {order.address.recipientName} · {order.address.recipientPhone}
        </p>
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
          <span>
            {order.paymentMethod === 'PAYOS' ? 'payOS total' : 'COD total'}
          </span>
          <strong>{formatVnd(order.totalAmount)}</strong>
        </div>
        {order.customerNote ? <p>Note: {order.customerNote}</p> : null}
        {order.cancelReason ? (
          <p>Cancellation reason: {order.cancelReason}</p>
        ) : null}
        <div className="checkout-total-row">
          <span>Payment</span>
          <strong>{order.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}</strong>
        </div>
        {transactions.isError ? (
          <p role="alert">Unable to load payOS transactions.</p>
        ) : null}
        {transactions.data?.map((item) => (
          <p key={item.reference}>
            payOS · {formatVnd(item.amount)} · {item.reference} ·{' '}
            {item.outcome === 'REVIEW' ? 'Requires review' : 'Verified'} ·{' '}
            {item.evidenceSource === 'PAYOS_API' ? 'payOS API' : 'Webhook'} ·{' '}
            {date(item.receivedAt)}{' '}
            {item.reviewReason ? `· ${item.reviewReason}` : ''}
          </p>
        ))}
        {order.firstShippedAt ? (
          <p>Dispatched: {date(order.firstShippedAt)}</p>
        ) : null}
        {order.deliveredAt ? <p>Delivered: {date(order.deliveredAt)}</p> : null}
        {order.status === 'PENDING' ? (
          <div className="checkout-actions">
            <button
              className="button-primary"
              disabled={
                actionBusy ||
                (order.paymentMethod === 'PAYOS' &&
                  order.paymentStatus !== 'PAID')
              }
              onClick={() => setPendingAction('confirm')}
            >
              {confirm.isPending ? 'Confirming…' : 'Confirm order'}
            </button>
            {order.paymentStatus === 'UNPAID' ? (
              <button
                className="button-secondary"
                disabled={actionBusy}
                onClick={() => setPendingAction('cancel')}
              >
                Cancel order
              </button>
            ) : null}
          </div>
        ) : order.status === 'CONFIRMED' && order.paymentStatus === 'UNPAID' ? (
          <div className="checkout-actions">
            <button
              className="button-secondary"
              disabled={actionBusy}
              onClick={() => setPendingAction('cancel')}
            >
              Cancel confirmed order
            </button>
          </div>
        ) : null}
        {order.status === 'CONFIRMED' ? (
          <div className="checkout-actions">
            <button
              className="button-primary"
              disabled={actionBusy}
              onClick={() => setPendingAction('ship')}
            >
              Dispatch
            </button>
          </div>
        ) : null}
        {order.status === 'SHIPPING' ? (
          <div className="checkout-actions">
            <button
              className="button-primary"
              disabled={actionBusy}
              onClick={() => setPendingAction('deliver')}
            >
              {order.paymentMethod === 'COD'
                ? 'Delivered and COD collected'
                : 'Confirm delivery'}
            </button>
            <button
              className="button-secondary"
              disabled={actionBusy}
              onClick={() => setPendingAction('delivery-fail')}
            >
              Delivery failed
            </button>
          </div>
        ) : null}
        {order.status === 'DELIVERY_FAILED' ? (
          <div className="checkout-actions">
            <button
              className="button-primary"
              disabled={actionBusy}
              onClick={() => setPendingAction('retry-delivery')}
            >
              Redeliver
            </button>
            {order.paymentStatus === 'UNPAID' ? (
              <button
                className="button-secondary"
                disabled={actionBusy}
                onClick={() => setPendingAction('receive-return')}
              >
                All items returned to stock
              </button>
            ) : null}
            {order.paymentStatus === 'PAID' ? (
              <p>
                For prepaid orders, review the returned items and arrange
                reimbursement manually.
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
      </section>
      {pendingAction ? (
        <div
          className="order-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !actionBusy) {
              setPendingAction(null);
              setError('');
            }
          }}
        >
          <form
            className="order-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-action-title"
            onSubmit={(event) => {
              event.preventDefault();
              submitPendingAction();
            }}
          >
            <h2 id="order-action-title">{actionText[pendingAction].title}</h2>
            <p>
              {pendingAction === 'deliver' && order.paymentMethod === 'PAYOS'
                ? 'Confirm that the customer received the order.'
                : actionText[pendingAction].description}
            </p>
            {pendingAction === 'deliver' ? (
              <p className="order-dialog-impact">
                COD amount to collect:{' '}
                <strong>{formatVnd(order.totalAmount)}</strong>
              </p>
            ) : null}
            {pendingAction === 'cancel' || pendingAction === 'delivery-fail' ? (
              <label htmlFor="order-action-reason">
                {pendingAction === 'cancel'
                  ? 'Cancellation reason'
                  : 'Delivery failure reason'}
                <textarea
                  id="order-action-reason"
                  value={pendingAction === 'cancel' ? reason : deliveryReason}
                  maxLength={500}
                  required
                  autoFocus
                  onChange={(event) =>
                    pendingAction === 'cancel'
                      ? setReason(event.target.value)
                      : setDeliveryReason(event.target.value)
                  }
                />
              </label>
            ) : null}
            {pendingAction === 'receive-return' ? (
              <label className="order-dialog-check">
                <input type="checkbox" required />I confirm that all items have
                been returned to inventory intact.
              </label>
            ) : null}
            {pendingAction === 'deliver' ? (
              <label className="order-dialog-check">
                <input type="checkbox" required />
                {order.paymentMethod === 'COD'
                  ? 'I confirm delivery and collection of the full COD amount.'
                  : 'I confirm delivery.'}
              </label>
            ) : null}
            <div className="order-dialog-actions">
              <button
                type="button"
                className="button-secondary"
                disabled={actionBusy}
                onClick={() => {
                  setPendingAction(null);
                  setError('');
                }}
              >
                Not now
              </button>
              <button
                type="submit"
                className="button-primary"
                disabled={actionBusy}
              >
                {actionBusy
                  ? 'Processing…'
                  : pendingAction === 'deliver' &&
                      order.paymentMethod === 'PAYOS'
                    ? 'Confirm delivery'
                    : actionText[pendingAction].submit}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <section className="checkout-panel">
        <h2>Order history</h2>
        {order.history.map((item, index) => (
          <p key={`${item.toStatus}-${index}`}>
            <PackageCheck size={15} /> {labels[item.toStatus] ?? item.toStatus}{' '}
            · {item.actor} · {date(item.createdAt)}
            {item.reason ? ` · ${item.reason}` : ''}
          </p>
        ))}
      </section>
      <Link to="/admin/orders">Back to list</Link>
    </div>
  );
}
