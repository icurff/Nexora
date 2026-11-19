import {
  ArrowRight,
  BadgeCheck,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoCategories, demoProducts } from '../../catalog/demo-data.js';
import {
  SectionHeading,
  ProductGrid,
} from '../components/catalog-components.js';

export function HomePage() {
  const featured = demoProducts.slice(0, 4);
  return (
    <>
      <section className="home-hero">
        <div className="page-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">
              <span />
              THE NEW COLLECTION
            </span>
            <h1>
              Little things,
              <br />
              <em>everyday joy.</em>
            </h1>
            <p>
              Discover useful, beautiful products selected for your everyday life.
            </p>
            <div className="hero-actions">
              <Link className="button-primary" to="/products">
                Explore the collection <ArrowRight size={17} />
              </Link>
              <Link className="button-secondary" to="/categories">
                Browse categories
              </Link>
            </div>
            <div className="hero-proof">
              <div className="proof-avatars">
                <span>N</span>
                <span>A</span>
                <span>M</span>
              </div>
              <span>
                <strong>4.9/5</strong> from over 1,200 customers
              </span>
            </div>
          </div>
          <div className="hero-art">
            <div className="hero-art-glow" />
            <div className="hero-art-card hero-art-card-back">
              <span>
                DAILY
                <br />
                ESSENTIALS
              </span>
              <img src="/demo-products/lamp.svg" alt="Aurora table lamp" />
            </div>
            <div className="hero-art-card hero-art-card-front">
              <img
                src="/demo-products/tote.svg"
                alt="Everyday canvas tote"
              />
              <div>
                <span>FAVORITE</span>
                <strong>Canvas tote</strong>
                <small>189.000 ₫</small>
              </div>
            </div>
            <div className="hero-art-sticker">
              NEXORA
              <br />
              <span>SELECTED</span>
            </div>
            <span className="hero-art-orbit orbit-one" />
            <span className="hero-art-orbit orbit-two" />
          </div>
        </div>
      </section>
      <div className="page-container home-content">
        <section className="trust-strip">
          <div>
            <Truck />
            <span>
              <strong>Fast delivery</strong>
              <small>Nationwide in 2–4 days</small>
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Secure checkout</strong>
              <small>Multiple payment options</small>
            </span>
          </div>
          <div>
            <PackageCheck />
            <span>
              <strong>Easy returns</strong>
              <small>Within 7 days</small>
            </span>
          </div>
          <div>
            <BadgeCheck />
            <span>
              <strong>Selected for quality</strong>
              <small>Shop with confidence</small>
            </span>
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="SHOP BY CATEGORY"
            title="Find what you need"
            description="Explore collections selected for you."
            link="/categories"
            linkText="All categories"
          />
          <div className="category-grid">
            {demoCategories.map((category, index) => (
              <Link
                to={`/categories/${category.id}`}
                key={category.id}
                className={`category-card category-${category.color}`}
              >
                <span className="category-number">0{index + 1}</span>
                <div className="category-icon">{category.icon}</div>
                <div>
                  <h3>{category.name}</h3>
                  <p>{category.description}</p>
                </div>
                <ArrowRight className="category-arrow" />
              </Link>
            ))}
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="FAVORITES"
            title="Popular picks"
            description="Featured products this week."
            link="/products?sort=popular"
          />
          <ProductGrid products={featured} />
        </section>
        <section className="editorial-banner">
          <div>
            <span className="section-eyebrow">NEXORA NOTES · 01</span>
            <h2>
              Your space
              <br />
              deserves thoughtful touches.
            </h2>
            <p>Discover pieces that make your space more inviting.</p>
            <Link className="button-secondary" to="/categories/home">
              Explore home goods <ArrowRight size={16} />
            </Link>
          </div>
          <img
            src="/demo-products/lamp.svg"
            alt="Aurora lamp in a cozy setting"
          />
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="NEW AT NEXORA"
            title="A little more inspiration"
            link="/products"
          />
          <ProductGrid products={demoProducts.slice(4)} />
        </section>
        <section className="newsletter">
          <div>
            <span className="section-eyebrow">NOTES FROM NEXORA</span>
            <h2>Good things, delivered to your inbox.</h2>
            <p>Discover new collections and offers.</p>
          </div>
          <form onSubmit={(event) => event.preventDefault()}>
            <input
              type="email"
              placeholder="Your email address"
              aria-label="Newsletter email address"
            />
            <button type="submit">
              Subscribe <ArrowRight size={16} />
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
