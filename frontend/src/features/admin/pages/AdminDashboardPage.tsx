import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowRight, Plus, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { formatVnd } from '../../catalog/services/public-catalog-api';
import { getAdminOrders } from '../../orders/services/order-api';
import { ApiClient } from '../../../services/api-client';

type Dashboard = {
  from: string;
  to: string;
  created: number;
  pending: number;
  cancelled: number;
  deliveryFailed: number;
  merchandisePaid: string;
  shippingPaid: string;
  lowStockThreshold: number;
  lowStock: Array<{ sku: string; productName: string; available: number }>;
};

const labels: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  SHIPPING: 'Shipping',
  DELIVERY_FAILED: 'Delivery failed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function AdminDashboardPage() {
  const { user } = useAuth();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: today, to: today });
  const dashboard = useQuery({
    queryKey: ['admin-dashboard', range],
    queryFn: async () =>
      (await ApiClient.get<Dashboard>('/admin/dashboard', { params: range }))
        .data,
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['admin-orders', 'ALL', 1],
    queryFn: () => getAdminOrders(),
    retry: false,
  });
  return (
    <div className="admin-dashboard">
      <div className="admin-page-heading">
        <div>
          <h1>Welcome, {user?.fullName ?? 'Admin'}</h1>
          <p>Manage your store and recent orders.</p>
        </div>
      </div>
      <form
        className="admin-list-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setRange({ from, to });
        }}
      >
        <label>
          From{' '}
          <input
            type="date"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          To{' '}
          <input
            type="date"
            required
            min={from}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button className="admin-button-secondary">Apply</button>
      </form>
      {dashboard.isPending ? <p role="status">Loading dashboard…</p> : null}
      {dashboard.isError ? (
        <div role="alert">
          <p>Unable to load dashboard.</p>
          <button
            className="admin-button-secondary"
            onClick={() => void dashboard.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {dashboard.data ? (
        <>
          <div className="admin-metric-grid">
            {[
              ['New orders', dashboard.data.created],
              ['Pending now', dashboard.data.pending],
              ['Cancelled', dashboard.data.cancelled],
              ['Delivery failures', dashboard.data.deliveryFailed],
              [
                'Merchandise collected',
                formatVnd(dashboard.data.merchandisePaid),
              ],
              ['Shipping collected', formatVnd(dashboard.data.shippingPaid)],
            ].map(([label, value]) => (
              <article className="admin-metric-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <section className="admin-panel">
            <div className="admin-panel-head">
              <h2>Low stock SKUs</h2>
              <Link className="admin-text-link" to="/admin/inventory">
                View inventory <ArrowRight size={15} />
              </Link>
            </div>
            <p>
              Available stock at or below {dashboard.data.lowStockThreshold}.
            </p>
            {dashboard.data.lowStock.length ? (
              <ul>
                {dashboard.data.lowStock.map((item) => (
                  <li key={item.sku}>
                    {item.productName} · {item.sku} · {item.available} available
                  </li>
                ))}
              </ul>
            ) : (
              <p>No low stock SKUs.</p>
            )}
          </section>
        </>
      ) : null}
      <section className="admin-panel recent-orders-panel">
        <div className="admin-panel-head">
          <h2>Latest orders</h2>
          <Link to="/admin/orders" className="admin-text-link">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {orders.isPending ? <p role="status">Loading orders…</p> : null}
        {orders.isError ? (
          <div role="alert">
            <p>Unable to load orders.</p>
            <button
              className="admin-button-secondary"
              onClick={() => void orders.refetch()}
            >
              Try again
            </button>
          </div>
        ) : null}
        {orders.data?.items.length === 0 ? (
          <p className="table-empty">No orders yet.</p>
        ) : null}
        {orders.data?.items.length ? (
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
                {orders.data.items.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.customer.fullName}</td>
                    <td>
                      {new Intl.DateTimeFormat('en-GB', {
                        dateStyle: 'medium',
                        timeZone: 'Asia/Ho_Chi_Minh',
                      }).format(new Date(order.createdAt))}
                    </td>
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
        ) : null}
      </section>
      <section className="admin-panel quick-actions">
        <div className="admin-panel-head">
          <h2>Common actions</h2>
        </div>
        <Link to="/admin/products">
          <span className="quick-action-icon purple">
            <Plus />
          </span>
          <span>
            <strong>Manage products</strong>
          </span>
          <ArrowRight />
        </Link>
        <Link to="/admin/orders">
          <span className="quick-action-icon blue">
            <ShoppingBag />
          </span>
          <span>
            <strong>Manage orders</strong>
          </span>
          <ArrowRight />
        </Link>
      </section>
    </div>
  );
}
