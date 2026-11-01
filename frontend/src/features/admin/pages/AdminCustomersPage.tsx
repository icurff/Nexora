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
    ? 'Tài khoản hiện tại không có quyền quản lý khách hàng.'
    : 'Không thể tải dữ liệu. Vui lòng thử lại.';

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
          <LoaderCircle className="spin" /> Đang tải thông tin khách hàng...
        </div>
      );
    if (detail.isError)
      return (
        <div className="customer-state">
          <p>{errorText(detail.error)}</p>
          <button onClick={() => void detail.refetch()}>Thử lại</button>
        </div>
      );
    const customer = detail.data;
    return (
      <div className="admin-customers-page">
        <Link className="customer-back" to="/admin/users">
          <ArrowLeft size={16} /> Danh sách khách hàng
        </Link>
        <header className="customer-heading">
          <div>
            <span>KHÁCH HÀNG NEXORA</span>
            <h1>{customer.fullName}</h1>
            <p>Thông tin và trạng thái tài khoản.</p>
          </div>
          <span className={`customer-status ${customer.status.toLowerCase()}`}>
            {customer.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}
          </span>
        </header>
        <section className="customer-detail-card">
          <h2>
            <ShieldCheck size={19} /> Thông tin tài khoản
          </h2>
          <dl>
            <div>
              <dt>Họ và tên</dt>
              <dd>{customer.fullName}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{customer.email}</dd>
            </div>
            <div>
              <dt>Số điện thoại</dt>
              <dd>{customer.phone || 'Chưa cung cấp'}</dd>
            </div>
            <div>
              <dt>Ngày tạo</dt>
              <dd>{date(customer.createdAt)}</dd>
            </div>
            <div>
              <dt>Trạng thái</dt>
              <dd>
                {customer.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đã khóa'}
              </dd>
            </div>
            {customer.status === 'LOCKED' ? (
              <>
                <div>
                  <dt>Thời điểm khóa</dt>
                  <dd>
                    {customer.lockedAt ? dateTime(customer.lockedAt) : '—'}
                  </dd>
                </div>
                <div className="customer-reason">
                  <dt>Lý do khóa</dt>
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
                <LockKeyhole size={16} /> Khóa tài khoản
              </button>
            ) : (
              <button
                className="primary-action"
                disabled={unlock.isPending}
                onClick={() => {
                  if (window.confirm('Mở khóa tài khoản này?')) unlock.mutate();
                }}
              >
                <UnlockKeyhole size={16} />{' '}
                {unlock.isPending ? 'Đang mở khóa...' : 'Mở khóa'}
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
              <h2 id="lock-title">Khóa tài khoản</h2>
              <p>
                Khách hàng sẽ bị đăng xuất khỏi các phiên hiện tại. Đơn hàng
                hiện có không bị hủy.
              </p>
              <label htmlFor="lock-reason">Lý do khóa</label>
              <textarea
                id="lock-reason"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoFocus
              />
              <small>{reason.trim().length}/500 ký tự</small>
              {lock.isError ? (
                <p role="alert">{errorText(lock.error)}</p>
              ) : null}
              <div>
                <button
                  onClick={() => setShowLock(false)}
                  disabled={lock.isPending}
                >
                  Hủy
                </button>
                <button
                  className="danger-action"
                  disabled={!reason.trim() || lock.isPending}
                  onClick={() => lock.mutate()}
                >
                  {lock.isPending ? 'Đang khóa...' : 'Xác nhận khóa'}
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
          <span>KHÁCH HÀNG NEXORA</span>
          <h1>Quản lý khách hàng</h1>
          <p>Tìm kiếm và quản lý trạng thái tài khoản Customer.</p>
        </div>
      </header>
      <section className="customer-list-card">
        <div className="customer-toolbar">
          <label className="customer-search">
            <Search size={17} />
            <input
              aria-label="Tìm theo tên hoặc email"
              placeholder="Tìm tên hoặc email..."
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Lọc trạng thái"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="LOCKED">Đã khóa</option>
          </select>
        </div>
        {list.isPending ? (
          <div className="customer-state">
            <LoaderCircle className="spin" /> Đang tải khách hàng...
          </div>
        ) : list.isError ? (
          <div className="customer-state">
            <p>{errorText(list.error)}</p>
            <button onClick={() => void list.refetch()}>Thử lại</button>
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="customer-state">
            Không tìm thấy khách hàng phù hợp.
          </div>
        ) : (
          <>
            <div className="customer-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>KHÁCH HÀNG</th>
                    <th>EMAIL</th>
                    <th>ĐIỆN THOẠI</th>
                    <th>NGÀY THAM GIA</th>
                    <th>TRẠNG THÁI</th>
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
                            ? 'Đang hoạt động'
                            : 'Đã khóa'}
                        </span>
                      </td>
                      <td>
                        <Link to={`/admin/users/${customer.id}`}>
                          Chi tiết <ChevronRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="customer-pagination">
              <span>
                {list.data.total} khách hàng · Trang {page}/{totalPages}
              </span>
              <div>
                <button
                  aria-label="Trang trước"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  aria-label="Trang sau"
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
