import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthShell } from './components/auth/AuthShell';
import { AuthProvider } from './lib/auth/AuthProvider';
import { useAuth } from './lib/auth/auth-context';
import AccountPage from './pages/AccountPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import './App.css';

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <AuthShell compact>
        <div className="loading-card">
          <span className="spinner spinner-dark" />
          Đang kiểm tra phiên đăng nhập...
        </div>
      </AuthShell>
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
      <AuthShell compact>
        <div className="loading-card">
          <span className="spinner spinner-dark" />
          Đang kiểm tra phiên đăng nhập...
        </div>
      </AuthShell>
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
