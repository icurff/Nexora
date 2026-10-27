import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/auth/AuthShell';
import { PasswordField } from '../components/auth/FormField';
import {
  ShieldIcon,
  ArrowIcon,
  LogoutIcon,
} from '../components/auth/AuthIcons';
import { Notice } from '../components/auth/Notice';
import { ApiError, errorMessage, fieldError } from '../lib/api/auth-api';
import { useAuth } from '../lib/auth/auth-context';

export default function AccountPage() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [logoutError, setLogoutError] = useState('');

  if (!user) return <Navigate to="/login" replace />;

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (new TextEncoder().encode(form.newPassword).length > 72) {
      setError(
        new ApiError(400, {
          message: 'Mật khẩu không được dài quá 72 byte UTF-8.',
        }),
      );
      return;
    }
    setBusy(true);
    try {
      await changePassword(form);
      navigate('/login?passwordChanged=1', { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      navigate('/login?loggedOut=1', { replace: true });
    } catch {
      setLogoutError('Chưa thể kết nối để thu hồi phiên. Vui lòng thử lại.');
      setLoggingOut(false);
    }
  }

  return (
    <AuthShell>
      <section className="account-card">
        <div className="account-topline">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              TÀI KHOẢN CỦA BẠN
            </span>
            <h1>Xin chào, {user.fullName}</h1>
            <p>Quản lý phiên đăng nhập và bảo mật tài khoản.</p>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => void signOut()}
            disabled={loggingOut}
          >
            {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'} <LogoutIcon />
          </button>
        </div>
        {logoutError ? <Notice>{logoutError}</Notice> : null}
        <div className="account-profile">
          <div className="avatar">{initials(user.fullName)}</div>
          <div className="profile-info">
            <strong>{user.fullName}</strong>
            <span>{user.email}</span>
          </div>
          <span className="role-badge">
            {user.role === 'ADMIN' ? 'Quản trị viên' : 'Customer'}
          </span>
        </div>
        <div className="account-divider" />
        <div className="password-section">
          <div className="section-heading">
            <div className="section-icon">
              <ShieldIcon />
            </div>
            <div>
              <h2>Đổi mật khẩu</h2>
              <p>Đặt mật khẩu mạnh để bảo vệ tài khoản của bạn.</p>
            </div>
          </div>
          {error ? (
            <Notice>
              {errorMessage(error, 'Không thể đổi mật khẩu. Vui lòng thử lại.')}
            </Notice>
          ) : null}
          <form className="auth-form password-form" onSubmit={submitPassword}>
            <PasswordField
              label="Mật khẩu hiện tại"
              name="currentPassword"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu hiện tại"
              value={form.currentPassword}
              onChange={(event) =>
                update('currentPassword', event.target.value)
              }
              required
              error={fieldError(error, 'currentPassword')}
            />
            <div className="password-row">
              <PasswordField
                label="Mật khẩu mới"
                name="newPassword"
                autoComplete="new-password"
                placeholder="Ít nhất 8 ký tự"
                value={form.newPassword}
                onChange={(event) => update('newPassword', event.target.value)}
                required
                minLength={8}
                error={fieldError(error, 'newPassword')}
              />
              <PasswordField
                label="Xác nhận mật khẩu mới"
                name="confirmPassword"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                value={form.confirmPassword}
                onChange={(event) =>
                  update('confirmPassword', event.target.value)
                }
                required
                minLength={8}
                error={fieldError(error, 'confirmPassword')}
              />
            </div>
            <div className="form-actions">
              <p>Sau khi đổi, bạn sẽ cần đăng nhập lại trên thiết bị này.</p>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" />
                    Đang cập nhật...
                  </>
                ) : (
                  <>
                    Cập nhật mật khẩu <ArrowIcon />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>
    </AuthShell>
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
