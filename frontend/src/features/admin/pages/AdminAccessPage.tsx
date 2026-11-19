import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, LoaderCircle, ShieldCheck } from 'lucide-react';
import { checkAdminAccess } from '../../auth/services/password-reset-api';
import { storedAccessToken } from '../../auth/services/auth-api';
import { useAuth } from '../../auth/hooks/useAuth';
import { AdminDashboardPage } from './AdminDashboardPage.js';

export default function AdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const accessQuery = useQuery({
    queryKey: ['auth', 'admin-access'],
    queryFn: async () => {
      const token = storedAccessToken();
      if (!token)
        throw new Error('Your session has expired. Please sign in again.');
      return checkAdminAccess(token);
    },
    enabled: isAdmin,
    retry: false,
  });

  if (!isAdmin) {
    return (
      <div className="admin-denied">
        <ShieldCheck />
        <span>ACCESS CHECK</span>
        <h1>Access denied</h1>
        <p>Your account does not have the ADMIN role.</p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`admin-auth-check${accessQuery.isSuccess ? ' success' : accessQuery.isError ? ' error' : ''}`}
      >
        {accessQuery.isPending ? (
          <LoaderCircle className="animate-spin" size={17} />
        ) : accessQuery.isSuccess ? (
          <BadgeCheck size={17} />
        ) : (
          <ShieldCheck size={17} />
        )}
        <span>
          {accessQuery.isSuccess
            ? 'Admin access verified'
            : accessQuery.isError
              ? accessQuery.error.message
              : 'Verifying admin access...'}
        </span>
      </div>
      <AdminDashboardPage />
    </>
  );
}
