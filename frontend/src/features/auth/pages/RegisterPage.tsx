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
import { AuthLayout, AuthHeading } from '../../../layouts/AuthLayout';
import { FormField, PasswordField } from '../components/FormField';
import { Notice } from '../components/Notice';
import { errorMessage, fieldError } from '../services/auth-api';
import { useAuth } from '../hooks/useAuth';
import { useRegister } from '../hooks/useAuthMutations';
import { Button } from '../../../components/ui/button';

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
    if (status === 'authenticated')
      navigate('/account', { replace: true });
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
            eyebrow="COMPLETE"
            title="Your account is ready"
            description="You can sign in with your new email and password."
          />
          <Button
            className="primary-button button-link"
            type="button"
            onClick={() => navigate('/login?registered=1')}
          >
            Go to sign in <ArrowRight />
          </Button>
          <p className="secure-note">
            <ShieldCheck /> Your customer account has been created securely
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
          eyebrow="GET STARTED WITH NEXORA"
          title="Create an account"
          description="Join Nexora to track orders and shop with ease."
        />
        {error ? (
          <Notice>
            {errorMessage(
              error,
              'Unable to create an account. Please check your details.',
            )}
          </Notice>
        ) : null}
        <form
          className="auth-form register-form"
          onSubmit={handleSubmit(submit)}
        >
          <FormField
            label="Full name"
            autoComplete="name"
            placeholder="Your full name"
            {...register('fullName', { required: 'Enter your full name.' })}
            maxLength={100}
            error={errors.fullName?.message ?? fieldError(error, 'fullName')}
          />
          <FormField
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="tenban@example.com"
            {...register('email', {
              required: 'Enter your email.',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Enter a valid email address.',
              },
            })}
            maxLength={254}
            error={errors.email?.message ?? fieldError(error, 'email')}
          />
          <PasswordField
            label="Password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            {...register('password', {
              required: 'Enter a password.',
              minLength: {
                value: 6,
                message: 'Password must be at least 6 characters.',
              },
            })}
            hint="At least 6 characters."
            error={errors.password?.message ?? fieldError(error, 'password')}
          />
          <PasswordField
            label="Confirm password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            {...register('confirmPassword', {
              required: 'Confirm your password.',
              validate: (value) =>
                value === getValues('password') ||
                'Passwords do not match.',
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
                Creating account...
              </>
            ) : (
              <>
                Create account <ArrowRight />
              </>
            )}
          </Button>
        </form>
        <div className="form-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> New accounts are created with customer access
        </div>
      </section>
    </AuthLayout>
  );
}
