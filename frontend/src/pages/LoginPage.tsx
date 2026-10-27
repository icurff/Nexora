import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthShell, AuthHeading } from '../components/auth/AuthShell';
import { FormField, PasswordField } from '../components/auth/FormField';
import { LockIcon, ArrowIcon, ShieldIcon } from '../components/auth/AuthIcons';
import { Notice } from '../components/auth/Notice';
import { errorMessage } from '../lib/api/auth-api';
import { useAuth } from '../lib/auth/auth-context';

export default function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const params = new URLSearchParams(location.search);
  const requestedPath = (
    location.state as { from?: { pathname?: string } } | null
  )?.from?.pathname;
  const destination =
    requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
      ? requestedPath
      : '/account';

  useEffect(() => {
    if (status === 'authenticated') navigate(destination, { replace: true });
  }, [status, navigate, destination]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(destination, { replace: true });
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell compact>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="card-icon">
          <LockIcon />
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
        {params.get('loggedOut') === '1' ? (
          <Notice tone="success">Bạn đã đăng xuất thành công.</Notice>
        ) : null}
        {error ? (
          <Notice>
            {errorMessage(error, 'Không thể đăng nhập. Vui lòng thử lại.')}
          </Notice>
        ) : null}
        <form className="auth-form" onSubmit={submit}>
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tenban@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            autoFocus
          />
          <PasswordField
            label="Mật khẩu"
            name="password"
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            className="primary-button"
            type="submit"
            disabled={busy || status === 'loading'}
          >
            {busy ? (
              <>
                <span className="spinner" />
                Đang đăng nhập...
              </>
            ) : (
              <>
                Đăng nhập <ArrowIcon />
              </>
            )}
          </button>
        </form>
        <div className="form-switch">
          Chưa có tài khoản? <Link to="/register">Tạo tài khoản</Link>
        </div>
        <div className="secure-note">
          <ShieldIcon /> Kết nối và thông tin tài khoản được bảo vệ
        </div>
      </section>
    </AuthShell>
  );
}
