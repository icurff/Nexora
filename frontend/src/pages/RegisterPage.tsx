import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ArrowRight,
  Check,
  LoaderCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthHeading } from '../layouts/AuthLayout';
import {
  FormField,
  PasswordField,
} from '../features/auth/components/FormField';
import { Notice } from '../features/auth/components/Notice';
import { errorMessage, fieldError } from '../features/auth/services/auth-api';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useRegister } from '../features/auth/hooks/useAuthMutations';
import { Button } from '../components/ui/button';

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
  const { status } = useAuth();
  const registerMutation = useRegister();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<RegisterForm>({ defaultValues: emptyForm });
  const error = registerMutation.error;
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') navigate('/account', { replace: true });
  }, [status, navigate]);

  async function submit(form: RegisterForm) {
    try {
      await registerMutation.mutateAsync({
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
      });
      setComplete(true);
    } catch {
      /* The mutation error is rendered below. */
    }
  }

  if (complete) {
    return (
      <AuthLayout compact>
        <section
          className="auth-card success-card"
          aria-labelledby="auth-title"
        >
          <div className="success-icon">
            <Check />
          </div>
          <AuthHeading
            eyebrow="HOÀN TẤT"
            title="Tài khoản đã sẵn sàng"
            description="Bạn có thể đăng nhập bằng email và mật khẩu vừa tạo."
          />
          <Button
            className="primary-button button-link"
            type="button"
            onClick={() => navigate('/login?registered=1')}
          >
            Đi đến đăng nhập <ArrowRight />
          </Button>
          <p className="secure-note">
            <ShieldCheck /> Tài khoản Customer được tạo an toàn
          </p>
        </section>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <section className="auth-card register-card" aria-labelledby="auth-title">
        <div className="card-icon">
          <UserRound />
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
        <form
          className="auth-form register-form"
          onSubmit={handleSubmit(submit)}
        >
          <FormField
            label="Họ và tên"
            autoComplete="name"
            placeholder="Nguyễn Minh Anh"
            {...register('fullName', { required: 'Nhập họ và tên.' })}
            maxLength={100}
            error={errors.fullName?.message ?? fieldError(error, 'fullName')}
          />
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
            error={errors.email?.message ?? fieldError(error, 'email')}
          />
          <PasswordField
            label="Mật khẩu"
            autoComplete="new-password"
            placeholder="Tối thiểu 6 ký tự"
            {...register('password', {
              required: 'Nhập mật khẩu.',
              minLength: { value: 6, message: 'Mật khẩu cần ít nhất 6 ký tự.' },
            })}
            hint="Ít nhất 6 ký tự."
            error={errors.password?.message ?? fieldError(error, 'password')}
          />
          <PasswordField
            label="Xác nhận mật khẩu"
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            {...register('confirmPassword', {
              required: 'Xác nhận mật khẩu.',
              validate: (value) =>
                value === getValues('password') ||
                'Mật khẩu xác nhận không khớp.',
            })}
            error={
              errors.confirmPassword?.message ??
              fieldError(error, 'confirmPassword')
            }
          />
          <Button
            className="primary-button"
            type="submit"
            disabled={registerMutation.isPending || status === 'loading'}
          >
            {registerMutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Đang tạo tài khoản...
              </>
            ) : (
              <>
                Tạo tài khoản <ArrowRight />
              </>
            )}
          </Button>
        </form>
        <div className="form-switch">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> Tài khoản mới được tạo với quyền Customer
        </div>
      </section>
    </AuthLayout>
  );
}
