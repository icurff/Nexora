import { useQueries } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { CatalogProductGrid } from '../../catalog/components/catalog-components.js';
import { getPublicProduct } from '../../catalog/services/public-catalog-api.js';
import { useWishlist } from '../wishlist-api.js';

export function WishlistPage() {
  const { user, status } = useAuth();
  const wishlist = useWishlist();
  const queries = useQueries({
    queries: (wishlist.data ?? []).map((id) => ({
      queryKey: ['public-product', id],
      queryFn: () => getPublicProduct(id),
      retry: false,
    })),
  });
  if (status === 'loading')
    return (
      <div className="page-container page-section" role="status">
        Loading wishlist…
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: { pathname: '/wishlist' } }}
        replace
      />
    );
  const loading =
    wishlist.isPending || queries.some((query) => query.isPending);
  const error = wishlist.isError || queries.some((query) => query.isError);
  const products = queries.flatMap((query) => {
    const product = query.data;
    if (!product) return [];
    const prices = product.variants.map((variant) => BigInt(variant.priceVnd));
    const priceVnd = prices.length
      ? prices.reduce((a, b) => (a < b ? a : b)).toString()
      : product.priceVnd;
    return [
      {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        priceVnd,
        available: product.variants.length
          ? product.variants.reduce(
              (total, variant) => total + variant.available,
              0,
            )
          : product.available,
        image:
          product.images.find((image) => image.isPrimary) ??
          product.images[0] ??
          null,
      },
    ];
  });
  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Wishlist</span>
      </div>
      <div className="catalog-title">
        <div>
          <h1>Wishlist</h1>
          <p>Save products to view later.</p>
        </div>
      </div>
      {loading ? <p role="status">Loading wishlist…</p> : null}
      {error ? (
        <div className="empty-state" role="alert">
          <p>Unable to load wishlist.</p>
          <button
            className="button-secondary"
            onClick={() => {
              void wishlist.refetch();
              queries.forEach((query) => void query.refetch());
            }}
          >
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !error ? (
        products.length ? (
          <CatalogProductGrid products={products} />
        ) : (
          <div className="empty-state">
            <h2>Your wishlist is empty</h2>
            <Link to="/products">Explore products</Link>
          </div>
        )
      ) : null}
    </div>
  );
}
