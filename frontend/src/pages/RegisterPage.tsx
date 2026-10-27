import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell, AuthHeading } from '../components/auth/AuthShell';
import { FormField, PasswordField } from '../components/auth/FormField';
import {
  UserIcon,
  ArrowIcon,
  ShieldIcon,
  CheckIcon,
} from '../components/auth/AuthIcons';
import { Notice } from '../components/auth/Notice';
import { ApiError, errorMessage, fieldError } from '../lib/api/auth-api';
import { useAuth } from '../lib/auth/auth-context';

type RegisterForm = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};
const emptyForm: RegisterForm = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const { register, status } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') navigate('/account', { replace: true });
  }, [status, navigate]);

  function update(field: keyof RegisterForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (new TextEncoder().encode(form.password).length > 72) {
      setError(
        new ApiError(400, {
          message: 'Mật khẩu không được dài quá 72 byte UTF-8.',
        }),
      );
      return;
    }
    setBusy(true);
    try {
      await register({
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
      });
      setComplete(true);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <AuthShell compact>
        <section
          className="auth-card success-card"
          aria-labelledby="auth-title"
        >
          <div className="success-icon">
            <CheckIcon />
          </div>
          <AuthHeading
            eyebrow="HOÀN TẤT"
            title="Tài khoản đã sẵn sàng"
            description="Bạn có thể đăng nhập bằng email và mật khẩu vừa tạo."
          />
          <button
            className="primary-button button-link"
            type="button"
            onClick={() => navigate('/login?registered=1')}
          >
            Đi đến đăng nhập <ArrowIcon />
          </button>
          <p className="secure-note">
            <ShieldIcon /> Tài khoản Customer được tạo an toàn
          </p>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <section className="auth-card register-card" aria-labelledby="auth-title">
        <div className="card-icon">
          <UserIcon />
        </div>
        <AuthHeading
          eyebrow="BẮT ĐẦU CÙNG NEXORA"
          title="Tạo tài khoản"
          description="Tham gia Nexora để theo dõi đơn hàng và mua sắm thuận tiện hơn."
        />
        {error ? (
          <Notice>
            {errorMessage(
              error,
              'Không thể tạo tài khoản. Vui lòng kiểm tra thông tin.',
            )}
          </Notice>
        ) : null}
        <form className="auth-form register-form" onSubmit={submit}>
          <FormField
            label="Họ và tên"
            name="fullName"
            autoComplete="name"
            placeholder="Nguyễn Minh Anh"
            value={form.fullName}
            onChange={(event) => update('fullName', event.target.value)}
            required
            maxLength={100}
            error={fieldError(error, 'fullName')}
          />
          <FormField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="tenban@example.com"
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            required
            maxLength={254}
            error={fieldError(error, 'email')}
          />
          <PasswordField
            label="Mật khẩu"
            name="password"
            autoComplete="new-password"
            placeholder="Tối thiểu 8 ký tự"
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            required
            minLength={8}
            hint="Ít nhất 8 ký tự; tối đa 72 byte UTF-8."
            error={fieldError(error, 'password')}
          />
          <PasswordField
            label="Xác nhận mật khẩu"
            name="confirmPassword"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            value={form.confirmPassword}
            onChange={(event) => update('confirmPassword', event.target.value)}
            required
            minLength={8}
            error={fieldError(error, 'confirmPassword')}
          />
          <button
            className="primary-button"
            type="submit"
            disabled={busy || status === 'loading'}
          >
            {busy ? (
              <>
                <span className="spinner" />
                Đang tạo tài khoản...
              </>
            ) : (
              <>
                Tạo tài khoản <ArrowIcon />
              </>
            )}
          </button>
        </form>
        <div className="form-switch">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
        <div className="secure-note">
          <ShieldIcon /> Tài khoản mới được tạo với quyền Customer
        </div>
      </section>
    </AuthShell>
  );
}
