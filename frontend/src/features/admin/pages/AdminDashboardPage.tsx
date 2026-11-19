import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  BarChart3,
  ChevronDown,
  Eye,
  MoreHorizontal,
  Plus,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  demoOrders,
  demoProducts,
  formatVnd,
} from '../../catalog/demo-data.js';

export function AdminDashboardPage() {
  const metrics = [
    {
      label: 'Total revenue',
      value: '128.450.000 ₫',
      change: '+12,8%',
      icon: BarChart3,
      color: 'violet',
    },
    {
      label: 'Orders',
      value: '1.284',
      change: '+8,2%',
      icon: ShoppingBag,
      color: 'blue',
    },
    {
      label: 'New customers',
      value: '356',
      change: '+18,4%',
      icon: Users,
      color: 'amber',
    },
    {
      label: 'Average order value',
      value: '845.000 ₫',
      change: '+4,6%',
      icon: TrendingUp,
      color: 'green',
    },
  ];
  const bars = [42, 55, 48, 66, 52, 75, 61, 88, 58, 74, 64, 96];
  return (
    <div className="admin-dashboard">
      <div className="admin-page-heading">
        <div>
          <span>STORE OVERVIEW</span>
          <h1>
            Good morning, Minh Anh <span className="wave">✦</span>
          </h1>
          <p>Here's what's happening at Nexora today.</p>
        </div>
        <button className="admin-date-button">
          This month <ChevronDown size={15} />
        </button>
      </div>
      <div className="admin-metric-grid">
        {metrics.map(({ label, value, change, icon: Icon, color }) => (
          <article className="admin-metric-card" key={label}>
            <div className={`metric-icon ${color}`}>
              <Icon size={19} />
            </div>
            <button className="metric-menu">
              <MoreHorizontal size={19} />
            </button>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>
              <i>
                <ArrowUpRight size={13} /> {change}
              </i>{' '}
              compared to last month
            </small>
          </article>
        ))}
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel revenue-panel">
          <div className="admin-panel-head">
            <div>
              <span>BUSINESS PERFORMANCE</span>
              <h2>Monthly revenue</h2>
            </div>
            <button className="admin-select">
              2026 <ChevronDown size={14} />
            </button>
          </div>
          <div className="revenue-summary">
            <strong>128.450.000 ₫</strong>
            <span>
              <ArrowUpRight size={14} /> 12,8%
            </span>
          </div>
          <div className="chart-area">
            <div className="chart-y-axis">
              <span>40tr</span>
              <span>30tr</span>
              <span>20tr</span>
              <span>10tr</span>
              <span>0</span>
            </div>
            <div className="bar-chart">
              {bars.map((height, index) => (
                <div className="chart-column" key={index}>
                  <span
                    className={`chart-bar${index === 11 ? ' current' : ''}`}
                    style={{ height: `${height}%` }}
                  />
                  <small>
                    {
                      [
                        'T1',
                        'T2',
                        'T3',
                        'T4',
                        'T5',
                        'T6',
                        'T7',
                        'T8',
                        'T9',
                        'T10',
                        'T11',
                        'T12',
                      ][index]
                    }
                  </small>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="admin-panel category-performance">
          <div className="admin-panel-head">
            <div>
              <span>OVERVIEW</span>
              <h2>Orders by category</h2>
            </div>
            <button className="round-more">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="donut-chart">
            <div>
              <strong>1.284</strong>
              <small>Orders</small>
            </div>
          </div>
          <div className="donut-legend">
            <span>
              <i className="dot-purple" /> Fashion <strong>38%</strong>
            </span>
            <span>
              <i className="dot-blue" /> Home <strong>27%</strong>
            </span>
            <span>
              <i className="dot-orange" /> Electronics <strong>21%</strong>
            </span>
            <span>
              <i className="dot-green" /> Accessories <strong>14%</strong>
            </span>
          </div>
        </section>
      </div>
      <section className="admin-panel recent-orders-panel">
        <div className="admin-panel-head">
          <div>
            <span>RECENT UPDATES</span>
            <h2>Latest orders</h2>
          </div>
          <Link to="/admin/orders" className="admin-text-link">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ORDER ID</th>
                <th>CUSTOMER</th>
                <th>ORDER DATE</th>
                <th>TOTAL</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {demoOrders.map((order, i) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.id}</strong>
                  </td>
                  <td>
                    <span className="admin-customer">
                      <i>{['MA', 'QB', 'HM'][i]}</i>
                      {['Minh Anh Nguyễn', 'Quốc Bảo Trần', 'Hà My Lê'][i]}
                    </span>
                  </td>
                  <td>{order.date}</td>
                  <td>
                    <strong>{formatVnd(order.total)}</strong>
                  </td>
                  <td>
                    <span
                      className={`admin-status ${i === 0 ? 'processing' : 'complete'}`}
                    >
                      <i />
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <button className="table-icon">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="admin-dashboard-bottom">
        <section className="admin-panel popular-products">
          <div className="admin-panel-head">
            <div>
              <span>PRODUCTS</span>
              <h2>Best sellers</h2>
            </div>
            <button className="round-more">
              <MoreHorizontal size={18} />
            </button>
          </div>
          {demoProducts.slice(0, 4).map((product, index) => (
            <div className="popular-product" key={product.id}>
              <span className={`popular-product-thumb ${product.color}`}>
                <img src={product.image} alt="" />
              </span>
              <span>
                <strong>{product.name}</strong>
                <small>{product.sold} products sold</small>
              </span>
              <em>{[34, 28, 19, 12][index]}%</em>
            </div>
          ))}
        </section>
        <section className="admin-panel quick-actions">
          <div className="admin-panel-head">
            <div>
              <span>QUICK ACCESS</span>
              <h2>Common actions</h2>
            </div>
          </div>
          <Link to="/admin/products">
            <span className="quick-action-icon purple">
              <Plus />
            </span>
            <span>
              <strong>Add a product</strong>
              <small>Add a new product to the store</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/admin/coupons">
            <span className="quick-action-icon orange">
              <BadgePercent />
            </span>
            <span>
              <strong>Create an offer</strong>
              <small>Create a discount code for customers</small>
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
    </div>
  );
}
