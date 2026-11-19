import { useState } from 'react';
import { Heart, Menu, Search, ShoppingCart, UserRound, X } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useWishlist } from '../features/wishlist/wishlist-api';
import type { ReactNode } from 'react';
import { BrandLogo } from '../components/BrandLogo';
import { useCart } from '../features/cart/hooks/useCart';
import { useAuth } from '../features/auth/hooks/useAuth';

export function StoreHeader() {
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const cartQuery = useCart();
  const cartCount = user
    ? (cartQuery.data?.items ?? []).reduce(
        (sum, item) => sum + item.quantity,
        0,
      )
    : 0;
  const wishlist = useWishlist();
  const wishlistCount = wishlist.data?.length ?? 0;
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
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
          <Link to="/" className="store-brand">
            <BrandLogo />
          </Link>
          <nav className="store-nav">
            <Link to="/products">Products</Link>
            <Link to="/categories">Categories</Link>
            <Link to="/products">Shop all</Link>
          </nav>
          <form className="store-search" onSubmit={submitSearch}>
            <Search size={17} />
            <input
              aria-label="Search products"
              placeholder="What are you looking for?"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </form>
          <div className="store-actions">
            <Link
              className="icon-button wishlist-action"
              to="/wishlist"
              aria-label={
                wishlist.data
                  ? `Wishlist, ${wishlistCount} products`
                  : 'Wishlist'
              }
            >
              <Heart />
              {wishlistCount > 0 ? (
                <span className="action-count">{wishlistCount}</span>
              ) : null}
            </Link>
            <Link
              className="icon-button"
              to="/cart"
              aria-label={`Cart, ${cartCount} products`}
            >
              <ShoppingCart />
              {cartCount ? (
                <span className="action-count">{cartCount}</span>
              ) : null}
            </Link>
            <Link className="account-action" to="/account">
              <UserRound />
              <span>Account</span>
            </Link>
          </div>
        </div>
        {mobileOpen ? (
          <div className="mobile-menu-panel">
            <form className="store-search" onSubmit={submitSearch}>
              <Search size={17} />
              <input
                aria-label="Search products"
                placeholder="What are you looking for?"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </form>
            <Link to="/products" onClick={() => setMobileOpen(false)}>
              Products
            </Link>
            <Link to="/categories" onClick={() => setMobileOpen(false)}>
              Categories
            </Link>
            <Link to="/wishlist" onClick={() => setMobileOpen(false)}>
              Wishlist
            </Link>
            <Link to="/account" onClick={() => setMobileOpen(false)}>
              My account
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
          <p>Thoughtful choices for everyday life.</p>
        </div>
        <div>
          <strong>Explore</strong>
          <Link to="/products">Products</Link>
          <Link to="/categories">Categories</Link>
          <Link to="/orders">Orders</Link>
        </div>
        <div>
          <strong>Support</strong>
          <Link to="/policies/shipping">Shipping</Link>
          <Link to="/policies/returns">Returns</Link>
          <Link to="/policies/privacy">Privacy</Link>
        </div>
        <div className="footer-contact">
          <strong>Here to help</strong>
          <p>Monday – Saturday · 08:00 – 20:00</p>
          <a href="mailto:hello@nexora.vn">hello@nexora.vn</a>
        </div>
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
