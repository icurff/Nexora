import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CategoryImage } from '../components/CategoryImage.js';
import {
  getPublicCategories,
  getPublicProducts,
} from '../services/public-catalog-api.js';

export function CategoriesPage() {
  const query = useQuery({
    queryKey: ['public-categories'],
    queryFn: getPublicCategories,
    retry: false,
  });
  const previews = useQueries({
    queries: (query.data ?? []).map((category) => ({
      queryKey: ['category-preview', category.id],
      queryFn: () => getPublicProducts(1, undefined, category.id, 8),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Categories</span>
      </div>
      <div className="catalog-title">
        <div>
          <h1>Product categories</h1>
          <p>Explore our categories.</p>
        </div>
      </div>
      {query.isPending ? <p role="status">Loading categories…</p> : null}
      {query.isError ? (
        <div className="empty-state" role="alert">
          <p>Unable to load categories.</p>
          <button
            className="button-secondary"
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {query.data?.length === 0 ? <p>No categories available.</p> : null}
      <div className="category-grid category-grid-large">
        {query.data?.map((category, index) => (
          <Link
            to={`/categories/${category.id}`}
            key={category.id}
            className={`category-card category-${['mint', 'sand', 'blue', 'rose'][index % 4]}`}
          >
            <CategoryImage
              url={
                previews[index]?.data?.items.find((product) =>
                  product.image?.contentType.startsWith('image/'),
                )?.image?.url
              }
            />
            <h3>{category.name}</h3>
            <ArrowRight className="category-arrow" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </div>
  );
}
