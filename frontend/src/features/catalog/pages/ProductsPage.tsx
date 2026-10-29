import { useMemo, useState } from 'react';
import {
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { demoCategories, demoProducts } from '../../catalog/demo-data.js';
import { ProductGrid } from '../components/catalog-components.js';

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState(
    params.get('category') ?? 'all',
  );
  const [sort, setSort] = useState(params.get('sort') ?? 'featured');
  const [showFilter, setShowFilter] = useState(false);
  const products = useMemo(() => {
    let result = demoProducts.filter(
      (product) =>
        selectedCategory === 'all' || product.categoryId === selectedCategory,
    );
    if (sort === 'price-asc')
      result = [...result].sort((a, b) => a.price - b.price);
    if (sort === 'price-desc')
      result = [...result].sort((a, b) => b.price - a.price);
    if (sort === 'popular')
      result = [...result].sort((a, b) => b.sold - a.sold);
    return result;
  }, [selectedCategory, sort]);
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <span>Sản phẩm</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">CỬA HÀNG NEXORA</span>
          <h1>Tất cả sản phẩm</h1>
          <p>Khám phá những món đồ được chọn lọc cho bạn.</p>
        </div>
        <button
          className="filter-toggle"
          onClick={() => setShowFilter(!showFilter)}
        >
          <SlidersHorizontal size={16} /> Bộ lọc
        </button>
      </div>
      <div className={`catalog-toolbar${showFilter ? ' filters-open' : ''}`}>
        <div className="catalog-categories">
          <button
            className={selectedCategory === 'all' ? 'active' : ''}
            onClick={() => setSelectedCategory('all')}
          >
            Tất cả
          </button>
          {demoCategories.map((category) => (
            <button
              key={category.id}
              className={selectedCategory === category.id ? 'active' : ''}
              onClick={() => setSelectedCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
        <label className="sort-control">
          <ArrowDownUp size={15} />
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setParams(
                event.target.value === 'featured'
                  ? {}
                  : { sort: event.target.value },
              );
            }}
          >
            <option value="featured">Sắp xếp: Nổi bật</option>
            <option value="popular">Bán chạy nhất</option>
            <option value="price-asc">Giá: Thấp đến cao</option>
            <option value="price-desc">Giá: Cao đến thấp</option>
          </select>
          <ChevronDown size={14} />
        </label>
      </div>
      <div className="catalog-count">
        Hiển thị <strong>{products.length}</strong> sản phẩm
      </div>
      <ProductGrid products={products} />
      <div className="pagination">
        <button className="page-number active">1</button>
        <button className="page-number">2</button>
        <button className="page-number">3</button>
        <button className="page-next">
          Tiếp theo <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
