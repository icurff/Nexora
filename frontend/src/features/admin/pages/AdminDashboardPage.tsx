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
      label: 'Tổng doanh thu',
      value: '128.450.000 ₫',
      change: '+12,8%',
      icon: BarChart3,
      color: 'violet',
    },
    {
      label: 'Đơn hàng',
      value: '1.284',
      change: '+8,2%',
      icon: ShoppingBag,
      color: 'blue',
    },
    {
      label: 'Khách hàng mới',
      value: '356',
      change: '+18,4%',
      icon: Users,
      color: 'amber',
    },
    {
      label: 'Giá trị trung bình',
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
          <span>TỔNG QUAN CỬA HÀNG</span>
          <h1>
            Chào buổi sáng, Minh Anh <span className="wave">✦</span>
          </h1>
          <p>Đây là những gì đang diễn ra với Nexora hôm nay.</p>
        </div>
        <button className="admin-date-button">
          Tháng này <ChevronDown size={15} />
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
              so với tháng trước
            </small>
          </article>
        ))}
      </div>
      <div className="admin-dashboard-grid">
        <section className="admin-panel revenue-panel">
          <div className="admin-panel-head">
            <div>
              <span>HIỆU QUẢ KINH DOANH</span>
              <h2>Doanh thu theo tháng</h2>
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
              <span>TỔNG QUAN</span>
              <h2>Đơn theo danh mục</h2>
            </div>
            <button className="round-more">
              <MoreHorizontal size={18} />
            </button>
          </div>
          <div className="donut-chart">
            <div>
              <strong>1.284</strong>
              <small>Đơn hàng</small>
            </div>
          </div>
          <div className="donut-legend">
            <span>
              <i className="dot-purple" /> Thời trang <strong>38%</strong>
            </span>
            <span>
              <i className="dot-blue" /> Nhà cửa <strong>27%</strong>
            </span>
            <span>
              <i className="dot-orange" /> Thiết bị số <strong>21%</strong>
            </span>
            <span>
              <i className="dot-green" /> Phụ kiện <strong>14%</strong>
            </span>
          </div>
        </section>
      </div>
      <section className="admin-panel recent-orders-panel">
        <div className="admin-panel-head">
          <div>
            <span>CẬP NHẬT GẦN ĐÂY</span>
            <h2>Đơn hàng mới nhất</h2>
          </div>
          <Link to="/admin/orders" className="admin-text-link">
            Xem tất cả <ArrowRight size={15} />
          </Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>MÃ ĐƠN</th>
                <th>KHÁCH HÀNG</th>
                <th>NGÀY ĐẶT</th>
                <th>TỔNG TIỀN</th>
                <th>TRẠNG THÁI</th>
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
              <span>SẢN PHẨM</span>
              <h2>Bán chạy nhất</h2>
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
                <small>{product.sold} sản phẩm đã bán</small>
              </span>
              <em>{[34, 28, 19, 12][index]}%</em>
            </div>
          ))}
        </section>
        <section className="admin-panel quick-actions">
          <div className="admin-panel-head">
            <div>
              <span>TRUY CẬP NHANH</span>
              <h2>Thao tác thường dùng</h2>
            </div>
          </div>
          <Link to="/admin/products">
            <span className="quick-action-icon purple">
              <Plus />
            </span>
            <span>
              <strong>Thêm sản phẩm</strong>
              <small>Đưa sản phẩm mới lên cửa hàng</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/admin/coupons">
            <span className="quick-action-icon orange">
              <BadgePercent />
            </span>
            <span>
              <strong>Tạo ưu đãi</strong>
              <small>Tạo mã giảm giá cho khách hàng</small>
            </span>
            <ArrowRight />
          </Link>
          <Link to="/admin/orders">
            <span className="quick-action-icon blue">
              <ShoppingBag />
            </span>
            <span>
              <strong>Xử lý đơn hàng</strong>

            </span>
            <ArrowRight />
          </Link>
        </section>
      </div>
    </div>
  );
}
