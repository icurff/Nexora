import { useEffect } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../../../layouts/AuthLayout';
import { useAuth } from '../hooks/useAuth';

function safeReturnTo(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  )
    return '/account';
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin
      ? `${url.pathname}${url.search}${url.hash}`
      : '/account';
  } catch {
    return '/account';
  }
}

export default function GoogleCallbackPage() {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get('returnTo'),
  );

  useEffect(() => {
    if (status === 'authenticated') {
      navigate(returnTo, { replace: true });
    } else if (status === 'unauthenticated') {
      navigate('/login?googleError=1', { replace: true });
    }
  }, [navigate, returnTo, status]);

  return (
    <AuthLayout compact>
      <div className="loading-card" role="status" aria-live="polite">
        <LoaderCircle className="animate-spin" />
        Đang hoàn tất đăng nhập Google...
      </div>
    </AuthLayout>
  );
}
