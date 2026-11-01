import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CatalogProductGrid } from '../components/catalog-components.js';
import { getPublicProducts } from '../services/public-catalog-api.js';

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page') ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const products = useQuery({
    queryKey: ['public-products', page],
    queryFn: () => getPublicProducts(page),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const result = products.data;

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
      </div>
      {products.isPending ? (
        <div className="empty-state" role="status">
          Đang tải sản phẩm...
        </div>
      ) : products.isError ? (
        <div className="empty-state" role="alert">
          <h3>Chưa thể tải sản phẩm</h3>
          <p>Kiểm tra kết nối rồi thử lại.</p>
          <button
            className="button-primary"
            onClick={() => void products.refetch()}
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
          <div className="catalog-count">
            Có <strong>{result?.total ?? 0}</strong> sản phẩm
          </div>
          <CatalogProductGrid products={result?.items ?? []} />
          {(result?.totalPages ?? 0) > 1 ? (
            <nav className="pagination" aria-label="Phân trang sản phẩm">
              <button
                className="page-next"
                disabled={page <= 1}
                onClick={() =>
                  setParams(page <= 2 ? {} : { page: String(page - 1) })
                }
              >
                Trang trước
              </button>
              <span className="page-number active" aria-current="page">
                {page}
              </span>
              <button
                className="page-next"
                disabled={page >= (result?.totalPages ?? 1)}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Trang tiếp <ArrowRight size={15} />
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
