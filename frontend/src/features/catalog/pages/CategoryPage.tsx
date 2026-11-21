import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { CatalogProductGrid } from '../components/catalog-components.js';
import { Pagination } from '../components/Pagination.js';
import {
  getPublicCategories,
  getPublicProducts,
} from '../services/public-catalog-api.js';

export function CategoryPage() {
  const { id = '' } = useParams();
  return <CategoryContent key={id} id={id} />;
}

function CategoryContent({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const categories = useQuery({
    queryKey: ['public-categories'],
    queryFn: getPublicCategories,
    retry: false,
  });
  const products = useQuery({
    queryKey: ['public-products', 'category', id, page],
    queryFn: () => getPublicProducts(page, undefined, id),
    enabled: Boolean(id),
    retry: false,
  });
  const category = categories.data?.find((item) => item.id === id);
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <Link to="/categories">Categories</Link>
        <ChevronRight />
        <span>{category?.name ?? 'Category'}</span>
      </div>
      {categories.isPending || products.isPending ? (
        <p role="status">Loading category…</p>
      ) : null}
      {categories.isError ||
      (products.isError && (!categories.data || category)) ? (
        <div className="empty-state" role="alert">
          <p>Unable to load this category.</p>
          <button
            className="button-secondary"
            onClick={() => {
              void categories.refetch();
              void products.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {categories.data && !category && !products.isPending ? (
        <div className="empty-state">
          <h1>Category not found</h1>
          <Link to="/categories">View categories</Link>
        </div>
      ) : null}
      {category && products.data ? (
        <>
          <div className="catalog-title">
            <div>
              <h1>{category.name}</h1>
              <p>{products.data.total} products</p>
            </div>
          </div>
          <CatalogProductGrid products={products.data.items} />
          <Pagination
            page={page}
            totalPages={products.data.totalPages}
            label="Category pagination"
            onPageChange={(nextPage) => {
              setPage(nextPage);
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
