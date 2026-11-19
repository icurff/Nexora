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
import { errorMessage, googleLoginUrl } from '../services/auth-api';
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
  const returnState = location.state;

  useEffect(() => {
    if (status === 'authenticated')
      navigate(destination, { replace: true, state: returnState });
  }, [status, navigate, destination, returnState]);

  async function submit(values: { email: string; password: string }) {
    try {
      await loginMutation.mutateAsync(values);
      navigate(destination, { replace: true, state: returnState });
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
          eyebrow="WELCOME BACK"
          title="Sign in"
          description="Sign in to continue shopping and manage your account."
        />
        {params.get('registered') === '1' ? (
          <Notice tone="success">
            Your account has been created. Sign in to continue.
          </Notice>
        ) : null}
        {params.get('passwordChanged') === '1' ? (
          <Notice tone="success">
            Your password has been updated. Please sign in again.
          </Notice>
        ) : null}
        {params.get('passwordReset') === '1' ? (
          <Notice tone="success">
            Your password has been reset. Please sign in again.
          </Notice>
        ) : null}
        {params.get('loggedOut') === '1' ? (
          <Notice tone="success">You have signed out.</Notice>
        ) : null}
        {params.get('googleError') === 'configuration' ? (
          <Notice>
            Google sign-in is not configured. Please check the system's
            OAuth configuration.
          </Notice>
        ) : null}
        {params.get('googleError') === '1' ? (
          <Notice>Unable to sign in with Google. Please try again.</Notice>
        ) : null}
        {error ? (
          <Notice>
            {errorMessage(error, 'Unable to sign in. Please try again.')}
          </Notice>
        ) : null}
        <form className="auth-form" onSubmit={handleSubmit(submit)}>
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
            autoFocus
            error={errors.email?.message}
          />
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Enter your password"
            {...register('password', {
              required: 'Enter your password.',
            })}
            error={errors.password?.message}
          />
          <div className="forgot-password-link">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <Button
            className="primary-button"
            type="submit"
            disabled={loginMutation.isPending || status === 'loading'}
          >
            {loginMutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                Sign in <ArrowRight />
              </>
            )}
          </Button>
        </form>
        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>
        <Button
          className="google-login-button"
          type="button"
          variant="outline"
          onClick={() => window.location.assign(googleLoginUrl(destination))}
          disabled={status === 'loading'}
        >
          <span className="google-login-mark" aria-hidden="true">
            G
          </span>
          Continue with Google
        </Button>
        <div className="form-switch">
          Don't have an account? <Link to="/register">Create an account</Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> Your connection and account details are protected
        </div>
      </section>
    </AuthLayout>
  );
}
