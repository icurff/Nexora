import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
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
  PolicyPage,
  ProductDetailPage,
  ProductsPage,
  SearchPage,
  WishlistPage,
} from './pages/CommercePages';
import { AdminLayout } from './layouts/AdminLayout';
import { StoreLayout } from './layouts/StoreLayout';
import { AdminManagementPage } from './pages/AdminPages';
import { AdminCategoriesPage } from './features/catalog/pages/AdminCategoriesPage.js';
import { AdminProductsPage } from './features/catalog/pages/AdminProductsPage.js';
import { AdminInventoryPage } from './features/catalog/pages/AdminInventoryPage.js';
import { AdminOrdersPage } from './features/admin/pages/AdminOrdersPage.js';
import { AdminCustomersPage } from './features/admin/pages/AdminCustomersPage.js';
import GoogleCallbackPage from './features/auth/pages/GoogleCallbackPage.js';
import './App.css';
import './Store.css';
import './Brand.css';

function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, search, hash]);
  return null;
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <AuthLayout compact>
        <div className="loading-card">
          <LoaderCircle className="animate-spin" />
          Checking your session...
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
          Checking your session...
        </div>
      </AuthLayout>
    );
  }
  return <Outlet />;
}

function LegacyOrderRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/account/orders/${id}` : '/account/orders'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
            <Route path="/orders" element={<LegacyOrderRedirect />} />
            <Route path="/orders/:id" element={<LegacyOrderRedirect />} />
            <Route path="/policies/:slug" element={<PolicyPage />} />
          </Route>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/auth/google/callback"
            element={<GoogleCallbackPage />}
          />
          <Route element={<RequireAuth />}>
            <Route element={<StoreLayout />}>
              <Route path="/account" element={<AccountPage />} />
              <Route path="/account/orders" element={<AccountPage />} />
              <Route path="/account/orders/:id" element={<AccountPage />} />
            </Route>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/products" element={<AdminProductsPage />} />
              <Route
                path="/admin/products/:id"
                element={<AdminProductsPage />}
              />
              <Route
                path="/admin/products/:id/edit"
                element={<AdminProductsPage />}
              />
              <Route path="/admin/inventory" element={<AdminInventoryPage />} />
              <Route
                path="/admin/categories"
                element={<AdminCategoriesPage />}
              />
              <Route
                path="/admin/coupons"
                element={<Navigate to="/admin" replace />}
              />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:id" element={<AdminOrdersPage />} />
              <Route
                path="/admin/reviews"
                element={<AdminManagementPage kind="reviews" />}
              />
              <Route path="/admin/users" element={<AdminCustomersPage />} />
              <Route path="/admin/users/:id" element={<AdminCustomersPage />} />
              <Route
                path="/admin/settings"
                element={<Navigate to="/admin" replace />}
              />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
