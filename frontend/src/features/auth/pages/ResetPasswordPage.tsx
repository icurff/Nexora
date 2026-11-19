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
          eyebrow="ACCOUNT SECURITY"
          title="Set a new password"
          description="Create a new password to continue using your Nexora account. The reset link can only be used once."
        />
        {mutation.error ? <Notice>{mutation.error.message}</Notice> : null}
        <form className="auth-form" onSubmit={handleSubmit(submit)}>
          {!tokenFromUrl ? (
            <FormField
              label="Reset code"
              autoComplete="one-time-code"
              placeholder="Paste the code from your email"
              {...register('token', {
                required: 'Enter the reset code.',
              })}
              error={errors.token?.message}
            />
          ) : null}
          <PasswordField
            label="New password"
            autoComplete="new-password"
            placeholder="At least 6 characters"
            {...register('newPassword', {
              required: 'Enter a new password.',
              minLength: {
                value: 6,
                message: 'Password must be at least 6 characters.',
              },
            })}
            error={errors.newPassword?.message}
            hint="At least 6 characters."
          />
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            {...register('confirmPassword', {
              required: 'Confirm your new password.',
              minLength: {
                value: 6,
                message: 'Password must be at least 6 characters.',
              },
              validate: (value) =>
                value === getValues('newPassword') ||
                'Passwords do not match.',
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
                <LoaderCircle className="animate-spin" /> Updating...
              </>
            ) : (
              <>
                Reset password <ArrowRight />{' '}
              </>
            )}
          </Button>
        </form>
        <div className="form-switch">
          <Link to="/forgot-password">Request a new link</Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> You will need to sign in again after resetting
        </div>
      </section>
    </AuthLayout>
  );
}
