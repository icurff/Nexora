import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Boxes,
  ShoppingBag,
  Star,
  Store,
  Tags,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../features/auth/hooks/useAuth';
import { useLogout } from '../features/auth/hooks/useAuthMutations';
import { BrandLogo } from '../components/BrandLogo';

const links = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/admin/reviews', label: 'Reviews', icon: Star },
  { to: '/admin/users', label: 'Customers', icon: Users },
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
        <h1>Access denied</h1>
        <p>Your account does not have the ADMIN role.</p>
        <Link to="/account">Back to account</Link>
      </main>
    );
  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <button
          className="admin-menu-toggle"
          aria-label="Open menu"
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <NavLink to="/admin" className="admin-brand">
          <BrandLogo className="admin-brand-logo" />
          <i>ADMIN</i>
        </NavLink>
        <div className="admin-topbar-title">
          <span>Admin workspace</span>
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
            title="Sign out"
            onClick={() => void logout.mutateAsync()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="admin-frame">
        <aside className={`admin-sidebar${open ? ' is-open' : ''}`}>
          <div className="admin-side-label">MAIN MENU</div>
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
              </NavLink>
            ))}
          </nav>
          <div className="admin-sidebar-bottom">
            <NavLink to="/" className="back-store-link">
              <Store size={17} /> Back to store
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
