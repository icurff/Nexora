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
          eyebrow="ACCOUNT RECOVERY"
          title="Forgot password?"
          description="Enter your registered email. If it matches an account, you will receive a password reset link."
        />
        {submittedEmail ? (
          <div className="recovery-success">
            <Notice tone="success">
              If the email matches an account, you will receive a password reset
              link.
            </Notice>
            <p>
              Check the inbox and spam folder for <strong>{submittedEmail}</strong>.
            </p>
            <Button asChild className="primary-button button-link">
              <Link to="/login">
                <ArrowLeft /> Back to sign in
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
                  required: 'Enter your email.',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address.',
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
                    <LoaderCircle className="animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    Send reset link <Mail />
                  </>
                )}
              </Button>
            </form>
          </>
        )}
        <div className="form-switch">
          <Link to="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </div>
        <div className="secure-note">
          <ShieldCheck /> The link can be used once and expires after 30 minutes
        </div>
      </section>
    </AuthLayout>
  );
}
