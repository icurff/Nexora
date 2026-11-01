import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { CheckoutAddressPicker } from '../../account/components/AddressBook';
import '../CheckoutAddress.css';

export function CheckoutPage() {
  const { status, user } = useAuth();
  if (status === 'loading')
    return (
      <div className="page-container page-section">
        <p role="status">Đang kiểm tra tài khoản…</p>
      </div>
    );
  if (!user || user.role !== 'CUSTOMER')
    return (
      <div className="page-container page-section">
        <div className="empty-state">
          <ShoppingBag />
          <h1>Đăng nhập để thanh toán</h1>
          <p>Đăng nhập tài khoản khách hàng để chọn địa chỉ nhận hàng.</p>
          <Link className="button-primary" to="/login">
            Đăng nhập
          </Link>
        </div>
      </div>
    );

  return (
    <div className="page-container page-section">
      <div className="checkout-layout">
        <main className="checkout-main">
          <CheckoutAddressPicker />
          <div className="empty-state checkout-unavailable">
            <ShoppingBag />
            <span className="section-eyebrow">THANH TOÁN</span>
            <h1>Đặt hàng chưa khả dụng</h1>
            <p>Hiện bạn có thể quản lý giỏ và chọn địa chỉ nhận hàng.</p>
            <Link className="button-secondary" to="/cart">
              <ArrowLeft size={16} /> Quay lại giỏ hàng
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
