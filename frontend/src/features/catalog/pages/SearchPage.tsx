import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { CatalogProductGrid } from '../components/catalog-components.js';
import { getPublicProducts } from '../services/public-catalog-api.js';
import { trackEvent } from '../../../services/tracking-api';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const submitted = (params.get('q') ?? '').trim().slice(0, 100);
  const requestedPage = Number(params.get('page') ?? '1');
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

useEffect(() => {
    if (submitted)
      void trackEvent({ eventType: 'search', queryLength: submitted.length });
  }, [submitted]);
  const products = useQuery({
    queryKey: ['public-products', 'search', submitted, page],
    queryFn: () => getPublicProducts(page, submitted),
    enabled: Boolean(submitted),
    retry: false,
  });

  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Search</span>
      </div>
      <div className="search-heading">
        <span className="section-eyebrow">SEARCH PRODUCTS</span>
        <h1>
          {submitted ? (
            <>
              Results for <em>“{submitted}”</em>
            </>
          ) : (
            'What are you looking for?'
          )}
        </h1>
        <form
          className="large-search"
          onSubmit={(event) => {
            event.preventDefault();
            const keyword = String(new FormData(event.currentTarget).get('q') ?? '').trim();
            setParams(keyword ? { q: keyword } : {});
          }}
        >
          <Search />
          <input
            key={submitted}
            name="q"
            defaultValue={submitted}
            maxLength={100}
            placeholder="Enter a product name or category"
            aria-label="Search keywords"
          />
          <button type="submit">Search</button>
        </form>
        {!submitted ? (
          <p>Enter a product name or category to get started.</p>
        ) : products.isSuccess ? (
          <p>Found {products.data.total} matching products</p>
        ) : null}
      </div>
      {submitted &&
        (products.isPending ? (
          <div className="empty-state" role="status">
            Searching products...
          </div>
        ) : products.isError ? (
          <div className="empty-state" role="alert">
            <h3>Unable to search products</h3>
            <button
              className="button-primary"
              onClick={() => void products.refetch()}
            >
              Try again
            </button>
          </div>
        ) : products.data.items.length ? (
          <>
            <CatalogProductGrid products={products.data.items} />
            {products.data.totalPages > 1 ? (
              <nav
                className="pagination"
                aria-label="Search results pagination"
              >
                <button
                  className="page-next"
                  disabled={page <= 1}
                  onClick={() =>
                    setParams({ q: submitted, page: String(page - 1) })
                  }
                >
                  Previous
                </button>
                <span className="page-number active" aria-current="page">
                  {page}
                </span>
                <button
                  className="page-next"
                  disabled={page >= products.data.totalPages}
                  onClick={() =>
                    setParams({ q: submitted, page: String(page + 1) })
                  }
                >
                  Next <ArrowRight size={15} />
                </button>
              </nav>
            ) : null}
          </>
        ) : (
          <div className="empty-state">
            <Search />
            <h3>No products found</h3>
            <p>Try different keywords.</p>
          </div>
        ))}
    </div>
  );
}
