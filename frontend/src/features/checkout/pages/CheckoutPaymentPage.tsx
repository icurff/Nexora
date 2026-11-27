import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ApiError } from '../../../services/api-client.js';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { PayosPayment } from '../../orders/components/PayosPayment.js';
import { getOrder } from '../../orders/services/order-api.js';
import '../CheckoutAddress.css';
import './CheckoutPaymentPage.css';

export function CheckoutPaymentPage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sawUnpaidRef = useRef(false);
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.paymentMethod === 'PAYOS' &&
      query.state.data?.paymentStatus === 'UNPAID' &&
      query.state.data?.status === 'PENDING'
        ? 1000
        : false,
  });
  const loadedOrderId = order.data?.id;
  const paymentStatus = order.data?.paymentStatus;

  useEffect(() => {
    if (!loadedOrderId || !paymentStatus) return;
    if (paymentStatus === 'UNPAID') {
      sawUnpaidRef.current = true;
      return;
    }
    if (paymentStatus === 'PAID') {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      const delay = sawUnpaidRef.current ? 1500 : 0;
      const timer = window.setTimeout(() => {
        navigate(`/account/orders/${loadedOrderId}`, { replace: true });
      }, delay);
      return () => window.clearTimeout(timer);
    }
  }, [loadedOrderId, navigate, paymentStatus, queryClient]);

  if (order.isPending)
    return (
      <div className="page-container page-section">
        <p role="status">Loading payment details…</p>
      </div>
    );

  if (order.isError || !order.data) {
    const notFound =
      order.error instanceof ApiError &&
      [403, 404].includes(order.error.status);
    return (
      <div className="page-container page-section checkout-payment-page">
        <h1>{notFound ? 'Order not found' : 'Unable to load your order'}</h1>
        <p>
          {notFound
            ? 'This order is unavailable for your account.'
            : 'Please try again to view your payment.'}
        </p>
        {!notFound ? (
          <button
            className="button-secondary"
            onClick={() => void order.refetch()}
          >
            Try again
          </button>
        ) : null}
        <Link className="continue-link" to="/account/orders">
          <ArrowLeft size={15} /> Order list
        </Link>
      </div>
    );
  }

  const current = order.data;
  const canPay =
    current.paymentMethod === 'PAYOS' &&
    current.paymentStatus === 'UNPAID' &&
    current.status === 'PENDING';
  return (
    <div className="page-container page-section checkout-payment-page">
      <Link className="continue-link" to={`/account/orders/${current.id}`}>
        <ArrowLeft size={15} /> Order details
      </Link>
      <div className="checkout-payment-header">
        <div>
          <h1>Payment</h1>
          <p>Order {current.id}</p>
        </div>
        <span className="checkout-payment-header-status">
          {current.paymentStatus === 'PAID' ? 'Paid' : 'Unpaid'}
        </span>
      </div>
      <div className="checkout-payment-layout">
        <div className="checkout-payment-main">
          {searchParams.get('payment') === 'cancel' && canPay ? (
            <p role="status" className="checkout-payment-notice">
              Payment was not completed. You can continue below while the order
              is active.
            </p>
          ) : null}
          {canPay ? (
            <PayosPayment
              orderId={current.id}
              amount={current.totalAmount}
              expiresAt={current.expiresAt}
            />
          ) : current.paymentStatus === 'PAID' ? (
            <section className="checkout-payment-result" role="status">
              <CheckCircle2 size={24} />
              <div>
                <h2>Payment confirmed</h2>
                <p>
                  Your payment has been received. Redirecting to your order
                  details…
                </p>
              </div>
            </section>
          ) : (
            <section className="checkout-payment-result">
              <div>
                <h2>Payment unavailable</h2>
                <p>
                  {current.paymentMethod !== 'PAYOS'
                    ? 'This order uses cash on delivery.'
                    : 'This order is no longer available for payment.'}
                </p>
              </div>
            </section>
          )}
          <Link
            className="button-secondary checkout-payment-order-link"
            to={`/account/orders/${current.id}`}
          >
            View order details
          </Link>
        </div>
        <aside className="checkout-payment-summary" aria-label="Order summary">
          <h2>Order summary</h2>
          {current.items.map((item) => (
            <div className="checkout-payment-item" key={item.id}>
              <span>
                {item.productName} <small>× {item.quantity}</small>
              </span>
              <strong>
                {formatVnd(BigInt(item.unitPrice) * BigInt(item.quantity))}
              </strong>
            </div>
          ))}
          <div className="checkout-total-row">
            <span>Subtotal</span>
            <strong>{formatVnd(current.subtotal)}</strong>
          </div>
          <div className="checkout-total-row">
            <span>Shipping</span>
            <strong>{formatVnd(current.shippingFee)}</strong>
          </div>
          <div className="checkout-total-row checkout-grand-total">
            <span>Total</span>
            <strong>{formatVnd(current.totalAmount)}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
