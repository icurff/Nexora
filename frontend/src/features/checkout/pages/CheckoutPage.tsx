import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ShoppingBag } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks/useAuth.js';
import { CheckoutAddressPicker } from '../../account/components/AddressBook.js';
import { useAddresses } from '../../account/hooks/useAddresses.js';
import { useCart, cartKey } from '../../cart/hooks/useCart.js';
import type { CartItem } from '../../cart/services/cart-api.js';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { ApiError } from '../../../services/api-client.js';
import { getOrderByKey, placeOrder } from '../../orders/services/order-api.js';
import '../CheckoutAddress.css';

const SHIPPING_FEE = 30_000n;
const attemptStorageKey = (userId: string) => `nexora_checkout_key_${userId}`;
async function payloadFingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function CheckoutPage() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const cart = useCart();
  const addressesQuery = useAddresses(Boolean(user));
  const [selectedAddress, setSelectedAddress] = useState('');
  const [selectedItems, setSelectedItems] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [activeAttemptKey, setActiveAttemptKey] = useState<string | null>(null);
  const [resolvedAttemptKey, setResolvedAttemptKey] = useState<string | null>(
    null,
  );
  const requestedIds = (location.state as { selectedItemIds?: string[] } | null)
    ?.selectedItemIds;
  const eligible = useMemo(
    () => (cart.data?.items ?? []).filter((item) => !item.unavailableReason),
    [cart.data],
  );
  const eligibleIds = eligible.map((item) => item.id);
  const effectiveSelection =
    selectedItems ??
    (requestedIds?.length
      ? requestedIds.filter((id) => eligibleIds.includes(id))
      : eligibleIds);
  let storedAttemptKey = activeAttemptKey;
  if (!storedAttemptKey && user) {
    try {
      const saved = sessionStorage.getItem(attemptStorageKey(user.id));
      storedAttemptKey = saved
        ? (JSON.parse(saved) as { key: string }).key
        : null;
    } catch {
      storedAttemptKey = null;
    }
  }
  const pendingRecovery = Boolean(
    storedAttemptKey && resolvedAttemptKey !== storedAttemptKey,
  );

  useEffect(() => {
    if (
      !user ||
      !cart.data ||
      !storedAttemptKey ||
      resolvedAttemptKey === storedAttemptKey
    )
      return;
    const key = storedAttemptKey;
    let cancelled = false;
    void getOrderByKey(key)
      .then((order) => {
        if (!cancelled) navigate(`/orders/${order.id}`, { replace: true });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 404)
          setResolvedAttemptKey(key);
        else
          setError(
            'The previous order result is unknown. Reload the page to check again.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [cart.data, navigate, resolvedAttemptKey, storedAttemptKey, user]);

  const items = eligible.filter((item) => effectiveSelection.includes(item.id));
  const subtotal = items.reduce(
    (sum, item) => sum + BigInt(item.priceVnd) * BigInt(item.quantity),
    0n,
  );
  const addresses = addressesQuery.data ?? [];
  const activeAddress =
    addresses.find((item) => item.id === selectedAddress) ??
    addresses.find((item) => item.isDefault) ??
    addresses[0];

  async function submit() {
    if (
      !user ||
      !activeAddress ||
      items.length === 0 ||
      pending ||
      pendingRecovery
    )
      return;
    setPending(true);
    setError('');
    let key: string;
    try {
      const saved = sessionStorage.getItem(attemptStorageKey(user.id));
      const signature = await payloadFingerprint({
        items: items
          .map((item) => [item.id, item.quantity, item.priceVnd])
          .sort(),
        address: [activeAddress.id, activeAddress.updatedAt],
        customerNote,
      });
      const existing = saved
        ? (JSON.parse(saved) as { key: string; signature: string })
        : null;
      if (existing && existing.signature !== signature) {
        try {
          const prior = await getOrderByKey(existing.key);
          navigate(`/orders/${prior.id}`, { replace: true });
          return;
        } catch (cause) {
          if (cause instanceof ApiError && cause.status === 404) {
            setError(
              'The previous order details do not match. Re-enter the note and keep the same products and address to retry.',
            );
            return;
          }
          throw cause;
        }
      }
      key =
        existing?.signature === signature ? existing.key : crypto.randomUUID();
      sessionStorage.setItem(
        attemptStorageKey(user.id),
        JSON.stringify({ key, signature }),
      );
    } catch {
      setError(
        'Unable to safely save the recovery key. Enable session storage and try again.',
      );
      return;
    }
    setActiveAttemptKey(key);
    try {
      const order = await placeOrder({
        idempotencyKey: key,
        items: items.map((item) => ({
          cartItemId: item.id,
          quantity: item.quantity,
          unitPrice: item.priceVnd,
        })),
        addressId: activeAddress.id,
        addressUpdatedAt: activeAddress.updatedAt,
        customerNote,
      });
      try {
        sessionStorage.removeItem(attemptStorageKey(user.id));
      } catch {
        /* Ignore storage cleanup failure. */
      }
      setActiveAttemptKey(null);
      await client.invalidateQueries({ queryKey: cartKey(user.id) });
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [
          'PRICE_CHANGED',
          'CART_CHANGED',
          'INSUFFICIENT_STOCK',
          'PRODUCT_NOT_SELLABLE',
          'SKU_NOT_SELLABLE',
          'ADDRESS_CHANGED',
        ].includes(cause.code ?? '')
      ) {
        await Promise.all([
          client.invalidateQueries({ queryKey: cartKey(user.id) }),
          addressesQuery.refetch(),
        ]);
        setError(
          cause.code === 'PRICE_CHANGED'
            ? 'Product prices have changed. Review them before placing your order.'
            : cause.code === 'INSUFFICIENT_STOCK'
              ? 'An item no longer has enough stock. Your cart has been refreshed.'
              : 'Your cart or address has changed. Review and confirm again.',
        );
      } else {
        setError(
          'The order result is unknown. Retry to check the same request.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (status === 'loading')
    return (
      <div className="page-container page-section">
        <p role="status">Checking your account…</p>
      </div>
    );
  if (!user)
    return (
      <div className="page-container page-section">
        <div className="empty-state">
          <ShoppingBag />
          <h1>Sign in to check out</h1>
          <p>Sign in to place an order.</p>
          <Link className="button-primary" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    );

  return (
    <div className="page-container page-section">
      <div className="checkout-layout">
        <main className="checkout-main">
          <CheckoutAddressPicker
            value={activeAddress?.id}
            onChange={setSelectedAddress}
          />
          <section className="checkout-panel">
            <div className="panel-heading">
              <span className="checkout-number">2</span>
              <div>
                <h2>Order items</h2>
                <p>Prices and quantities are checked when you place the order.</p>
              </div>
            </div>
            {cart.isPending ? <p role="status">Loading cart…</p> : null}
            {cart.isError ? (
              <p role="alert">
                Unable to load the cart.{' '}
                <button onClick={() => void cart.refetch()}>Try again</button>
              </p>
            ) : null}
            {cart.data && eligible.length === 0 ? (
              <p>
                There are no available items in your cart.{' '}
                <Link to="/cart">Back to cart</Link>
              </p>
            ) : null}
            {eligible.map((item: CartItem) => (
              <label className="checkout-order-line" key={item.id}>
                <input
                  type="checkbox"
                  checked={effectiveSelection.includes(item.id)}
                  onChange={() =>
                    setSelectedItems((current) => {
                      const selected = current ?? effectiveSelection;
                      return selected.includes(item.id)
                        ? selected.filter((id) => id !== item.id)
                        : [...selected, item.id];
                    })
                  }
                />
                <span>
                  <strong>{item.product.name}</strong>
                  <small>
                    {item.variant
                      ? Object.values(item.variant.options).join(' · ')
                      : 'Product without variants'}{' '}
                    · Qty {item.quantity}
                  </small>
                </span>
                <b>
                  {formatVnd(BigInt(item.priceVnd) * BigInt(item.quantity))}
                </b>
              </label>
            ))}
            {cart.data?.items.some((item) => item.unavailableReason) ? (
              <p role="alert">
                Some unavailable items were excluded from checkout. Please review your cart.
              </p>
            ) : null}
          </section>
          <section className="checkout-panel">
            <div className="panel-heading">
              <span className="checkout-number">3</span>
              <div>
                <h2>Cash on delivery</h2>
                <p>Pay the delivery agent when your order arrives.</p>
              </div>
            </div>
            <label className="checkout-note">
              Delivery note (optional)
              <textarea
                value={customerNote}
                maxLength={1000}
                onChange={(event) => setCustomerNote(event.target.value)}
                rows={3}
              />
            </label>
            <div className="checkout-total-row">
              <span>Subtotal</span>
              <strong>{formatVnd(subtotal)}</strong>
            </div>
            <div className="checkout-total-row">
              <span>Shipping</span>
              <strong>{formatVnd(SHIPPING_FEE)}</strong>
            </div>
            <div className="checkout-total-row checkout-grand-total">
              <span>Total</span>
              <strong>{formatVnd(subtotal + SHIPPING_FEE)}</strong>
            </div>
          </section>
          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}
          {addressesQuery.isError ? (
            <p role="alert">
              Unable to load addresses.{' '}
              <button onClick={() => void addressesQuery.refetch()}>
                Try again
              </button>
            </p>
          ) : null}
          {addresses.length === 0 ? (
            <p className="inline-error">
              Add an address in your{' '}
              <Link to="/account?section=addresses">address book</Link> before placing your order.
            </p>
          ) : null}
          {pendingRecovery ? (
            <p role="status">Checking the previous order…</p>
          ) : null}
          <div className="checkout-actions">
            <Link className="button-secondary" to="/cart">
              <ArrowLeft size={16} /> Back to cart
            </Link>
            <button
              className="button-primary"
              disabled={
                !activeAddress ||
                items.length === 0 ||
                pending ||
                pendingRecovery
              }
              onClick={() => void submit()}
            >
              {pendingRecovery
                ? 'Checking previous order…'
                : pending
                  ? 'Placing order…'
                  : 'Place cash-on-delivery order'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
