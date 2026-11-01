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
import AdminPage from './pages/AdminPage';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/AuthPages';
import {
  CartPage,
  CategoriesPage,
  CategoryPage,
  CheckoutPage,
  HomePage,
  OrderDetailPage,
  OrdersPage,
  PaymentPage,
  PolicyPage,
  ProductDetailPage,
  ProductsPage,
  SearchPage,
  VerifyEmailPage,
  WishlistPage,
} from './pages/CommercePages';
import { AdminLayout } from './layouts/AdminLayout';
import { StoreLayout } from './layouts/StoreLayout';
import { AdminManagementPage } from './pages/AdminPages';
import { AdminCategoriesPage } from './features/catalog/pages/AdminCategoriesPage.js';
import { AdminProductsPage } from './features/catalog/pages/AdminProductsPage.js';
import './App.css';
import './Store.css';
import './Brand.css';

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
          <Route element={<StoreLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/categories/:id" element={<CategoryPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/wishlist" element={<WishlistPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/payment/mock" element={<PaymentPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/policies/:slug" element={<PolicyPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Route>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/account" element={<AccountPage />} />
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route
                path="/admin/products"
                element={<AdminProductsPage />}
              />
              <Route path="/admin/products/:id" element={<AdminProductsPage />} />
              <Route path="/admin/products/:id/edit" element={<AdminProductsPage />} />
              <Route
                path="/admin/categories"
                element={<AdminCategoriesPage />}
              />
              <Route
                path="/admin/coupons"
                element={<AdminManagementPage kind="coupons" />}
              />
              <Route
                path="/admin/orders"
                element={<AdminManagementPage kind="orders" />}
              />
              <Route
                path="/admin/reviews"
                element={<AdminManagementPage kind="reviews" />}
              />
              <Route
                path="/admin/users"
                element={<AdminManagementPage kind="users" />}
              />
              <Route
                path="/admin/notifications"
                element={<AdminManagementPage kind="notifications" />}
              />
              <Route
                path="/admin/settings"
                element={<AdminManagementPage kind="settings" />}
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
