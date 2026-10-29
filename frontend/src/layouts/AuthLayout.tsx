import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandIcon } from '../features/auth/components/AuthIcons';

export function AuthLayout({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="auth-page">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Nexora, trang chủ">
          <span className="brand-mark">
            <BrandIcon />
          </span>
          <span>Nexora</span>
        </Link>
        <div className="header-note">Mua sắm dễ dàng, an tâm mỗi ngày</div>
        <a className="header-help" href="mailto:support@nexora.vn">
          Cần hỗ trợ?
        </a>
      </header>
      <main className={`auth-main${compact ? ' auth-main-compact' : ''}`}>
        <div className="auth-background-glow" aria-hidden="true" />
        <div className="auth-content">{children}</div>
      </main>
      <footer className="site-footer">
        <span>© 2026 Nexora</span>
        <span>An toàn thông tin tài khoản của bạn luôn được ưu tiên.</span>
      </footer>
    </div>
  );
}

export function AuthHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="auth-heading">
      <span className="eyebrow">
        <span className="eyebrow-dot" />
        {eyebrow}
      </span>
      <h1 id="auth-title">{title}</h1>
      <p>{description}</p>
    </div>
  );
}
