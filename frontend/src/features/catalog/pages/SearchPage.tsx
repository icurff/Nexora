import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { demoProducts } from '../../catalog/demo-data.js';
import { ProductGrid } from '../components/catalog-components.js';

export function SearchPage() {
  const [params] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const products = demoProducts.filter(
    (product) =>
      !submitted ||
      `${product.name} ${product.category}`
        .toLowerCase()
        .includes(submitted.toLowerCase()),
  );
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Trang chủ</Link>
        <ChevronRight />
        <span>Tìm kiếm</span>
      </div>
      <div className="search-heading">
        <span className="section-eyebrow">TÌM KIẾM SẢN PHẨM</span>
        <h1>
          {submitted ? (
            <>
              Kết quả cho <em>“{submitted}”</em>
            </>
          ) : (
            'Bạn đang tìm gì?'
          )}
        </h1>
        <form
          className="large-search"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Thử “túi tote”, “đèn bàn”..."
            aria-label="Từ khóa tìm kiếm"
          />
          <button type="submit">Tìm kiếm</button>
        </form>
        <p>
          {submitted
            ? `Tìm thấy ${products.length} sản phẩm phù hợp`
            : 'Nhập tên hoặc danh mục sản phẩm để bắt đầu.'}
        </p>
      </div>
      {submitted ? (
        <ProductGrid products={products} />
      ) : (
        <div className="search-suggestions">
          <span>Được tìm nhiều:</span>
          {['Túi tote', 'Đèn bàn', 'Tai nghe', 'Ly gốm'].map((word) => (
            <button
              key={word}
              onClick={() => {
                setQuery(word);
                setSubmitted(word);
              }}
            >
              {word}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
