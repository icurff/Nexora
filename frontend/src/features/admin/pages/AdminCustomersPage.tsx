import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
  UnlockKeyhole,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../services/api-client';
import {
  getCustomer,
  getCustomers,
  lockCustomer,
  unlockCustomer,
} from '../services/admin-customers-api';
import './AdminCustomersPage.css';

const date = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
const dateTime = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
const errorText = (error: unknown) =>
  error instanceof ApiError && error.status === 403
    ? 'Your account cannot manage customers.'
    : 'Unable to load data. Please try again.';

export function AdminCustomersPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState('');
  const [showLock, setShowLock] = useState(false);
  const list = useQuery({
    queryKey: ['admin', 'customers', q, status, page],
    queryFn: () =>
      getCustomers({
        q: q || undefined,
        status: status || undefined,
        page,
        pageSize: 20,
      }),
    enabled: !id,
  });
  const detail = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () => getCustomer(id!),
    enabled: Boolean(id),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['admin', 'customers'] });
    void client.invalidateQueries({ queryKey: ['admin', 'customer', id] });
  };
  const lock = useMutation({
    mutationFn: () => lockCustomer(id!, reason),
    onSuccess: (customer) => {
      client.setQueryData(['admin', 'customer', id], customer);
      setShowLock(false);
      setReason('');
      refresh();
    },
  });
  const unlock = useMutation({
    mutationFn: () => unlockCustomer(id!),
    onSuccess: (customer) => {
      client.setQueryData(['admin', 'customer', id], customer);
      refresh();
    },
  });

  if (id) {
    if (detail.isPending)
      return (
        <div className="customer-state">
          <LoaderCircle className="spin" /> Loading customer details...
        </div>
      );
    if (detail.isError)
      return (
        <div className="customer-state">
          <p>{errorText(detail.error)}</p>
          <button onClick={() => void detail.refetch()}>Try again</button>
        </div>
      );
    const customer = detail.data;
    return (
      <div className="admin-customers-page">
        <Link className="customer-back" to="/admin/users">
          <ArrowLeft size={16} /> Customer list
        </Link>
        <header className="customer-heading">
          <div>
            <h1>{customer.fullName}</h1>
            <p>Account information and status.</p>
          </div>
          <span className={`customer-status ${customer.status.toLowerCase()}`}>
            {customer.status === 'ACTIVE' ? 'Active' : 'Locked'}
          </span>
        </header>
        <section className="customer-detail-card">
          <h2>
            <ShieldCheck size={19} /> Account information
          </h2>
          <dl>
            <div>
              <dt>Full name</dt>
              <dd>{customer.fullName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{customer.email}</dd>
            </div>
            <div>
              <dt>Phone number</dt>
              <dd>{customer.phone || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{date(customer.createdAt)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {customer.status === 'ACTIVE' ? 'Active' : 'Locked'}
              </dd>
            </div>
            {customer.status === 'LOCKED' ? (
              <>
                <div>
                  <dt>Locked at</dt>
                  <dd>
                    {customer.lockedAt ? dateTime(customer.lockedAt) : '—'}
                  </dd>
                </div>
                <div className="customer-reason">
                  <dt>Lock reason</dt>
                  <dd>{customer.lockReason}</dd>
                </div>
              </>
            ) : null}
          </dl>
          <div className="customer-actions">
            {customer.status === 'ACTIVE' ? (
              <button
                className="danger-action"
                onClick={() => setShowLock(true)}
              >
                <LockKeyhole size={16} /> Lock account
              </button>
            ) : (
              <button
                className="primary-action"
                disabled={unlock.isPending}
                onClick={() => {
                  if (window.confirm('Unlock this account?')) unlock.mutate();
                }}
              >
                <UnlockKeyhole size={16} />{' '}
                {unlock.isPending ? 'Unlocking...' : 'Unlock'}
              </button>
            )}
            {unlock.isError || lock.isError ? (
              <p role="alert">{errorText(unlock.error ?? lock.error)}</p>
            ) : null}
          </div>
        </section>
        {showLock ? (
          <div className="customer-dialog-backdrop">
            <section
              className="customer-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="lock-title"
            >
              <h2 id="lock-title">Lock account</h2>
              <p>
                The customer will be signed out of current sessions. Existing orders will not be cancelled.
              </p>
              <label htmlFor="lock-reason">Lock reason</label>
              <textarea
                id="lock-reason"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoFocus
              />
              <small>{reason.trim().length}/500 characters</small>
              {lock.isError ? (
                <p role="alert">{errorText(lock.error)}</p>
              ) : null}
              <div>
                <button
                  onClick={() => setShowLock(false)}
                  disabled={lock.isPending}
                >
                  Cancel
                </button>
                <button
                  className="danger-action"
                  disabled={!reason.trim() || lock.isPending}
                  onClick={() => lock.mutate()}
                >
                  {lock.isPending ? 'Locking...' : 'Confirm lock'}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  return (
    <div className="admin-customers-page">
      <header className="customer-heading">
        <div>
          <h1>Manage customers</h1>
          <p>Search customers and manage account status.</p>
        </div>
      </header>
      <section className="customer-list-card">
        <div className="customer-toolbar">
          <label className="customer-search">
            <Search size={17} />
            <input
              aria-label="Search by name or email"
              placeholder="Search name or email..."
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="LOCKED">Locked</option>
          </select>
        </div>
        {list.isPending ? (
          <div className="customer-state">
            <LoaderCircle className="spin" /> Loading customers...
          </div>
        ) : list.isError ? (
          <div className="customer-state">
            <p>{errorText(list.error)}</p>
            <button onClick={() => void list.refetch()}>Try again</button>
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="customer-state">
            No matching customers found.
          </div>
        ) : (
          <>
            <div className="customer-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>CUSTOMER</th>
                    <th>EMAIL</th>
                    <th>PHONE</th>
                    <th>JOINED</th>
                    <th>STATUS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <Link
                          to={`/admin/users/${customer.id}`}
                          className="customer-name"
                        >
                          {customer.fullName}
                        </Link>
                      </td>
                      <td>{customer.email}</td>
                      <td>{customer.phone || '—'}</td>
                      <td>{date(customer.createdAt)}</td>
                      <td>
                        <span
                          className={`customer-status ${customer.status.toLowerCase()}`}
                        >
                          {customer.status === 'ACTIVE'
                            ? 'Active'
                            : 'Locked'}
                        </span>
                      </td>
                      <td>
                        <Link to={`/admin/users/${customer.id}`}>
                          Details <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="customer-pagination">
              <span>
                {list.data.total} customers · Page {page}/{totalPages}
              </span>
              <div>
                <button
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  aria-label="Next page"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
