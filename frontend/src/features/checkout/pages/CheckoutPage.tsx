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
  const addressesQuery = useAddresses(user?.role === 'CUSTOMER');
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
            'Chưa xác định được kết quả lần đặt trước. Tải lại trang để kiểm tra lại.',
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
              'Thông tin lần đặt trước không khớp. Hãy nhập lại ghi chú và giữ nguyên sản phẩm, địa chỉ để thử lại cùng yêu cầu.',
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
        'Không thể lưu khóa khôi phục an toàn trên trình duyệt. Hãy bật session storage rồi thử lại.',
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
            ? 'Giá sản phẩm vừa thay đổi. Hãy kiểm tra lại trước khi đặt.'
            : cause.code === 'INSUFFICIENT_STOCK'
              ? 'Một sản phẩm không còn đủ hàng. Giỏ đã được tải lại.'
              : 'Giỏ hàng hoặc địa chỉ vừa thay đổi. Hãy kiểm tra và xác nhận lại.',
        );
      } else {
        setError(
          'Chưa nhận được kết quả đặt hàng. Có thể thử lại để kiểm tra cùng yêu cầu.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (status === 'loading')
    return (
      <div className="page-container page-section">
        <p role="status">Đang kiểm tra tài khoản…</p>
      </div>
    );
  if (!user || user.role !== 'CUSTOMER')
    return (
      <div className="page-container page-section">
        <div className="empty-state">
          <ShoppingBag />
          <h1>Đăng nhập để thanh toán</h1>
          <p>Đăng nhập tài khoản khách hàng để đặt hàng.</p>
          <Link className="button-primary" to="/login">
            Đăng nhập
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
                <h2>Sản phẩm đặt mua</h2>
                <p>Giá và số lượng được kiểm tra lại khi đặt.</p>
              </div>
            </div>
            {cart.isPending ? <p role="status">Đang tải giỏ hàng…</p> : null}
            {cart.isError ? (
              <p role="alert">
                Chưa tải được giỏ hàng.{' '}
                <button onClick={() => void cart.refetch()}>Thử lại</button>
              </p>
            ) : null}
            {cart.data && eligible.length === 0 ? (
              <p>
                Giỏ hàng không có sản phẩm khả dụng.{' '}
                <Link to="/cart">Quay lại giỏ hàng</Link>
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
                      : 'Sản phẩm không có phiên bản'}{' '}
                    · SL {item.quantity}
                  </small>
                </span>
                <b>
                  {formatVnd(BigInt(item.priceVnd) * BigInt(item.quantity))}
                </b>
              </label>
            ))}
            {cart.data?.items.some((item) => item.unavailableReason) ? (
              <p role="alert">
                Một số dòng không thể mua và đã bị loại khỏi checkout. Hãy kiểm
                tra giỏ hàng.
              </p>
            ) : null}
          </section>
          <section className="checkout-panel">
            <div className="panel-heading">
              <span className="checkout-number">3</span>
              <div>
                <h2>Thanh toán khi nhận hàng</h2>
                <p>Thanh toán trực tiếp cho nhân viên giao hàng.</p>
              </div>
            </div>
            <label className="checkout-note">
              Ghi chú giao hàng (không bắt buộc)
              <textarea
                value={customerNote}
                maxLength={1000}
                onChange={(event) => setCustomerNote(event.target.value)}
                rows={3}
              />
            </label>
            <div className="checkout-total-row">
              <span>Tiền hàng</span>
              <strong>{formatVnd(subtotal)}</strong>
            </div>
            <div className="checkout-total-row">
              <span>Phí giao hàng</span>
              <strong>{formatVnd(SHIPPING_FEE)}</strong>
            </div>
            <div className="checkout-total-row checkout-grand-total">
              <span>Tổng thanh toán</span>
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
              Chưa tải được địa chỉ.{' '}
              <button onClick={() => void addressesQuery.refetch()}>
                Thử lại
              </button>
            </p>
          ) : null}
          {addresses.length === 0 ? (
            <p className="inline-error">
              Bạn cần thêm địa chỉ trong{' '}
              <Link to="/account?section=addresses">sổ địa chỉ</Link> trước khi
              đặt.
            </p>
          ) : null}
          {pendingRecovery ? (
            <p role="status">Đang kiểm tra kết quả lần đặt trước…</p>
          ) : null}
          <div className="checkout-actions">
            <Link className="button-secondary" to="/cart">
              <ArrowLeft size={16} /> Quay lại giỏ
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
                ? 'Đang kiểm tra đơn trước…'
                : pending
                  ? 'Đang đặt hàng…'
                  : 'Đặt hàng COD'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
