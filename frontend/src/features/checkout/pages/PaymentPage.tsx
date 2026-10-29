import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { BrandLogo } from '../../../components/BrandLogo';

export function PaymentPage() {
  const [params] = useSearchParams();
  const [paid, setPaid] = useState(false);
  return (
    <div className="page-container payment-page">
      <div className="payment-card">
        <div className="payment-brand">
          <BrandLogo className="payment-brand-logo" />
          <span>SECURE CHECKOUT</span>
        </div>
        {paid ? (
          <>
            <span className="success-check">
              <Check />
            </span>
            <h1>Thanh toán thành công</h1>
            <p>
              Giao dịch mô phỏng đã hoàn tất. Tham chiếu:{' '}
              {params.get('ref') || 'NX-2026-1056'}.
            </p>
            <Link
              className="button-primary full-button"
              to="/orders/NX-2026-1056"
            >
              Xem đơn hàng <ArrowRight size={16} />
            </Link>
          </>
        ) : (
          <>
            <span className="payment-lock">
              <ShieldCheck />
            </span>
            <span className="section-eyebrow">CỔNG THANH TOÁN MÔ PHỎNG</span>
            <h1>Xác nhận thanh toán</h1>
            <p>
              Đây là màn hình mô phỏng từ mockup, không phát sinh giao dịch
              thật.
            </p>
            <div className="payment-amount">
              <span>Số tiền cần thanh toán</span>
              <strong>837.000 ₫</strong>
            </div>
            <div className="mock-card-fields">
              <label>
                Số thẻ
                <input value="9704 0000 0000 0018" readOnly />
              </label>
              <div>
                <label>
                  Ngày hết hạn
                  <input value="12/28" readOnly />
                </label>
                <label>
                  Mã bảo mật
                  <input value="•••" readOnly />
                </label>
              </div>
            </div>
            <button
              className="button-primary full-button"
              onClick={() => setPaid(true)}
            >
              Thanh toán thử <ArrowRight size={16} />
            </button>
            <Link className="continue-link" to="/cart">
              <ArrowLeft size={15} /> Quay lại giỏ hàng
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
