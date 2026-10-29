import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, LoaderCircle, LogOut, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../layouts/AuthLayout';
import { PasswordField } from '../features/auth/components/FormField';
import { Notice } from '../features/auth/components/Notice';
import { errorMessage, fieldError } from '../features/auth/services/auth-api';
import { useAuth } from '../features/auth/hooks/useAuth';
import {
  useChangePassword,
  useLogout,
} from '../features/auth/hooks/useAuthMutations';
import { Button } from '../components/ui/button';

export default function AccountPage() {
  const { user } = useAuth();
  const changePasswordMutation = useChangePassword();
  const logoutMutation = useLogout();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }>();
  const error = changePasswordMutation.error;
  const [logoutError, setLogoutError] = useState('');

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
      /* The mutation error is rendered below. */
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

  return (
    <AuthLayout>
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
          <Button
            className="text-button"
            type="button"
            onClick={() => void signOut()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? 'Đang đăng xuất...' : 'Đăng xuất'}{' '}
            <LogOut />
          </Button>
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
              <ShieldCheck />
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
          <form
            className="auth-form password-form"
            onSubmit={handleSubmit(submitPassword)}
          >
            <PasswordField
              label="Mật khẩu hiện tại"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu hiện tại"
              {...register('currentPassword', {
                required: 'Nhập mật khẩu hiện tại.',
              })}
              error={
                errors.currentPassword?.message ??
                fieldError(error, 'currentPassword')
              }
            />
            <div className="password-row">
              <PasswordField
                label="Mật khẩu mới"
                autoComplete="new-password"
                placeholder="Ít nhất 6 ký tự"
                {...register('newPassword', {
                  required: 'Nhập mật khẩu mới.',
                  minLength: {
                    value: 6,
                    message: 'Mật khẩu cần ít nhất 6 ký tự.',
                  },
                })}
                error={
                  errors.newPassword?.message ??
                  fieldError(error, 'newPassword')
                }
              />
              <PasswordField
                label="Xác nhận mật khẩu mới"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                {...register('confirmPassword', {
                  required: 'Xác nhận mật khẩu mới.',
                  validate: (value, values) =>
                    value === values.newPassword ||
                    'Mật khẩu xác nhận không khớp.',
                })}
                error={
                  errors.confirmPassword?.message ??
                  fieldError(error, 'confirmPassword')
                }
              />
            </div>
            <div className="form-actions">
              <p>Sau khi đổi, bạn sẽ cần đăng nhập lại trên thiết bị này.</p>
              <Button
                className="primary-button"
                type="submit"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Đang cập nhật...
                  </>
                ) : (
                  <>
                    Cập nhật mật khẩu <ArrowRight />
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </section>
    </AuthLayout>
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
