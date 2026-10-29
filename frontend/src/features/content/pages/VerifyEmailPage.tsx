import { useState } from 'react';
import { Check, CircleHelp } from 'lucide-react';
import { Link } from 'react-router-dom';

export function VerifyEmailPage() {
  const [done, setDone] = useState(false);
  return (
    <div className="page-container page-section">
      <div className="email-verify-card">
        <span className="success-check">
          {done ? <Check /> : <CircleHelp />}
        </span>
        <span className="section-eyebrow">BẢO MẬT TÀI KHOẢN</span>
        <h1>{done ? 'Email đã được xác nhận' : 'Xác nhận email của bạn'}</h1>
        <p>
          {done
            ? 'Cảm ơn bạn đã xác nhận địa chỉ email trong bản xem trước.'
            : 'Màn hình xác nhận email theo mockup. Thao tác hiện chỉ thay đổi trạng thái giao diện.'}
        </p>
        <button className="button-primary" onClick={() => setDone(true)}>
          {done ? 'Đã xác nhận' : 'Xác nhận email'} <Check size={16} />
        </button>
        <Link to="/account">Về tài khoản</Link>
      </div>
    </div>
  );
}
