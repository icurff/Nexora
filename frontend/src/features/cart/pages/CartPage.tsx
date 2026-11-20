import { Recommendations } from '../../catalog/components/Recommendations';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth.js';
import {
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from '../hooks/useCart.js';
import { cartKey } from '../hooks/useCart.js';
import type { CartItem } from '../services/cart-api.js';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';

function optionSummary(
  options: Record<string, string>,
  labels: Record<string, string>,
) {
  return Object.entries(options)
    .map(([code, value]) => `${labels[code] ?? code}: ${value}`)
    .join(' · ');
}

function unavailableMessage(item: CartItem) {
  if (item.unavailableReason === 'SKU_SELECTION_REQUIRED')
    return 'This product now has variants. Return to its details to choose one.';
  if (item.unavailableReason === 'UNAVAILABLE')
    return 'This product or variant is no longer available.';
  if (item.unavailableReason === 'OUT_OF_STOCK')
    return 'This product is out of stock.';
  if (item.unavailableReason === 'INSUFFICIENT_STOCK')
    return `Only ${item.available} items remain. Reduce the quantity.`;
  return '';
}

export function CartPage() {
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const cartQuery = useCart();
  const updateMutation = useUpdateCartItem();
  const removeMutation = useRemoveCartItem();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const cart = cartQuery.data;
  const items = useMemo(() => cart?.items ?? [], [cart]);
  const eligible = useMemo(
    () => items.filter((item) => !item.unavailableReason),
    [items],
  );
  const eligibleIds = eligible.map((item) => item.id);
  const activeSelection =
    selectedIds === null
      ? eligibleIds
      : selectedIds.filter((id) => eligibleIds.includes(id));
  const selectedSet = new Set(activeSelection);
  const subtotal = items.reduce(
    (sum, item) =>
      selectedSet.has(item.id)
        ? sum + BigInt(item.priceVnd) * BigInt(item.quantity)
        : sum,
    0n,
  );
  const pending = updateMutation.isPending || removeMutation.isPending;

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void cartQuery.refetch();
    }
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () =>
      document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [cartQuery]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const selected = current ?? eligibleIds;
      return selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id];
    });
  }

  async function changeQuantity(item: CartItem, next: number) {
    if (
      !Number.isSafeInteger(next) ||
      next < 1 ||
      next === item.quantity ||
      pending
    )
      return;
    try {
      await updateMutation.mutateAsync({ id: item.id, quantity: next });
    } catch {
      await queryClient.invalidateQueries({ queryKey: cartKey(user?.id) });
    }
  }

  async function removeItem(item: CartItem) {
    if (pending) return;
    try {
      await removeMutation.mutateAsync({ id: item.id });
      setSelectedIds((current) =>
        (current ?? []).filter((id) => id !== item.id),
      );
    } catch {
      await queryClient.invalidateQueries({ queryKey: cartKey(user?.id) });
    }
  }

  const error = updateMutation.error ?? removeMutation.error;
  const errorCode = (error as { code?: string } | null)?.code;

  return (
    <div className="page-container page-section">
      <div className="breadcrumbs">
        <Link to="/">Home</Link>
        <ChevronRight />
        <span>Cart</span>
      </div>
      <div className="catalog-title">
        <div>
          <span className="section-eyebrow">YOUR CART</span>
          <h1>Your selected items</h1>
          <p>
            {items.reduce((sum, item) => sum + item.quantity, 0)} items in your
            cart
          </p>
        </div>
      </div>
      {status === 'loading' || cartQuery.isPending ? (
        <div className="empty-state" role="status">
          Loading cart...
        </div>
      ) : null}
      {status === 'unauthenticated' ? (
        <div className="empty-state">
          <ShoppingBag />
          <h3>Sign in to view your cart</h3>
          <p>Your cart is saved to your account.</p>
          <Link
            className="button-primary"
            to="/login"
            state={{ from: { pathname: '/cart' } }}
          >
            Sign in
          </Link>
        </div>
      ) : null}
      {cartQuery.isError && status === 'authenticated' && user ? (
        <div className="empty-state" role="alert">
          <h3>Unable to load your cart</h3>
          <p>Check your connection and try again.</p>
          <button
            className="button-primary"
            onClick={() => void cartQuery.refetch()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {cart && items.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag />
          <h3>Your cart is empty</h3>
          <p>Start with something you love.</p>
          <Link className="button-primary" to="/products">
            Explore products <ArrowRight size={16} />
          </Link>
        </div>
      ) : null}
      {cart && items.length > 0 ? (
        <>
          {error ? (
            <div className="inline-error" role="alert">
              {errorCode === 'INSUFFICIENT_STOCK'
                ? 'Quantity exceeds available stock. Your cart has been refreshed.'
                : 'Unable to update the cart. Your cart has been refreshed.'}
            </div>
          ) : null}
          <div className="cart-layout">
            <div className="cart-lines">
              <label className="cart-select-all">
                <input
                  type="checkbox"
                  checked={
                    eligible.length > 0 &&
                    eligible.every((item) => selectedSet.has(item.id))
                  }
                  onChange={(event) =>
                    setSelectedIds(event.target.checked ? eligibleIds : [])
                  }
                />{' '}
                Select all available items
              </label>
              {items.map((item) => {
                const message = unavailableMessage(item);
                const price = BigInt(item.priceVnd) * BigInt(item.quantity);
                return (
                  <article
                    key={item.id}
                    className={`cart-line${message ? ' cart-line-unavailable' : ''}`}
                  >
                    <label className="cart-line-select">
                      <input
                        type="checkbox"
                        disabled={Boolean(message)}
                        checked={selectedSet.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        aria-label={`Select ${item.product.name}`}
                      />
                    </label>
                    <Link
                      to={`/products/${item.product.id}`}
                      className="cart-line-image"
                    >
                      {item.product.image ? (
                        <img
                          src={item.product.image.url}
                          alt={item.product.image.altText || item.product.name}
                        />
                      ) : (
                        <span>NEXORA</span>
                      )}
                    </Link>
                    <div className="cart-line-info">
                      <Link
                        to={`/products/${item.product.id}`}
                        className="cart-line-name"
                      >
                        {item.product.name}
                      </Link>
                      <span>
                        {item.variant
                          ? optionSummary(
                              item.variant.options,
                              item.variant.optionLabels,
                            ) || item.variant.sku
                          : 'Product without variants'}
                      </span>
                      {message ? (
                        <strong className="cart-unavailable-message">
                          {message}
                        </strong>
                      ) : null}
                      <button
                        className="remove-link"
                        disabled={pending}
                        onClick={() => void removeItem(item)}
                      >
                        <X size={14} /> Remove
                      </button>
                    </div>
                    <div className="cart-line-quantity">
                      <span className="cart-unit-price">
                        {formatVnd(item.priceVnd)} / item
                      </span>
                      <div className="quantity-control">
                        <button
                          disabled={pending || item.quantity <= 1}
                          onClick={() =>
                            void changeQuantity(item, item.quantity - 1)
                          }
                          aria-label="Decrease"
                        >
                          <Minus size={14} />
                        </button>
                        <input
                          key={`${item.id}-${item.quantity}`}
                          aria-label={`Quantity ${item.product.name}`}
                          inputMode="numeric"
                          defaultValue={item.quantity}
                          disabled={pending}
                          onBlur={(event) => {
                            const parsed = Number(event.currentTarget.value);
                            if (!Number.isSafeInteger(parsed) || parsed < 1)
                              event.currentTarget.value = String(item.quantity);
                            else void changeQuantity(item, parsed);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter')
                              event.currentTarget.blur();
                          }}
                        />
                        <button
                          disabled={pending || item.quantity >= item.available}
                          onClick={() =>
                            void changeQuantity(item, item.quantity + 1)
                          }
                          aria-label="Increase"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong>{formatVnd(price)}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
            <aside className="order-summary">
              <h2>Order subtotal</h2>
              <div className="summary-row">
                <span>{activeSelection.length} items selected</span>
                <span>{formatVnd(subtotal)}</span>
              </div>
              <div className="summary-row summary-total">
                <strong>Subtotal</strong>
                <strong>{formatVnd(subtotal)}</strong>
              </div>
              <p className="summary-note">
                Shipping is calculated at checkout.
              </p>
              <button
                className="button-primary full-button"
                disabled={!activeSelection.length}
                onClick={() =>
                  navigate('/checkout', {
                    state: { selectedItemIds: activeSelection },
                  })
                }
              >
                Checkout
              </button>
              <Link className="continue-link" to="/products">
                <ArrowLeft size={15} /> Continue shopping
              </Link>
            </aside>
          </div>
        </>
      ) : null}
      {cart && status === 'authenticated' ? (
        <Recommendations
          surface="cart"
          revision={JSON.stringify(
            items.map((item) => [item.product.id, item.quantity]),
          )}
        />
      ) : null}
    </div>
  );
}
