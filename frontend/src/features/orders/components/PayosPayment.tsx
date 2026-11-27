import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Copy } from 'lucide-react';
import { formatVnd } from '../../catalog/services/public-catalog-api.js';
import { createPayosLink } from '../services/order-api.js';
import './PayosPayment.css';

export function PayosPayment({
  orderId,
  amount,
  expiresAt,
}: {
  orderId: string;
  amount: string;
  expiresAt: string;
}) {
  const [copied, setCopied] = useState('');
  const [expired, setExpired] = useState(
    () => Date.now() >= Date.parse(expiresAt),
  );
  useEffect(() => {
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now());
    const timer = window.setTimeout(() => setExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  const payment = useQuery({
    queryKey: ['payos-payment', orderId],
    queryFn: () => createPayosLink(orderId),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    enabled: !expired,
  });

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied`);
    } catch {
      setCopied('Unable to copy. Select the text to copy it manually.');
    }
  }

  const details = expired ? null : payment.data?.paymentDetails;
  return (
    <section className="payos-payment" aria-labelledby="payos-payment-title">
      <div className="payos-payment-heading">
        <div>
          <h2 id="payos-payment-title">Pay with payOS</h2>
          <p>
            Scan the QR code with your banking app to complete your payment.
          </p>
        </div>
        <strong>{formatVnd(amount)}</strong>
      </div>
      {expired ? (
        <p role="status">
          This payment has expired. Please check your order status.
        </p>
      ) : null}
      {!expired && payment.isPending ? (
        <p role="status">Preparing payment details…</p>
      ) : null}
      {!expired && payment.isError ? (
        <p role="alert">
          Payment details are unavailable.{' '}
          <button type="button" onClick={() => void payment.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
      {!expired && payment.data && !details?.qrCode ? (
        <p>
          Payment details for this existing link are unavailable.{' '}
          <a href={payment.data.checkoutUrl} target="_blank" rel="noreferrer">
            Open your existing payOS payment page
          </a>
          .
        </p>
      ) : null}
      {details?.qrCode ? (
        <div className="payos-payment-content">
          <div className="payos-qr">
            <QRCodeSVG
              value={details.qrCode}
              size={200}
              level="M"
              marginSize={4}
              aria-label="Bank transfer QR code"
            />
          </div>
          <dl className="payos-payment-details">
            <div>
              <dt>Bank code</dt>
              <dd>{details.bin}</dd>
            </div>
            <div>
              <dt>Account number</dt>
              <dd>
                {details.accountNumber}
                <button
                  type="button"
                  onClick={() =>
                    void copy(details.accountNumber, 'Account number')
                  }
                  aria-label="Copy account number"
                >
                  <Copy size={15} />
                </button>
              </dd>
            </div>
            <div>
              <dt>Account name</dt>
              <dd>{details.accountName}</dd>
            </div>
            <div>
              <dt>Transfer note</dt>
              <dd>
                {details.description}
                <button
                  type="button"
                  onClick={() =>
                    void copy(details.description, 'Transfer note')
                  }
                  aria-label="Copy transfer note"
                >
                  <Copy size={15} />
                </button>
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
      {copied ? (
        <p role="status" className="payos-payment-feedback">
          {copied}
        </p>
      ) : null}
      <p className="payos-payment-status">
        {expired ? 'Expired' : 'Awaiting payment confirmation · Expires'}{' '}
        {new Intl.DateTimeFormat('vi-VN', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Ho_Chi_Minh',
        }).format(new Date(expiresAt))}
      </p>
    </section>
  );
}
