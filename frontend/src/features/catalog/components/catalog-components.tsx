import { ArrowRight, Heart, Search, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoProducts, formatVnd } from '../demo-data.js';
import { useDemoCommerceStore } from '../../../context/demo-commerce-store.js';

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
          {linkText ?? 'Xem tất cả'} <ArrowRight size={16} />
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
        <Link to={`/products/${product.id}`} aria-label={`Xem ${product.name}`}>
          <img src={product.image} alt={product.name} />
        </Link>
        {discount ? <span className="product-badge">-{discount}%</span> : null}
        <button
          className={`product-heart${liked ? ' is-liked' : ''}`}
          aria-label={liked ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
          onClick={() => toggleWishlist(product.id)}
        >
          <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="product-info">
        <Link
          to={`/categories/${product.categoryId}`}
          className="product-category"
        >
          {product.category}
        </Link>
        <Link to={`/products/${product.id}`} className="product-name">
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
          <span>({product.sold} đã bán)</span>
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
        <h3>Chưa tìm thấy sản phẩm</h3>
        <p>Thử đổi từ khóa hoặc bộ lọc của bạn.</p>
        <Link className="button-primary" to="/products">
          Xem tất cả sản phẩm
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
