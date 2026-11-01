import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  ChevronRight,
  LockKeyhole,
  LogOut,
  MapPin,
  Package,
  Pencil,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { StoreFrame } from '../../../layouts/StoreLayout';
import { PasswordField } from '../../auth/components/FormField';
import { Notice } from '../../auth/components/Notice';
import { errorMessage, fieldError } from '../../auth/services/auth-api';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  useChangePassword,
  useLogout,
} from '../../auth/hooks/useAuthMutations';
import { Button } from '../../../components/ui/button';
import { demoOrders, formatVnd } from '../../catalog/demo-data.js';
import '../../../Account.css';
import { AddressBook } from '../components/AddressBook';

type AccountSection = 'profile' | 'addresses' | 'orders' | 'security';

export default function AccountPage() {
  const { user } = useAuth();
  const changePasswordMutation = useChangePassword();
  const logoutMutation = useLogout();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState<AccountSection>(() =>
    searchParams.get('section') === 'addresses' ? 'addresses' : 'profile',
  );
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saved, setSaved] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>();

  if (!user) return <Navigate to="/login" replace />;

  async function submitPassword(form: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) {
    try {
      await changePasswordMutation.mutateAsync(form);
      navigate('/login?passwordChanged=1', { replace: true });
    } catch {
      // The API error is rendered below.
    }
  }

  async function signOut() {
    setLogoutError('');
    try {
      await logoutMutation.mutateAsync();
      navigate('/login?loggedOut=1', { replace: true });
    } catch {
      setLogoutError('Chưa thể kết nối để thu hồi phiên. Vui lòng thử lại.');
    }
  }

  const menu: { id: AccountSection; label: string; icon: typeof UserRound }[] =
    [
      { id: 'profile', label: 'Thông tin cá nhân', icon: UserRound },
      { id: 'addresses', label: 'Sổ địa chỉ', icon: MapPin },
      { id: 'orders', label: 'Đơn hàng của tôi', icon: Package },
      { id: 'security', label: 'Bảo mật tài khoản', icon: ShieldCheck },
    ];

  return (
    <StoreFrame>
      <div className="page-container account-dashboard page-section">
        <div className="breadcrumbs">
          <Link to="/">Trang chủ</Link>
          <ChevronRight />
          <span>Tài khoản của tôi</span>
        </div>
        <div className="account-dashboard-heading">
          <div>
            <span className="section-eyebrow">KHÔNG GIAN CỦA BẠN</span>
            <h1>Xin chào, {user.fullName.split(' ').slice(-1)[0]}.</h1>
            <p>Quản lý thông tin, đơn hàng và tùy chọn tài khoản.</p>
          </div>
          <button
            className="account-logout"
            onClick={() => void signOut()}
            disabled={logoutMutation.isPending}
          >
            <LogOut size={15} />
            {logoutMutation.isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}
          </button>
        </div>
        {logoutError ? <Notice>{logoutError}</Notice> : null}
        <div className="account-dashboard-grid">
          <aside className="account-sidebar">
            <div className="account-sidebar-profile">
              <span className="account-large-avatar">
                {initials(fullName || user.fullName)}
              </span>
              <div>
                <strong>{fullName || user.fullName}</strong>
                <small>{user.email}</small>
              </div>
              <span className="account-role">
                {user.role === 'ADMIN' ? 'Quản trị viên' : 'Khách hàng'}
              </span>
            </div>
            <nav aria-label="Điều hướng tài khoản">
              {menu.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={section === id ? 'active' : ''}
                  onClick={() => {
                    setSection(id);
                    if (id === 'addresses') setSearchParams({ section: id });
                    else setSearchParams({});
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
              {user.role === 'ADMIN' ? (
                <Link className="account-admin-link" to="/admin">
                  <ShieldCheck size={17} />
                  <span>Khu vực quản trị</span>
                  <ArrowRight size={14} />
                </Link>
              ) : null}
            </nav>
            <div className="account-help">
              <span>
                <Bell size={15} />
              </span>
              <p>Cần hỗ trợ về tài khoản?</p>
              <a href="mailto:hello@nexora.vn">Liên hệ Nexora</a>
            </div>
          </aside>
          <section className="account-content">
            {section === 'profile' ? (
              <div className="account-panel">
                <div className="account-panel-title">
                  <div>
                    <span className="section-eyebrow">HỒ SƠ CỦA BẠN</span>
                    <h2>Thông tin cá nhân</h2>
                    <p>Cập nhật thông tin liên hệ của bạn.</p>
                  </div>
                  <button className="subtle-icon" aria-label="Chỉnh sửa">
                    <Pencil size={16} />
                  </button>
                </div>
                <form
                  className="profile-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setSaved(true);
                  }}
                >
                  <label>
                    Họ và tên
                    <input
                      value={fullName}
                      onChange={(event) => {
                        setFullName(event.target.value);
                        setSaved(false);
                      }}
                    />
                  </label>
                  <label>
                    Email
                    <input value={user.email} disabled />
                    <small>Email đăng nhập không thể thay đổi.</small>
                  </label>
                  <label>
                    Số điện thoại
                    <input
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setSaved(false);
                      }}
                      placeholder="Nhập số điện thoại"
                    />
                  </label>
                  <label>
                    Ngày tạo tài khoản
                    <input
                      value={new Date(user.createdAt).toLocaleDateString(
                        'vi-VN',
                      )}
                      disabled
                    />
                  </label>
                  <div className="profile-form-footer">
                    <span>
                      {saved ? (
                        <>
                          <Check size={14} /> Đã lưu trên giao diện xem trước
                        </>
                      ) : (
                        'Thông tin chỉ được lưu trong phiên xem trước.'
                      )}
                    </span>
                    <button className="button-primary" type="submit">
                      Lưu thay đổi <ArrowRight size={15} />
                    </button>
                  </div>
                </form>
                <div className="email-security-banner">
                  <span>
                    <BadgeCheck />
                  </span>
                  <div>
                    <strong>Email của bạn đã được xác nhận</strong>
                    <small>Tài khoản được bảo vệ bằng email đăng nhập.</small>
                  </div>
                  <Link to="/verify-email">Chi tiết</Link>
                </div>
              </div>
            ) : null}
            {section === 'addresses' ? <AddressBook /> : null}
            {section === 'orders' ? (
              <div className="account-panel">
                <div className="account-panel-title">
                  <div>
                    <span className="section-eyebrow">HÀNH TRÌNH MUA SẮM</span>
                    <h2>Đơn hàng của tôi</h2>
                    <p>Theo dõi những đơn hàng gần đây.</p>
                  </div>
                  <Link className="text-link" to="/orders">
                    Xem tất cả <ArrowRight size={15} />
                  </Link>
                </div>
                <div className="account-order-list">
                  {demoOrders.slice(0, 2).map((order) => (
                    <Link
                      className="account-order-card"
                      to={`/orders/${order.id}`}
                      key={order.id}
                    >
                      <span className="account-order-icon">
                        <Package />
                      </span>
                      <span>
                        <strong>{order.id}</strong>
                        <small>
                          {order.date} · {order.items.length} sản phẩm
                        </small>
                      </span>
                      <span
                        className={`order-status ${order.status === 'Đang giao' ? 'in-progress' : 'complete'}`}
                      >
                        <i />
                        {order.status}
                      </span>
                      <strong>{formatVnd(order.total)}</strong>
                      <ChevronRight size={15} />
                    </Link>
                  ))}
                </div>
                <Link
                  className="button-secondary account-see-orders"
                  to="/orders"
                >
                  Lịch sử đơn hàng <ArrowRight size={15} />
                </Link>
              </div>
            ) : null}
            {section === 'security' ? (
              <div className="account-panel">
                <div className="account-panel-title">
                  <div>
                    <span className="section-eyebrow">AN TOÀN TÀI KHOẢN</span>
                    <h2>Bảo mật & đăng nhập</h2>
                    <p>Giữ tài khoản của bạn an toàn và riêng tư.</p>
                  </div>
                  <span className="security-shield">
                    <ShieldCheck />
                  </span>
                </div>
                <div className="security-status">
                  <span>
                    <BadgeCheck />
                  </span>
                  <div>
                    <strong>Tài khoản đang hoạt động</strong>
                    <small>
                      Email đã xác nhận · Phiên đăng nhập được bảo vệ
                    </small>
                  </div>
                  <span className="active-pill">ĐANG HOẠT ĐỘNG</span>
                </div>
                <div className="account-password-section">
                  <div className="account-subheading">
                    <LockKeyhole />
                    <div>
                      <h3>Đổi mật khẩu</h3>
                      <p>Mật khẩu mạnh giúp bảo vệ thông tin của bạn.</p>
                    </div>
                  </div>
                  {changePasswordMutation.error ? (
                    <Notice>
                      {errorMessage(
                        changePasswordMutation.error,
                        'Không thể đổi mật khẩu. Vui lòng thử lại.',
                      )}
                    </Notice>
                  ) : null}
                  <form
                    className="account-password-form"
                    onSubmit={handleSubmit(submitPassword)}
                  >
                    <PasswordField
                      label="Mật khẩu hiện tại"
                      autoComplete="current-password"
                      {...register('currentPassword', {
                        required: 'Nhập mật khẩu hiện tại.',
                      })}
                      error={
                        errors.currentPassword?.message ??
                        fieldError(
                          changePasswordMutation.error,
                          'currentPassword',
                        )
                      }
                    />
                    <div className="password-row">
                      <PasswordField
                        label="Mật khẩu mới"
                        autoComplete="new-password"
                        {...register('newPassword', {
                          required: 'Nhập mật khẩu mới.',
                          minLength: {
                            value: 6,
                            message: 'Mật khẩu cần ít nhất 6 ký tự.',
                          },
                        })}
                        error={
                          errors.newPassword?.message ??
                          fieldError(
                            changePasswordMutation.error,
                            'newPassword',
                          )
                        }
                      />
                      <PasswordField
                        label="Xác nhận mật khẩu mới"
                        autoComplete="new-password"
                        {...register('confirmPassword', {
                          required: 'Xác nhận mật khẩu mới.',
                          validate: (value, values) =>
                            value === values.newPassword ||
                            'Mật khẩu xác nhận không khớp.',
                        })}
                        error={
                          errors.confirmPassword?.message ??
                          fieldError(
                            changePasswordMutation.error,
                            'confirmPassword',
                          )
                        }
                      />
                    </div>
                    <div className="password-form-footer">
                      <span>
                        Bạn sẽ cần đăng nhập lại sau khi đổi mật khẩu.
                      </span>
                      <Button
                        className="primary-button"
                        type="submit"
                        disabled={changePasswordMutation.isPending}
                      >
                        {changePasswordMutation.isPending
                          ? 'Đang cập nhật...'
                          : 'Cập nhật mật khẩu'}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </StoreFrame>
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
