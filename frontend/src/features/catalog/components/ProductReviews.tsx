import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageSquare, Star } from 'lucide-react';
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
  const entries = reviews.data ?? [];
  const average = entries.length
    ? entries.reduce((sum, review) => sum + review.rating, 0) / entries.length
    : 0;
  return (
    <section
      className="detail-more product-reviews"
      id="reviews"
      aria-labelledby="reviews-heading"
    >
      <div className="reviews-heading">
        <div>
          <h2 id="reviews-heading">Customer reviews</h2>
          <p>See what shoppers think about this product.</p>
        </div>
      </div>
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
      {reviews.data ? (
        <div className="rating-summary" aria-label="Rating summary">
          <div className="rating-overview">
            <strong>
              {entries.length ? average.toFixed(1) : '—'} <small>/ 5</small>
            </strong>
            <span>
              {entries.length} {entries.length === 1 ? 'review' : 'reviews'}
            </span>
          </div>
          <div className="rating-breakdown">
            {[5, 4, 3, 2, 1].map((value) => {
              const count = entries.filter(
                (review) => review.rating === value,
              ).length;
              return (
                <div
                  className="rating-row"
                  key={value}
                  aria-label={`${value} stars: ${count} reviews`}
                >
                  <span>
                    {value}{' '}
                    <Star size={13} fill="currentColor" aria-hidden="true" />
                  </span>
                  <span className="rating-track">
                    <span
                      style={{
                        width: `${entries.length ? (count / entries.length) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="review-write">
        <h3>Write a review</h3>
        <p>Share your experience with other shoppers.</p>
        {user ? (
          <form
            className="review-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate();
            }}
          >
            <fieldset className="rating-picker">
              <legend>Your rating</legend>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <label
                    key={value}
                    title={`${value} ${value === 1 ? 'star' : 'stars'}`}
                  >
                    <input
                      type="radio"
                      name="rating"
                      value={value}
                      checked={rating === value}
                      onChange={() => setRating(value)}
                    />
                    <Star
                      size={27}
                      fill={value <= rating ? 'currentColor' : 'none'}
                      aria-hidden="true"
                    />
                    <span className="rating-sr-only">
                      {value} {value === 1 ? 'star' : 'stars'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              Review
              <textarea
                value={content}
                required
                maxLength={2000}
                rows={4}
                placeholder="What did you think about this product?"
                onChange={(event) => setContent(event.target.value)}
              />
            </label>
            <button
              className="button-primary"
              disabled={submit.isPending || !content.trim()}
            >
              {submit.isPending ? 'Submitting…' : 'Submit review'}
            </button>
            {submit.isSuccess ? (
              <p role="status">Your review is awaiting moderation.</p>
            ) : null}
            {submit.isError ? (
              <p role="alert">
                Unable to submit your review. Please try again.
              </p>
            ) : null}
          </form>
        ) : (
          <p className="review-sign-in">
            <Link
              to="/login"
              state={{ from: { pathname: `/products/${productId}` } }}
            >
              Sign in
            </Link>{' '}
            to write a review.
          </p>
        )}
      </div>
      <div className="reviews-list" aria-label="Reviews">
        {reviews.data?.length === 0 ? (
          <div className="reviews-empty">
            <MessageSquare size={22} aria-hidden="true" />
            <div>
              <strong>No reviews yet</strong>
              <p>Be the first to share your experience.</p>
            </div>
          </div>
        ) : null}
        {reviews.data?.map((review) => (
          <article className="customer-review" key={review.id}>
            <div className="customer-review-head">
              <strong>{review.author}</strong>
              <span className="review-score">
                <Star size={15} fill="currentColor" aria-hidden="true" />{' '}
                {review.rating}/5
              </span>
            </div>
            <p>{review.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
