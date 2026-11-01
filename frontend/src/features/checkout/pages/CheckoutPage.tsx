import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CheckoutPage() {
  return (
    <div className="page-container page-section">
      <div className="empty-state">
        <ShoppingBag />
        <span className="section-eyebrow">THANH TOÁN</span>
        <h1>Thanh toán chưa khả dụng</h1>
        <p>Hiện bạn có thể quản lý giỏ và xem tạm tính tiền hàng.</p>
        <Link className="button-primary" to="/cart">
          <ArrowLeft size={16} /> Quay lại giỏ hàng
        </Link>
      </div>
    </div>
  );
}
