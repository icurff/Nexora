import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { demoCategories, demoProducts } from '../../catalog/demo-data.js';
import {
  SectionHeading,
  ProductGrid,
} from '../components/catalog-components.js';

export function CategoryPage() {
  const { id = '' } = useParams();
  const category =
    demoCategories.find((item) => item.id === id) ?? demoCategories[0];
  const products = demoProducts.filter(
    (product) => product.categoryId === category.id,
  );
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <Link to="/categories">Danh mục</Link>
        <ChevronRight />
        <span>{category.name}</span>
      </div>
      <div className={`category-hero category-${category.color}`}>
        <span className="category-icon">{category.icon}</span>
        <div>
          <span className="section-eyebrow">BỘ SƯU TẬP</span>
          <h1>{category.name}</h1>
          <p>{category.description}</p>
        </div>
        <span className="category-hero-count">
          {products.length.toString().padStart(2, '0')}
          <small>sản phẩm</small>
        </span>
      </div>
      <SectionHeading title="Sản phẩm trong danh mục" />
      <ProductGrid products={products} />
    </div>
  );
}
