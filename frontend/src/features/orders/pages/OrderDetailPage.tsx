import {
  ArrowLeft,
  Check,
  ChevronRight,
  PackageCheck,
  Truck,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  demoOrders,
  demoProducts,
  formatVnd,
} from '../../catalog/demo-data.js';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const order = demoOrders.find((item) => item.id === id) ?? {
    id,
    date: '29/10/2026',
    status: 'Đang giao',
    total: 837000,
    items: ['Túi tote Canvas Everyday', 'Ly gốm Morning Ritual'],
  };
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
          <p>Đặt ngày {order.date}</p>
        </div>
        <span className="order-status in-progress">
          <i />
          {order.status}
        </span>
      </div>
      <div className="order-detail-grid">
        <div className="checkout-panel">
          <div className="panel-heading">
            <span className="checkout-number">
              <PackageCheck />
            </span>
            <div>
              <h2>Trạng thái đơn hàng</h2>
              <p>Đơn hàng đang trên đường đến với bạn.</p>
            </div>
          </div>
          <div className="order-tracking">
            <div className="tracking-step done">
              <span>
                <Check />
              </span>
              <div>
                <strong>Đặt hàng thành công</strong>
                <small>{order.date} · 10:42</small>
              </div>
            </div>
            <div className="tracking-step done">
              <span>
                <Check />
              </span>
              <div>
                <strong>Đơn hàng đã được xác nhận</strong>
                <small>{order.date} · 11:16</small>
              </div>
            </div>
            <div className="tracking-step active">
              <span>
                <Truck />
              </span>
              <div>
                <strong>Đang vận chuyển</strong>
                <small>Dự kiến giao trong 1–2 ngày tới</small>
              </div>
            </div>
            <div className="tracking-step">
              <span>
                <Check />
              </span>
              <div>
                <strong>Giao hàng thành công</strong>
                <small>Chưa hoàn tất</small>
              </div>
            </div>
          </div>
        </div>
        <div className="order-summary">
          <h2>Sản phẩm</h2>
          {order.items.map((name) => {
            const product =
              demoProducts.find((item) => item.name === name) ??
              demoProducts[0];
            return (
              <div className="checkout-item" key={name}>
                <span className={`checkout-item-image ${product.color}`}>
                  <img src={product.image} alt="" />
                </span>
                <span className="checkout-item-name">
                  {name}
                  <small>Phân loại: Natural</small>
                </span>
                <strong>{formatVnd(product.price)}</strong>
              </div>
            );
          })}
          <div className="summary-row summary-total">
            <strong>Tổng đơn hàng</strong>
            <strong>{formatVnd(order.total)}</strong>
          </div>
          <div className="order-address">
            <strong>Địa chỉ nhận hàng</strong>
            <p>
              Nguyễn Minh Anh · 090 123 4567
              <br />
              24 Nguyễn Thị Minh Khai, Quận 1, TP. Hồ Chí Minh
            </p>
          </div>
          <Link className="continue-link" to="/orders">
            <ArrowLeft size={15} /> Trở về danh sách đơn
          </Link>
        </div>
      </div>
    </div>
  );
}
