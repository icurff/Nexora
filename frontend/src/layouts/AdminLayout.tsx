import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings2,
  ShoppingBag,
  Star,
  Store,
  Tags,
  TicketPercent,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useLogout } from '../features/auth/hooks/useAuthMutations';
import { BrandLogo } from '../components/BrandLogo';

const links = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Sản phẩm', icon: Package },
  { to: '/admin/categories', label: 'Danh mục', icon: Tags },
  { to: '/admin/coupons', label: 'Mã giảm giá', icon: TicketPercent },
  { to: '/admin/orders', label: 'Đơn hàng', icon: ShoppingBag },
  { to: '/admin/reviews', label: 'Đánh giá', icon: Star },
  { to: '/admin/users', label: 'Người dùng', icon: Users },
  { to: '/admin/notifications', label: 'Thông báo', icon: Bell },
  { to: '/admin/settings', label: 'Cấu hình cửa hàng', icon: Settings2 },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const logout = useLogout();
  const location = useLocation();
  const current =
    links.find((item) => item.to === location.pathname) ??
    links.find(
      (item) => item.to !== '/admin' && location.pathname.startsWith(item.to),
    ) ??
    links[0];
  if (user?.role !== 'ADMIN')
    return (
      <main className="admin-denied">
        <span>KIỂM TRA PHÂN QUYỀN</span>
        <h1>Không có quyền truy cập</h1>
        <p>Tài khoản hiện tại không có role ADMIN.</p>
        <Link to="/account">Về tài khoản</Link>
      </main>
    );
  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <button
          className="admin-menu-toggle"
          aria-label="Mở menu"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <NavLink to="/admin" className="admin-brand">
          <BrandLogo className="admin-brand-logo" />
          <i>ADMIN</i>
        </NavLink>
        <div className="admin-topbar-title">
          <span>Không gian quản trị</span>
          <ChevronRight size={14} />
          <strong>{current.label}</strong>
        </div>
        <div className="admin-topbar-actions">
          <span className="admin-online-dot" />
          <span className="admin-operator">{user?.fullName ?? 'Minh Anh'}</span>
          <span className="admin-avatar">
            {(user?.fullName ?? 'MA')
              .split(' ')
              .slice(-2)
              .map((x) => x[0])
              .join('')}
          </span>
          <button
            className="admin-logout"
            title="Đăng xuất"
            onClick={() => void logout.mutateAsync()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="admin-frame">
        <aside className={`admin-sidebar${open ? ' is-open' : ''}`}>
          <div className="admin-side-label">MENU CHÍNH</div>
          <nav>
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                end={end}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `admin-nav-link${isActive ? ' active' : ''}`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
                {to === '/admin/orders' ? (
                  <i className="admin-nav-count">3</i>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <div className="admin-sidebar-bottom">
            <div className="help-card">
              <span className="help-card-icon">
                <CircleHelp size={17} />
              </span>
              <strong>Cần trợ giúp?</strong>
              <p>Xem hướng dẫn sử dụng trang quản trị.</p>
              <button
                onClick={() =>
                  window.alert('Hướng dẫn quản trị trong bản demo.')
                }
              >
                Xem hướng dẫn <ChevronRight size={14} />
              </button>
            </div>
            <NavLink to="/" className="back-store-link">
              <Store size={17} /> Về cửa hàng
            </NavLink>
            <div className="admin-version">
              NEXORA ADMIN <span>v1.0.0</span>
            </div>
          </div>
        </aside>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
