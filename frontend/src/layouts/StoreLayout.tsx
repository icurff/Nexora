import { useState } from 'react';
import {
  Heart,
  Menu,
  Search,
  ShoppingCart,
  UserRound,
  X,
} from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useDemoCommerceStore } from '../context/demo-commerce-store';
import type { ReactNode } from 'react';
import { BrandLogo } from '../components/BrandLogo';

export function StoreHeader() {
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const cartCount = useDemoCommerceStore((state) =>
    state.cart.reduce((sum, item) => sum + item.quantity, 0),
  );
  const wishlistCount = useDemoCommerceStore((state) => state.wishlist.length);
  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    navigate(`/search?q=${encodeURIComponent(search.trim())}`);
    setMobileOpen(false);
  }
  return (
    <>
      <header className="store-header">
        <div className="store-header-inner">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
          <Link to="/" className="store-brand">
            <BrandLogo />
          </Link>
          <nav className="store-nav">
            <Link to="/products">Sản phẩm</Link>
            <Link to="/categories">Danh mục</Link>
            <Link to="/products?sort=popular">Bán chạy</Link>
          </nav>
          <form className="store-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              aria-label="Tìm sản phẩm"
              placeholder="Bạn đang tìm gì?"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="store-actions">
            <Link
              className="icon-button wishlist-action"
              to="/wishlist"
              aria-label={`Yêu thích, ${wishlistCount} sản phẩm`}
            >
              <Heart />
              <span className="action-count">{wishlistCount}</span>
            </Link>
            <Link
              className="icon-button"
              to="/cart"
              aria-label={`Giỏ hàng, ${cartCount} sản phẩm`}
            >
              <ShoppingCart />
              {cartCount ? (
                <span className="action-count">{cartCount}</span>
              ) : null}
            </Link>
            <Link className="account-action" to="/account">
              <UserRound />
              <span>Tài khoản</span>
            </Link>
          </div>
        </div>
        {mobileOpen ? (
          <div className="mobile-menu-panel">
            <form className="store-search" onSubmit={submitSearch}>
              <Search size={17} />
              <input
                aria-label="Tìm sản phẩm"
                placeholder="Bạn đang tìm gì?"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>
            <Link to="/products" onClick={() => setMobileOpen(false)}>
              Sản phẩm
            </Link>
            <Link to="/categories" onClick={() => setMobileOpen(false)}>
              Danh mục
            </Link>
            <Link to="/wishlist" onClick={() => setMobileOpen(false)}>
              Danh sách yêu thích
            </Link>
            <Link to="/account" onClick={() => setMobileOpen(false)}>
              Tài khoản của tôi
            </Link>
          </div>
        ) : null}
      </header>
    </>
  );
}

function StoreFooter() {
  return (
    <footer className="store-footer">
      <div className="store-footer-main">
        <div>
          <Link to="/" className="store-brand">
            <BrandLogo />
          </Link>
          <p>Những lựa chọn tinh tế cho nhịp sống mỗi ngày.</p>
        </div>
        <div>
          <strong>Khám phá</strong>
          <Link to="/products">Sản phẩm</Link>
          <Link to="/categories">Danh mục</Link>
          <Link to="/orders">Đơn hàng</Link>
        </div>
        <div>
          <strong>Hỗ trợ</strong>
          <Link to="/policies/shipping">Giao hàng</Link>
          <Link to="/policies/returns">Đổi trả</Link>
          <Link to="/policies/privacy">Bảo mật</Link>
        </div>
        <div className="footer-contact">
          <strong>Luôn sẵn sàng hỗ trợ</strong>
          <p>Thứ 2 – Thứ 7 · 08:00 – 20:00</p>
          <a href="mailto:hello@nexora.vn">hello@nexora.vn</a>
        </div>
      </div>
      <div className="store-footer-bottom">
        <span>© 2026 Nexora. Giao diện demo.</span>
        <span>Thiết kế dành cho những điều bạn yêu thích.</span>
      </div>
    </footer>
  );
}

export function StoreLayout() {
  return (
    <StoreFrame>
      <Outlet />
    </StoreFrame>
  );
}

export function StoreFrame({ children }: { children: ReactNode }) {
  return (
    <div className="store-app">
      <StoreHeader />
      <main className="store-main">{children}</main>
      <StoreFooter />
    </div>
  );
}
