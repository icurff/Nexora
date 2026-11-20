import { ArrowRight, Heart, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { useToggleWishlist, useWishlist } from '../../wishlist/wishlist-api.js';
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

function CatalogProductImage({ product }: { product: CatalogProduct }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = product.image;
  if (!image || failedUrl === image.url) {
    return <span className="detail-image-label">No image available</span>;
  }
  if (image.contentType.startsWith('video/')) {
    return (
      <video
        src={image.url}
        muted
        preload="metadata"
        aria-label={product.name}
      />
    );
  }
  return (
    <img
      src={image.url}
      alt={image.altText || product.name}
      onError={() => setFailedUrl(image.url)}
    />
  );
}

export function CatalogProductGrid({
  products,
}: {
  products: CatalogProduct[];
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const wishlist = useWishlist();
  const toggle = useToggleWishlist();
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
              <CatalogProductImage product={product} />
            </Link>
            <button
              className={`product-heart${wishlist.data?.includes(product.id) ? ' is-liked' : ''}`}
              aria-label={
                wishlist.data?.includes(product.id)
                  ? 'Remove from wishlist'
                  : 'Add to wishlist'
              }
              disabled={toggle.isPending || (Boolean(user) && !wishlist.data)}
              onClick={() => {
                if (!user) {
                  navigate('/login', {
                    state: { from: { pathname: `/products/${product.id}` } },
                  });
                  return;
                }
                toggle.mutate({
                  id: product.id,
                  liked: wishlist.data?.includes(product.id) ?? false,
                });
              }}
            >
              <Heart
                size={18}
                fill={
                  wishlist.data?.includes(product.id) ? 'currentColor' : 'none'
                }
              />
            </button>
          </div>
          <div className="product-info">
            <span className="product-category" title={product.category.name}>
              {product.category.name}
            </span>
            <Link
              to={`/products/${product.id}`}
              className="product-name"
              title={product.name}
            >
              {product.name}
            </Link>
            <div className="product-meta">
              <span className="product-price">
                {product.priceVnd === null
                  ? 'Price unavailable'
                  : formatCatalogVnd(product.priceVnd)}
              </span>
              <span
                className={`product-availability${product.available > 0 ? '' : ' is-unavailable'}`}
              >
                {product.available > 0 ? 'In stock' : 'Out of stock'}
              </span>
            </div>
          </div>
        </article>
      ))}
      {toggle.isError || wishlist.isError ? (
        <p role="alert">Unable to update wishlist. Please try again.</p>
      ) : null}
    </div>
  );
}
