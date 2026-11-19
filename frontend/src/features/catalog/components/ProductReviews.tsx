import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth';
import { getReviews, submitReview } from '../services/review-api';

export function ProductReviews({ productId }: { productId: string }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const reviews = useQuery({
    queryKey: ['reviews', productId],
    queryFn: () => getReviews(productId),
    retry: false,
  });
  const submit = useMutation({
    mutationFn: () => submitReview(productId, { rating, content }),
    onSuccess: async () => {
      setContent('');
      await client.invalidateQueries({ queryKey: ['reviews', productId] });
    },
  });
  return (
    <section className="detail-more">
      <h2>Reviews</h2>
      {reviews.isPending ? <p role="status">Loading reviews…</p> : null}
      {reviews.isError ? (
        <div role="alert">
          Unable to load reviews.{' '}
          <button
            className="button-secondary"
            onClick={() => void reviews.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {reviews.data?.length === 0 ? <p>No reviews yet.</p> : null}
      {reviews.data?.map((review) => (
        <article className="admin-panel" key={review.id}>
          <strong>
            {review.author} · {review.rating}/5
          </strong>
          <p>{review.content}</p>
        </article>
      ))}
      {user ? (
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit.mutate();
          }}
        >
          <label>
            Rating
            <select
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value}/5
                </option>
              ))}
            </select>
          </label>
          <label>
            Review
            <textarea
              value={content}
              required
              maxLength={2000}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <button
            className="button-primary"
            disabled={submit.isPending || !content.trim()}
          >
            Submit review
          </button>
          {submit.isSuccess ? (
            <p role="status">Your review is awaiting moderation.</p>
          ) : null}
          {submit.isError ? (
            <p role="alert">Unable to submit your review. Please try again.</p>
          ) : null}
        </form>
      ) : (
        <p>
          <Link
            to="/login"
            state={{ from: { pathname: `/products/${productId}` } }}
          >
            Sign in
          </Link>{' '}
          to write a review.
        </p>
      )}
    </section>
  );
}
