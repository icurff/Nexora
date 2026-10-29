import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
  LoaderCircle,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthHeading } from '../../../layouts/AuthLayout';
import { FormField, PasswordField } from '../components/FormField';
import { Notice } from '../components/Notice';
import { errorMessage } from '../services/auth-api';
import { useAuth } from '../hooks/useAuth';
import { useLogin } from '../hooks/useAuthMutations';
import { Button } from '../../../components/ui/button';

export default function LoginPage() {
  const { status } = useAuth();
  const loginMutation = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string; password: string }>();
  const error = loginMutation.error;
  const params = new URLSearchParams(location.search);
  const requestedPath = (
    location.state as { from?: { pathname?: string } } | null
  )?.from?.pathname;
  const destination =
    requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
      ? requestedPath
      : '/account';

  useEffect(() => {
    if (status === 'authenticated')
      navigate(destination, { replace: true });
  }, [status, navigate, destination]);

  async function submit(values: { email: string; password: string }) {
    try {
      await loginMutation.mutateAsync(values);
      navigate(destination, { replace: true });
    } catch {
      /* The mutation error is rendered below. */
    }
  }

  return (
    <AuthLayout compact>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="card-icon">
          <LockKeyhole />
        </div>
        <AuthHeading
          eyebrow="CHÀO MỪNG TRỞ LẠI"
          title="Đăng nhập"
          description="Đăng nhập để tiếp tục mua sắm và quản lý tài khoản của bạn."
        />
        {params.get('registered') === '1' ? (
          <Notice tone="success">
            Tạo tài khoản thành công. Hãy đăng nhập để tiếp tục.
          </Notice>
        ) : null}
        {params.get('passwordChanged') === '1' ? (
          <Notice tone="success">
            Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.
          </Notice>
        ) : null}
        {params.get('passwordReset') === '1' ? (
          <Notice tone="success">
            Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.
          </Notice>
        ) : null}
        {params.get('loggedOut') === '1' ? (
          <Notice tone="success">Bạn đã đăng xuất thành công.</Notice>
        ) : null}
        {error ? (
          <Notice>
            {errorMessage(error, 'Không thể đăng nhập. Vui lòng thử lại.')}
          </Notice>
        ) : null}
        <form className="auth-form" onSubmit={handleSubmit(submit)}>
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="tenban@example.com"
            {...register('email', {
              required: 'Nhập email của bạn.',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Email chưa đúng định dạng.',
              },
            })}
            maxLength={254}
            autoFocus
            error={errors.email?.message}
          />
          <PasswordField
            label="Mật khẩu"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            {...register('password', {
              required: 'Nhập mật khẩu của bạn.',
            })}
            error={errors.password?.message}
          />
          <div className="forgot-password-link">
            <Link to="/forgot-password">Quên mật khẩu?</Link>
          </div>
          <Button
            className="primary-button"
            type="submit"
            disabled={loginMutation.isPending || status === 'loading'}
          >
            {loginMutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang đăng nhập...
              </>
            ) : (
              <>
                Đăng nhập <ArrowRight />
              </>
            )}
          </Button>
        </form>
        <div className="form-switch">
          Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> Kết nối và thông tin tài khoản được bảo vệ
        </div>
      </section>
    </AuthLayout>
  );
}
