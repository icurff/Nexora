import { Recommendations } from '../components/Recommendations';
import {
  ArrowRight,
  BadgeCheck,
  PackageCheck,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { CategoryImage } from '../components/CategoryImage.js';
import {
  SectionHeading,
  CatalogProductGrid,
} from '../components/catalog-components.js';
import {
  formatVnd,
  getPublicCategories,
  getPublicProducts,
} from '../services/public-catalog-api.js';

export function HomePage() {
  const products = useQuery({
    queryKey: ['public-products', 1],
    queryFn: () => getPublicProducts(1),
    retry: false,
  });
  const items = products.data?.items ?? [];
  const featured = items.slice(0, 4);
  const artwork = items.filter((item) =>
    item.image?.contentType.startsWith('image/'),
  );
  const categoryQuery = useQuery({
    queryKey: ['public-categories'],
    queryFn: getPublicCategories,
    retry: false,
  });
  const rootCategories = (categoryQuery.data ?? []).filter(
    (category) => !category.parentId,
  );
  const categories = [...rootCategories]
    .sort(
      (a, b) =>
        Number(a.name.toLowerCase() === 'other') -
        Number(b.name.toLowerCase() === 'other'),
    )
    .slice(0, 4);
  const categoryPreviews = useQueries({
    queries: categories.map((category) => ({
      queryKey: ['category-preview', category.id],
      queryFn: () => getPublicProducts(1, undefined, category.id, 8),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const grid = (productsToShow: typeof items) =>
    products.isPending ? (
      <div className="empty-state" role="status">
        Loading products...
      </div>
    ) : products.isError ? (
      <div className="empty-state" role="alert">
        <h3>Unable to load products</h3>
        <button
          className="button-primary"
          onClick={() => void products.refetch()}
        >
          Try again
        </button>
      </div>
    ) : (
      <CatalogProductGrid products={productsToShow} />
    );
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
              Discover useful, beautiful products selected for your everyday
              life.
            </p>
            <div className="hero-actions">
              <Link className="button-primary" to="/products">
                Explore the collection <ArrowRight size={17} />
              </Link>
              <Link className="button-secondary" to="/categories">
                Browse categories
              </Link>
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
              {artwork[0]?.image ? (
                <img src={artwork[0].image.url} alt={artwork[0].name} />
              ) : null}
            </div>
            <div className="hero-art-card hero-art-card-front">
              {artwork[1]?.image ? (
                <img src={artwork[1].image.url} alt={artwork[1].name} />
              ) : null}
              {artwork[1] ? (
                <div>
                  <span>FAVORITE</span>
                  <strong>{artwork[1].name}</strong>
                  {artwork[1].priceVnd !== null ? (
                    <small>{formatVnd(artwork[1].priceVnd)}</small>
                  ) : null}
                </div>
              ) : null}
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
        <Recommendations surface="home" />
        <section className="home-section" id="shop-categories">
          <SectionHeading
            eyebrow="SHOP BY CATEGORY"
            title="Find what you need"
            description="Explore collections selected for you."
            link="/categories"
            linkText="All categories"
          />
          {categoryQuery.isPending ? (
            <p role="status">Loading categories…</p>
          ) : null}
          {categoryQuery.isError ? (
            <p role="alert">
              Unable to load categories.{' '}
              <button
                className="button-secondary"
                onClick={() => void categoryQuery.refetch()}
              >
                Try again
              </button>
            </p>
          ) : null}
          {categoryQuery.isSuccess && !categories.length ? (
            <p>No categories available.</p>
          ) : null}
          <div className="home-category-grid">
            {categories.map((category, index) => (
              <Link
                to={`/categories/${category.id}`}
                key={category.id}
                className="home-category-card"
              >
                <CategoryImage
                  url={
                    categoryPreviews[index]?.data?.items.find((product) =>
                      product.image?.contentType.startsWith('image/'),
                    )?.image?.url
                  }
                />
                <span className="home-category-name">{category.name}</span>
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="FAVORITES"
            title="Explore products"
            description="Discover products from our catalog."
            link="/products"
          />
          {grid(featured)}
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
            <Link className="button-secondary" to="/products">
              Explore products <ArrowRight size={16} />
            </Link>
          </div>
          {artwork[2]?.image ? (
            <img src={artwork[2].image.url} alt={artwork[2].name} />
          ) : null}
        </section>
        <section className="home-section">
          <SectionHeading
            eyebrow="NEW AT NEXORA"
            title="A little more inspiration"
            link="/products"
          />
          {grid(items.slice(4, 8))}
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
