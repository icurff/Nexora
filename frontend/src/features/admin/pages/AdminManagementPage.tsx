import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminReviews,
  moderateReview,
} from '../../catalog/services/review-api';

export function AdminManagementPage({ kind }: { kind: 'reviews' }) {
  void kind;
  const client = useQueryClient();
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const reviews = useQuery({
    queryKey: ['admin-reviews', filter, page],
    queryFn: () => getAdminReviews(page, filter === 'ALL' ? undefined : filter),
    retry: false,
  });
  const moderate = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: 'APPROVED' | 'HIDDEN';
    }) => moderateReview(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });
  return (
    <div>
      <header className="admin-page-heading">
        <div>
          <h1>Reviews</h1>
          <p>Review customer feedback.</p>
        </div>
      </header>
      <div className="admin-tabs">
        {[
          ['ALL', 'All'],
          ['PENDING', 'Pending'],
          ['APPROVED', 'Approved'],
          ['HIDDEN', 'Hidden'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {reviews.isPending ? <p role="status">Loading reviews…</p> : null}
      {reviews.isError ? (
        <div role="alert">
          <p>Unable to load reviews.</p>
          <button
            className="admin-button-secondary"
            onClick={() => void reviews.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {moderate.isError ? (
        <p role="alert">Unable to update review. Please try again.</p>
      ) : null}
      {reviews.data && reviews.data.items.length === 0 ? (
        <p>No reviews found.</p>
      ) : null}
      <div className="review-list">
        {reviews.data?.items.map((review) => (
          <article className="admin-panel review-card" key={review.id}>
            <div className="review-card-top">
              <strong>{review.author}</strong>
              <span>
                {review.rating}/5 · {review.status}
              </span>
            </div>
            <p>{review.content}</p>
            <div className="review-card-bottom">
              <span>{review.productName}</span>
              <div>
                <button
                  className="admin-button-secondary"
                  disabled={moderate.isPending || review.status === 'HIDDEN'}
                  onClick={() =>
                    moderate.mutate({ id: review.id, status: 'HIDDEN' })
                  }
                >
                  Hide
                </button>
                <button
                  className="admin-button-primary"
                  disabled={moderate.isPending || review.status === 'APPROVED'}
                  onClick={() =>
                    moderate.mutate({ id: review.id, status: 'APPROVED' })
                  }
                >
                  Approve
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {reviews.data && reviews.data.total > reviews.data.pageSize ? (
        <nav className="table-pagination" aria-label="Review pagination">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} /{' '}
            {Math.ceil(reviews.data.total / reviews.data.pageSize)}
          </span>
          <button
            disabled={page * reviews.data.pageSize >= reviews.data.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
