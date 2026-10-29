import { useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CreditCard,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoProducts, formatVnd } from '../../catalog/demo-data.js';
import { useDemoCommerceStore } from '../../../context/demo-commerce-store.js';

export function CheckoutPage() {
  const cart = useDemoCommerceStore((state) => state.cart);
  const clearCart = useDemoCommerceStore((state) => state.clearCart);
  const [payment, setPayment] = useState('cod');
  const [address, setAddress] = useState('home');
  const [coupon, setCoupon] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [success, setSuccess] = useState(false);
  const lines = cart
    .map((line) => ({
      ...line,
      product: demoProducts.find((item) => item.id === line.productId)!,
    }))
    .filter((line) => line.product);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.product.price * line.quantity,
    0,
  );
  const discount = couponApplied ? 50000 : 0;
  const total = subtotal + (subtotal >= 500000 ? 0 : 30000) - discount;
  function placeOrder() {
    setSuccess(true);
    clearCart();
  }
  if (success)
    return (
      <div className="page-container page-section">
        <div className="empty-state order-success">
          <span className="success-check">
            <Check />
          </span>
          <span className="section-eyebrow">ĐẶT HÀNG THÀNH CÔNG</span>
          <h1>Cảm ơn bạn đã chọn Nexora.</h1>
          <p>
            Đơn hàng <strong>#NX-2026-1056</strong> đã được ghi nhận trong bản
            xem trước.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" to="/orders/NX-2026-1056">
              Xem đơn hàng <ArrowRight size={16} />
            </Link>
            <Link className="button-secondary" to="/">
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <Link to="/cart">Giỏ hàng</Link>
        <ChevronRight />
        <span>Thanh toán</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">SẮP HOÀN TẤT</span>
          <h1>Thanh toán</h1>
          <p>Kiểm tra thông tin trước khi hoàn tất đơn hàng.</p>
        </div>
        <div className="checkout-steps">
          <span className="step-done">01 Giỏ hàng</span>
          <span className="step-active">02 Giao hàng</span>
          <span>03 Hoàn tất</span>
        </div>
      </div>
      {!lines.length ? (
        <div className="empty-state">
          <ShoppingBag />
          <h3>Chưa có sản phẩm để thanh toán</h3>
          <Link className="button-primary" to="/products">
            Tiếp tục mua sắm
          </Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <div className="checkout-main">
            <section className="checkout-panel">
              <div className="panel-heading">
                <span className="checkout-number">01</span>
                <div>
                  <h2>Thông tin giao hàng</h2>
                  <p>Chọn địa chỉ nhận hàng của bạn.</p>
                </div>
                <button className="text-link">+ Thêm địa chỉ</button>
              </div>
              <label
                className={`address-option${address === 'home' ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="address"
                  checked={address === 'home'}
                  onChange={() => setAddress('home')}
                />
                <span className="address-radio" />
                <span className="address-copy">
                  <strong>
                    Nguyễn Minh Anh <em>Mặc định</em>
                  </strong>
                  <small>
                    090 123 4567 · 24 Nguyễn Thị Minh Khai, Quận 1, TP. Hồ Chí
                    Minh
                  </small>
                </span>
                <span className="address-kind">Nhà riêng</span>
              </label>
              <label
                className={`address-option${address === 'office' ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="address"
                  checked={address === 'office'}
                  onChange={() => setAddress('office')}
                />
                <span className="address-radio" />
                <span className="address-copy">
                  <strong>Nguyễn Minh Anh</strong>
                  <small>
                    090 123 4567 · 15 Điện Biên Phủ, Bình Thạnh, TP. Hồ Chí Minh
                  </small>
                </span>
                <span className="address-kind">Văn phòng</span>
              </label>
            </section>
            <section className="checkout-panel">
              <div className="panel-heading">
                <span className="checkout-number">02</span>
                <div>
                  <h2>Phương thức thanh toán</h2>
                  <p>Chọn cách thanh toán phù hợp.</p>
                </div>
              </div>
              <label
                className={`payment-option${payment === 'cod' ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={payment === 'cod'}
                  onChange={() => setPayment('cod')}
                />
                <span className="payment-symbol">COD</span>
                <span>
                  <strong>Thanh toán khi nhận hàng</strong>
                  <small>Thanh toán tiền mặt khi đơn được giao</small>
                </span>
                <span className="address-radio" />
              </label>
              <label
                className={`payment-option${payment === 'online' ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={payment === 'online'}
                  onChange={() => setPayment('online')}
                />
                <span className="payment-symbol online">
                  <CreditCard />
                </span>
                <span>
                  <strong>Thanh toán trực tuyến</strong>
                  <small>Thẻ ATM, Visa, Mastercard hoặc ví điện tử</small>
                </span>
                <span className="address-radio" />
              </label>
            </section>
            <section className="checkout-panel">
              <div className="panel-heading">
                <span className="checkout-number">03</span>
                <div>
                  <h2>Mã giảm giá</h2>
                  <p>Nhập mã ưu đãi của bạn.</p>
                </div>
              </div>
              <form
                className="coupon-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  setCouponApplied(coupon.trim().toUpperCase() === 'NEXORA50');
                }}
              >
                <input
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value)}
                  placeholder="Nhập mã giảm giá"
                />
                <button type="submit">Áp dụng</button>
              </form>
              {couponApplied ? (
                <p className="coupon-success">
                  <Check size={14} /> Đã áp dụng ưu đãi 50.000 ₫
                </p>
              ) : null}
            </section>
          </div>
          <aside className="order-summary checkout-summary">
            <h2>
              Đơn hàng của bạn <span>({lines.length} món)</span>
            </h2>
            <div className="checkout-items">
              {lines.map(({ product, quantity }) => (
                <div className="checkout-item" key={product.id}>
                  <span className={`checkout-item-image ${product.color}`}>
                    <img src={product.image} alt="" />
                    <i>{quantity}</i>
                  </span>
                  <span className="checkout-item-name">{product.name}</span>
                  <strong>{formatVnd(product.price * quantity)}</strong>
                </div>
              ))}
            </div>
            <div className="summary-row">
              <span>Tạm tính</span>
              <span>{formatVnd(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Giao hàng</span>
              <span>{subtotal >= 500000 ? 'Miễn phí' : formatVnd(30000)}</span>
            </div>
            {discount ? (
              <div className="summary-row discount-row">
                <span>Ưu đãi</span>
                <span>−{formatVnd(discount)}</span>
              </div>
            ) : null}
            <div className="summary-row summary-total">
              <strong>Tổng thanh toán</strong>
              <strong>{formatVnd(total)}</strong>
            </div>
            <button className="button-primary full-button" onClick={placeOrder}>
              Đặt hàng <ArrowRight size={17} />
            </button>
            <p className="terms-note">
              Bằng việc đặt hàng, bạn đồng ý với{' '}
              <Link to="/policies/terms">Điều khoản mua hàng</Link>.
            </p>
            <div className="safe-payment">
              <ShieldCheck size={16} /> Thông tin được bảo mật
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
