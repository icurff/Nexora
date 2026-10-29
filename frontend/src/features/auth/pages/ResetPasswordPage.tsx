import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthHeading, AuthLayout } from '../../../layouts/AuthLayout';
import { FormField, PasswordField } from '../components/FormField';
import { Notice } from '../components/Notice';
import { usePasswordReset } from '../hooks/usePasswordReset';
import { Button } from '../../../components/ui/button';

type FormValues = {
  token: string;
  newPassword: string;
  confirmPassword: string;
};

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mutation = usePasswordReset();
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      token: params.get('token') ?? '',
      newPassword: '',
      confirmPassword: '',
    },
  });
  const tokenFromUrl = params.get('token');

  useEffect(() => {
    if (tokenFromUrl) setValue('token', tokenFromUrl);
  }, [tokenFromUrl, setValue]);

  async function submit(values: FormValues) {
    try {
      await mutation.mutateAsync({ ...values, token: values.token.trim() });
      navigate('/login?passwordReset=1', { replace: true });
    } catch {
      // The API error is shown below.
    }
  }

  return (
    <AuthLayout compact>
      <section className="auth-card recovery-card" aria-labelledby="auth-title">
        <div className="card-icon">
          <KeyRound />
        </div>
        <AuthHeading
          eyebrow="BẢO MẬT TÀI KHOẢN"
          title="Đặt mật khẩu mới"
          description="Tạo mật khẩu mới để tiếp tục sử dụng tài khoản Nexora. Liên kết đặt lại chỉ dùng được một lần."
        />
        {mutation.error ? <Notice>{mutation.error.message}</Notice> : null}
        <form className="auth-form" onSubmit={handleSubmit(submit)}>
          {!tokenFromUrl ? (
            <FormField
              label="Mã đặt lại"
              autoComplete="one-time-code"
              placeholder="Dán mã trong email của bạn"
              {...register('token', {
                required: 'Mã đặt lại là bắt buộc.',
              })}
              error={errors.token?.message}
            />
          ) : null}
          <PasswordField
            label="Mật khẩu mới"
            autoComplete="new-password"
            placeholder="Tối thiểu 6 ký tự"
            {...register('newPassword', {
              required: 'Nhập mật khẩu mới.',
              minLength: {
                value: 6,
                message: 'Mật khẩu cần ít nhất 6 ký tự.',
              },
            })}
            error={errors.newPassword?.message}
            hint="Ít nhất 6 ký tự."
          />
          <PasswordField
            label="Xác nhận mật khẩu mới"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            {...register('confirmPassword', {
              required: 'Xác nhận mật khẩu mới.',
              minLength: {
                value: 6,
                message: 'Mật khẩu cần ít nhất 6 ký tự.',
              },
              validate: (value) =>
                value === getValues('newPassword') ||
                'Mật khẩu xác nhận không khớp.',
            })}
            error={errors.confirmPassword?.message}
          />
          <Button
            className="primary-button"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" /> Đang cập nhật...
              </>
            ) : (
              <>
                Đặt lại mật khẩu <ArrowRight />{' '}
              </>
            )}
          </Button>
        </form>
        <div className="form-switch">
          <Link to="/forgot-password">Yêu cầu liên kết mới</Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> Sau khi đặt lại, bạn sẽ cần đăng nhập lại
        </div>
      </section>
    </AuthLayout>
  );
}
