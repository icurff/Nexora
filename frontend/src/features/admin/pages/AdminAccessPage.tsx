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
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return checkAdminAccess(token);
    },
    enabled: isAdmin,
    retry: false,
  });

  if (!isAdmin) {
    return (
      <div className="admin-denied">
        <ShieldCheck />
        <span>KIỂM TRA PHÂN QUYỀN</span>
        <h1>Không có quyền truy cập</h1>
        <p>Tài khoản hiện tại không có role ADMIN.</p>
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
            ? 'Backend đã xác nhận quyền ADMIN'
            : accessQuery.isError
              ? accessQuery.error.message
              : 'Đang xác minh quyền với backend...'}
        </span>
      </div>
      <AdminDashboardPage />
    </>
  );
}
