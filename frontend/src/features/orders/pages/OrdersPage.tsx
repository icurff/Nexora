import { useState } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  demoOrders,
  demoProducts,
  formatVnd,
} from '../../catalog/demo-data.js';

export function OrdersPage() {
  const [filter, setFilter] = useState('Tất cả');
  const orders = demoOrders.filter(
    (order) => filter === 'Tất cả' || order.status === filter,
  );
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
          <p>Theo dõi các đơn hàng gần đây của bạn.</p>
        </div>
      </div>
      <div className="order-tabs">
        {['Tất cả', 'Đang giao', 'Đã giao', 'Đã hủy'].map((item) => (
          <button
            key={item}
            className={filter === item ? 'active' : ''}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="orders-list">
        {orders.map((order) => (
          <article className="order-card" key={order.id}>
            <div className="order-card-head">
              <div>
                <span>MÃ ĐƠN HÀNG</span>
                <strong>{order.id}</strong>
              </div>
              <span
                className={`order-status ${order.status === 'Đang giao' ? 'in-progress' : 'complete'}`}
              >
                <i />
                {order.status}
              </span>
            </div>
            <div className="order-card-content">
              <div className="order-thumbs">
                {order.items.map((name) => {
                  const product =
                    demoProducts.find((item) => item.name === name) ??
                    demoProducts[0];
                  return <img key={name} src={product.image} alt={name} />;
                })}
              </div>
              <div className="order-summary-text">
                <span>{order.items.join(', ')}</span>
                <small>
                  {order.date} · {order.items.length} sản phẩm
                </small>
              </div>
              <div className="order-total">
                <span>Tổng cộng</span>
                <strong>{formatVnd(order.total)}</strong>
              </div>
              <Link className="button-secondary" to={`/orders/${order.id}`}>
                Chi tiết <ArrowRight size={15} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
