import { useState } from 'react';
import {
  Check,
  ChevronRight,
  Heart,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { demoProducts, formatVnd } from '../../catalog/demo-data.js';
import { useDemoCommerceStore } from '../../../context/demo-commerce-store.js';
import {
  SectionHeading,
  ProductGrid,
} from '../components/catalog-components.js';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const product =
    demoProducts.find((item) => item.id === id) ?? demoProducts[0];
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState('');
  const liked = useDemoCommerceStore((state) =>
    state.wishlist.includes(product.id),
  );
  const addToCart = useDemoCommerceStore((state) => state.addToCart);
  const toggleWishlist = useDemoCommerceStore((state) => state.toggleWishlist);
  const similar = demoProducts.filter(
    (item) => item.categoryId === product.categoryId && item.id !== product.id,
  );
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <Link to={`/categories/${product.categoryId}`}>{product.category}</Link>
        <ChevronRight />
        <span>{product.name}</span>
      </div>
      <div className="product-detail-grid">
        <div className={`detail-image ${product.color}`}>
          <span className="detail-image-label">NEXORA SELECTED</span>
          <img src={product.image} alt={product.name} />
        </div>
        <div className="detail-copy">
          <span className="product-category">{product.category}</span>
          <h1>{product.name}</h1>
          <div className="detail-rating">
            <span>
              <Star size={15} fill="currentColor" /> {product.rating}
            </span>
            <span>{product.sold} lượt mua</span>
            <span>{product.stock > 0 ? 'Còn hàng' : 'Tạm hết hàng'}</span>
          </div>
          <div className="detail-price">
            <strong>{formatVnd(product.price)}</strong>
            {product.compareAt ? (
              <del>{formatVnd(product.compareAt)}</del>
            ) : null}
          </div>
          <p className="detail-description">{product.description}</p>
          <div className="detail-divider" />
          <div className="detail-option">
            <strong>Màu sắc</strong>
            <span>
              {product.color === 'bg-[#e6ede8]'
                ? 'Natural'
                : 'Phiên bản tiêu chuẩn'}
            </span>
            <div className="swatch-row">
              <button aria-label="Màu tự nhiên" className="swatch selected" />
              <button aria-label="Màu be" className="swatch sand" />
              <button aria-label="Màu xanh" className="swatch blue" />
            </div>
          </div>
          <div className="detail-buy-row">
            <div className="quantity-control">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                aria-label="Giảm số lượng"
              >
                <Minus size={15} />
              </button>
              <span>{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                aria-label="Tăng số lượng"
              >
                <Plus size={15} />
              </button>
            </div>
            <button
              className="button-primary add-cart-button"
              onClick={() => {
                addToCart(product.id, quantity);
                setNotice('Đã thêm vào giỏ hàng');
              }}
            >
              <ShoppingCart size={17} /> Thêm vào giỏ
            </button>
            <button
              className={`round-outline${liked ? ' is-liked' : ''}`}
              onClick={() => toggleWishlist(product.id)}
              aria-label="Yêu thích"
            >
              <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            </button>
          </div>
          {notice ? (
            <div className="inline-success">
              <Check size={15} />
              {notice} <Link to="/cart">Xem giỏ hàng</Link>
            </div>
          ) : null}
          <div className="detail-perks">
            <span>
              <Truck /> Giao hàng 2–4 ngày
            </span>
            <span>
              <ShieldCheck /> Đổi trả trong 7 ngày
            </span>
            <span>
              <PackageCheck /> Sản phẩm được chọn lọc
            </span>
          </div>
        </div>
      </div>
      <section className="home-section detail-more">
        <SectionHeading
          eyebrow="CÓ THỂ BẠN SẼ THÍCH"
          title="Thêm lựa chọn cùng danh mục"
        />
        <ProductGrid
          products={similar.length ? similar : demoProducts.slice(0, 4)}
        />
      </section>
    </div>
  );
}
