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
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Products</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">NEXORA STORE</span>
          <h1>All products</h1>
          <p>Explore products selected for you.</p>
        </div>
      </div>
      {products.isPending ? (
        <div className="empty-state" role="status">
          Loading products...
        </div>
      ) : products.isError ? (
        <div className="empty-state" role="alert">
          <h3>Unable to load products</h3>
          <p>Check your connection and try again.</p>
          <button
            className="button-primary"
            onClick={() => void products.refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="catalog-count">
            <strong>{result?.total ?? 0}</strong> products
          </div>
          <CatalogProductGrid products={result?.items ?? []} />
          {(result?.totalPages ?? 0) > 1 ? (
            <nav className="pagination" aria-label="Product pagination">
              <button
                className="page-next"
                disabled={page <= 1}
                onClick={() =>
                  setParams(page <= 2 ? {} : { page: String(page - 1) })
                }
              >
                Previous
              </button>
              <span className="page-number active" aria-current="page">
                {page}
              </span>
              <button
                className="page-next"
                disabled={page >= (result?.totalPages ?? 1)}
                onClick={() => setParams({ page: String(page + 1) })}
              >
                Next <ArrowRight size={15} />
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
