import { ArrowLeft, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PaymentPage() {
  return (
    <div className="page-container payment-page">
      <div className="payment-card">
        <div className="payment-brand">
          <CreditCard />
          <span>THANH TOÁN</span>
        </div>
        <span className="section-eyebrow">PHƯƠNG THỨC HIỆN CÓ: COD</span>
        <h1>Thanh toán online chưa khả dụng</h1>
        <p>Đơn hàng COD được thanh toán khi Admin xác nhận đã giao hàng.</p>
        <Link className="button-primary full-button" to="/orders">
          <ArrowLeft size={16} /> Xem đơn hàng
        </Link>
      </div>
    </div>
  );
}
