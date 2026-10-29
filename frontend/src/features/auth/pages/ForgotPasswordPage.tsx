import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowLeft, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AuthHeading, AuthLayout } from '../../../layouts/AuthLayout';
import { FormField } from '../components/FormField';
import { Notice } from '../components/Notice';
import { usePasswordResetRequest } from '../hooks/usePasswordReset';
import { Button } from '../../../components/ui/button';

type FormValues = { email: string };

export default function ForgotPasswordPage() {
  const mutation = usePasswordResetRequest();
  const [submittedEmail, setSubmittedEmail] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>();

  async function submit({ email }: FormValues) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      await mutation.mutateAsync(normalizedEmail);
      setSubmittedEmail(normalizedEmail);
    } catch {
      // The API error is shown below.
    }
  }

  return (
    <AuthLayout compact>
      <section className="auth-card recovery-card" aria-labelledby="auth-title">
        <div className="card-icon">
          <Mail />
        </div>
        <AuthHeading
          eyebrow="KHÔI PHỤC TÀI KHOẢN"
          title="Quên mật khẩu?"
          description="Nhập email đã đăng ký. Nếu email phù hợp với tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu."
        />
        {submittedEmail ? (
          <div className="recovery-success">
            <Notice tone="success">
              Nếu email phù hợp với tài khoản, bạn sẽ nhận được liên kết đặt lại
              mật khẩu.
            </Notice>
            <p>
              Hãy kiểm tra hộp thư của <strong>{submittedEmail}</strong>, kể cả
              thư mục spam.
            </p>
            <Button asChild className="primary-button button-link">
              <Link to="/login">
                <ArrowLeft /> Quay lại đăng nhập
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {mutation.error ? <Notice>{mutation.error.message}</Notice> : null}
            <form className="auth-form" onSubmit={handleSubmit(submit)}>
              <FormField
                label="Email"
                type="email"
                autoComplete="email"
                placeholder="tenban@example.com"
                maxLength={254}
                autoFocus
                {...register('email', {
                  required: 'Nhập email của bạn.',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Email chưa đúng định dạng.',
                  },
                })}
                error={errors.email?.message}
              />
              <Button
                className="primary-button"
                type="submit"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <LoaderCircle className="animate-spin" /> Đang gửi...
                  </>
                ) : (
                  <>
                    Gửi liên kết đặt lại <Mail />
                  </>
                )}
              </Button>
            </form>
          </>
        )}
        <div className="form-switch">
          <Link to="/login">
            <ArrowLeft /> Trở về đăng nhập
          </Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> Liên kết chỉ sử dụng được một lần và hết hạn sau 30
          phút
        </div>
      </section>
    </AuthLayout>
  );
}
