import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';

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
        <Link className="brand" to="/" aria-label="Nexora, home">
          <BrandLogo />
        </Link>
        <div className="header-note">Easy shopping, every day</div>
        <a className="header-help" href="mailto:support@nexora.vn">
          Need help?
        </a>
      </header>
      <main className={`auth-main${compact ? ' auth-main-compact' : ''}`}>
        <div className="auth-background-glow" aria-hidden="true" />
        <div className="auth-content">{children}</div>
      </main>
      <footer className="site-footer">
        <span>© 2026 Nexora</span>
        <span>Your account security is our priority.</span>
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
