import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { AuthLayout } from './layouts/AuthLayout';
import { AuthProvider } from './context/AuthProvider';
import { useAuth } from './features/auth/hooks/useAuth';
import AccountPage from './pages/AccountPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import './App.css';

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <AuthLayout compact>
        <div className="loading-card">
          <LoaderCircle className="animate-spin" />
          Đang kiểm tra phiên đăng nhập...
        </div>
      </AuthLayout>
    );
  }
  if (status !== 'authenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: { pathname: location.pathname } }}
      />
    );
  }
  return <Outlet />;
}

function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <AuthLayout compact>
        <div className="loading-card">
          <LoaderCircle className="animate-spin" />
          Đang kiểm tra phiên đăng nhập...
        </div>
      </AuthLayout>
    );
  }
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/account" element={<AccountPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
