import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoProducts, formatVnd } from '../../catalog/demo-data.js';
import { useDemoCommerceStore } from '../../../context/demo-commerce-store.js';

export function CartPage() {
  const cart = useDemoCommerceStore((state) => state.cart);
  const setQuantity = useDemoCommerceStore((state) => state.setQuantity);
  const remove = useDemoCommerceStore((state) => state.removeFromCart);
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
  const shipping = subtotal >= 500000 || subtotal === 0 ? 0 : 30000;
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <span>Giỏ hàng</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">GIỎ HÀNG CỦA BẠN</span>
          <h1>Những món bạn đã chọn</h1>
          <p>
            {lines.reduce((sum, line) => sum + line.quantity, 0)} sản phẩm trong
            giỏ
          </p>
        </div>
      </div>
      {lines.length ? (
        <div className="cart-layout">
          <div className="cart-lines">
            {lines.map(({ product, quantity }) => (
              <article key={product.id} className="cart-line">
                <Link
                  to={`/products/${product.id}`}
                  className={`cart-line-image ${product.color}`}
                >
                  <img src={product.image} alt="" />
                </Link>
                <div className="cart-line-info">
                  <Link
                    to={`/products/${product.id}`}
                    className="cart-line-name"
                  >
                    {product.name}
                  </Link>
                  <span>{product.category} · Natural</span>
                  <button
                    className="remove-link"
                    onClick={() => remove(product.id)}
                  >
                    <X size={14} /> Xóa
                  </button>
                </div>
                <div className="cart-line-quantity">
                  <div className="quantity-control">
                    <button
                      onClick={() => setQuantity(product.id, quantity - 1)}
                      aria-label="Giảm"
                    >
                      <Minus size={14} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      onClick={() => setQuantity(product.id, quantity + 1)}
                      aria-label="Tăng"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <strong>{formatVnd(product.price * quantity)}</strong>
                </div>
              </article>
            ))}
          </div>
          <aside className="order-summary">
            <h2>Tóm tắt đơn hàng</h2>
            <div className="summary-row">
              <span>Tạm tính</span>
              <span>{formatVnd(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Phí vận chuyển</span>
              <span>{shipping ? formatVnd(shipping) : 'Miễn phí'}</span>
            </div>
            <div className="summary-row summary-total">
              <strong>Tổng cộng</strong>
              <strong>{formatVnd(subtotal + shipping)}</strong>
            </div>
            <p className="summary-note">
              Thuế đã bao gồm. Phí giao hàng được tính ở bước tiếp theo.
            </p>
            <Link className="button-primary full-button" to="/checkout">
              Tiến hành thanh toán <ArrowRight size={17} />
            </Link>
            <Link className="continue-link" to="/products">
              <ArrowLeft size={15} /> Tiếp tục mua sắm
            </Link>
            <div className="safe-payment">
              <ShieldCheck size={16} /> Thanh toán an toàn và bảo mật
            </div>
          </aside>
        </div>
      ) : (
        <div className="empty-state">
          <ShoppingBag />
          <h3>Giỏ hàng đang trống</h3>
          <p>Bắt đầu với một món đồ bạn yêu thích nhé.</p>
          <Link className="button-primary" to="/products">
            Khám phá sản phẩm <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </div>
  );
}
