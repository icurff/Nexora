import { ArrowRight, Heart, Search, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoProducts, formatVnd } from '../demo-data.js';
import { useDemoCommerceStore } from '../../../context/demo-commerce-store.js';
import type { CatalogProduct } from '../services/public-catalog-api.js';
import { formatVnd as formatCatalogVnd } from '../services/public-catalog-api.js';

export function SectionHeading({
  eyebrow,
  title,
  description,
  link,
  linkText,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  link?: string;
  linkText?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {link ? (
        <Link className="text-link" to={link}>
          {linkText ?? 'View all'} <ArrowRight size={16} />
        </Link>
      ) : null}
    </div>
  );
}

export function ProductCard({
  product,
}: {
  product: (typeof demoProducts)[number];
}) {
  const liked = useDemoCommerceStore((state) =>
    state.wishlist.includes(product.id),
  );
  const toggleWishlist = useDemoCommerceStore((state) => state.toggleWishlist);
  const discount = product.compareAt
    ? Math.round((1 - product.price / product.compareAt) * 100)
    : 0;
  return (
    <article className="product-card">
      <div className={`product-image ${product.color}`}>
        <Link to="/products" aria-label="View products">
          <img src={product.image} alt={product.name} />
        </Link>
        {discount ? <span className="product-badge">-{discount}%</span> : null}
        <button
          className={`product-heart${liked ? ' is-liked' : ''}`}
          aria-label={liked ? 'Remove from wishlist' : 'Add to wishlist'}
          onClick={() => toggleWishlist(product.id)}
        >
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="product-info">
        <Link to="/products" className="product-category">
          {product.category}
        </Link>
        <Link to="/products" className="product-name">
          {product.name}
        </Link>
        <div className="product-meta">
          <span className="product-price">{formatVnd(product.price)}</span>
          {product.compareAt ? (
            <span className="product-old-price">
              {formatVnd(product.compareAt)}
            </span>
          ) : null}
        </div>
        <div className="product-rating">
          <Star size={13} fill="currentColor" />
          <strong>{product.rating}</strong>
          <span>({product.sold} sold)</span>
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: typeof demoProducts }) {
  if (!products.length)
    return (
      <div className="empty-state">
        <Search />
        <h3>No products found</h3>
        <p>Try different keywords or filters.</p>
        <Link className="button-primary" to="/products">
          View all products
        </Link>
      </div>
    );
  return (
    <div className="product-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function CatalogProductGrid({
  products,
}: {
  products: CatalogProduct[];
}) {
  if (!products.length)
    return (
      <div className="empty-state">
        <Search />
        <h3>No products available</h3>
        <p>Please check back later or explore another category.</p>
      </div>
    );
  return (
    <div className="product-grid">
      {products.map((product) => (
        <article className="product-card" key={product.id}>
          <div className="product-image">
            <Link
              to={`/products/${product.id}`}
              aria-label={`View ${product.name}`}
            >
              {product.image ? (
                <img
                  src={product.image.url}
                  alt={product.image.altText || product.name}
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ) : null}
              {!product.image ? (
                <span className="detail-image-label">NEXORA</span>
              ) : null}
            </Link>
            {product.available === 0 ? (
              <span className="product-badge">Out of stock</span>
            ) : null}
          </div>
          <div className="product-info">
            <span className="product-category">{product.category.name}</span>
            <Link to={`/products/${product.id}`} className="product-name">
              {product.name}
            </Link>
            <div className="product-meta">
              <span className="product-price">
                {product.priceVnd === null
                  ? 'No SKU available'
                  : formatCatalogVnd(product.priceVnd)}
              </span>
            </div>
            <div className="product-rating">
              <span>{product.available > 0 ? 'In stock' : 'Out of stock'}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
