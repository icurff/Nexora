import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { demoProducts } from '../../catalog/demo-data.js';
import { useDemoCommerceStore } from '../../../context/demo-commerce-store.js';
import { ProductGrid } from '../../catalog/components/catalog-components.js';

export function WishlistPage() {
  const ids = useDemoCommerceStore((state) => state.wishlist);
  const products = demoProducts.filter((product) => ids.includes(product.id));
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <span>Yêu thích</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">DÀNH RIÊNG CHO BẠN</span>
          <h1>Danh sách yêu thích</h1>
          <p>Lưu lại những sản phẩm bạn muốn xem sau.</p>
        </div>
      </div>
      <ProductGrid products={products} />
    </div>
  );
}
