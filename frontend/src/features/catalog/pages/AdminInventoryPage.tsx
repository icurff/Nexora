import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  PackageCheck,
  Search,
} from 'lucide-react';
import {
  getAdminCategories,
  type Category,
} from '../services/admin-categories-api.js';
import { useAuth } from '../../auth/hooks/useAuth.js';
import {
  adjustAdminInventory,
  getAdminInventory,
  getAdminInventoryItem,
  inventoryErrorMessage,
  type InventoryAdjustment,
  type InventoryRow,
} from '../services/admin-inventory-api.js';
import './AdminInventoryPage.css';

const EMPTY_CATEGORIES: Category[] = [];
function categoryTree(
  items: Category[],
  parentId: string | null = null,
  depth = 0,
): Array<{ item: Category; depth: number }> {
  return items
    .filter((item) => item.parentId === parentId)
    .flatMap((item) => [
      { item, depth },
      ...categoryTree(items, item.id, depth + 1),
    ]);
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
function optionsText(row: InventoryRow) {
  if (row.kind === 'PRODUCT') return 'Tồn kho cấp sản phẩm · Không có SKU';
  const entries = Object.entries(row.optionLabels);
  return entries.length
    ? entries.map(([label, value]) => `${label}: ${value}`).join(' · ')
    : 'SKU mặc định';
}
type PendingAdjustment = {
  signature: string;
  key: string;
  type: InventoryAdjustment['type'];
  quantity: number;
  reason: string;
  expectedVersion?: string;
};
function pendingStorageKey(actorId: string, skuId: string) {
  return `nexora.inventory.adjustment.${actorId}.${skuId}`;
}
function readPendingAdjustment(
  actorId: string,
  skuId: string,
): PendingAdjustment | null {
  try {
    const value = localStorage.getItem(pendingStorageKey(actorId, skuId));
    if (!value) return null;
    const parsed = JSON.parse(value) as PendingAdjustment;
    if (
      typeof parsed.key === 'string' &&
      typeof parsed.signature === 'string' &&
      ['RESTOCK', 'ADJUSTMENT', 'STOCKTAKE'].includes(parsed.type) &&
      Number.isInteger(parsed.quantity) &&
      typeof parsed.reason === 'string'
    )
      return parsed;
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return null;
}

export function AdminInventoryPage() {
  const [params, setParams] = useSearchParams();
  const skuId = params.get('skuId');
  return (
    <main className="admin-inventory-page">
      {skuId ? (
        <InventoryDetail
          skuId={skuId}
          onBack={() => {
            const next = new URLSearchParams(params);
            next.delete('skuId');
            next.delete('historyPage');
            setParams(next);
          }}
        />
      ) : (
        <InventoryList params={params} setParams={setParams} />
      )}
    </main>
  );
}

function InventoryList({
  params,
  setParams,
}: {
  params: URLSearchParams;
  setParams: (params: URLSearchParams) => void;
}) {
  const page = Math.max(1, Number(params.get('page') || 1));
  const query = useQuery({
    queryKey: ['admin', 'inventory', params.toString()],
    queryFn: () => getAdminInventory(new URLSearchParams(params)),
    retry: false,
  });
  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: getAdminCategories,
    retry: false,
  });
  const categories = useMemo(
    () => categoryTree(categoriesQuery.data ?? EMPTY_CATEGORIES),
    [categoriesQuery.data],
  );
  const [q, setQ] = useState(params.get('q') ?? '');
  const [categoryId, setCategoryId] = useState(params.get('categoryId') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [availability, setAvailability] = useState(
    params.get('availability') ?? '',
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set('q', q.trim());
    if (categoryId) next.set('categoryId', categoryId);
    if (status) next.set('status', status);
    if (availability) next.set('availability', availability);
    if (params.get('productId'))
      next.set('productId', params.get('productId')!);
    setParams(next);
  }
  const changePage = (nextPage: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(nextPage));
    setParams(next);
  };

  return (
    <>
      <div className="admin-inventory-heading">
        <div>
          <span className="admin-inventory-kicker">CATALOG / KHO</span>
          <h1>Quản lý tồn kho</h1>
          <p>Theo dõi tồn kho theo SKU hoặc trực tiếp ở cấp sản phẩm.</p>
        </div>
        <div className="inventory-count">
          <PackageCheck size={17} />
          <span>{query.data?.total ?? '—'} mặt hàng</span>
        </div>
      </div>
      <form className="inventory-filters" onSubmit={submit}>
        <label className="inventory-search">
          <span>Tìm sản phẩm hoặc mã SKU</span>
          <div>
            <Search size={16} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Tên sản phẩm, NX-SKU…"
            />
          </div>
        </label>
        <label>
          <span>Danh mục</span>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Tất cả danh mục</option>
            {categories.map(({ item, depth }) => (
              <option key={item.id} value={item.id}>
                {'　'.repeat(depth)}
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sản phẩm</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Mọi trạng thái</option>
            <option value="ACTIVE">Đang bán</option>
            <option value="INACTIVE">Ngừng bán</option>
          </select>
        </label>
        <label>
          <span>Tình trạng kho</span>
          <select
            value={availability}
            onChange={(event) => setAvailability(event.target.value)}
          >
            <option value="">Tất cả</option>
            <option value="IN_STOCK">Còn hàng</option>
            <option value="OUT_OF_STOCK">Hết hàng</option>
          </select>
        </label>
        <button className="inventory-primary" type="submit">
          <Search size={15} /> Lọc
        </button>
      </form>
      {params.get('productId') ? (
        <div className="inventory-product-filter">
          Đang lọc theo sản phẩm{' '}
          <button
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params);
              next.delete('productId');
              next.delete('page');
              setParams(next);
            }}
          >
            Bỏ lọc
          </button>
        </div>
      ) : null}
      {query.isPending ? (
        <div className="inventory-state">
          <LoaderCircle className="inventory-spin" /> Đang tải tồn kho…
        </div>
      ) : query.isError ? (
        <div className="inventory-state inventory-state-error">
          {inventoryErrorMessage(query.error)}{' '}
          <button onClick={() => void query.refetch()}>Thử lại</button>
        </div>
      ) : !query.data?.items.length ? (
        <div className="inventory-state">
          Không tìm thấy mặt hàng tồn kho phù hợp.
        </div>
      ) : (
        <>
          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Sản phẩm / SKU</th>
                  <th>Lựa chọn</th>
                  <th>Trạng thái</th>
                  <th>Tồn thực tế</th>
                  <th>Đang giữ</th>
                  <th>Có thể bán</th>
                  <th>Cập nhật</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={`${row.kind}:${row.skuId ?? row.product.id}`}>
                    <td>
                      <Link
                        to={`/admin/products/${row.product.id}/edit`}
                        className="inventory-product-link"
                      >
                        <strong>{row.product.name}</strong>
                        <small>
                          {row.kind === 'SKU' ? row.sku : 'Tồn cấp sản phẩm'} ·{' '}
                          {row.product.category.name}
                        </small>
                      </Link>
                    </td>
                    <td>{optionsText(row)}</td>
                    <td>
                      <span
                        className={`inventory-status ${row.product.status.toLowerCase()}`}
                      >
                        {row.product.status === 'ACTIVE'
                          ? 'Đang bán'
                          : 'Ngừng bán'}
                      </span>
                    </td>
                    <td className="inventory-number">
                      {row.onHand.toLocaleString('vi-VN')}
                    </td>
                    <td>{row.reserved.toLocaleString('vi-VN')}</td>
                    <td
                      className={
                        row.available === 0
                          ? 'inventory-out'
                          : 'inventory-number'
                      }
                    >
                      {row.available.toLocaleString('vi-VN')}
                    </td>
                    <td>{formatTime(row.updatedAt)}</td>
                    <td>
                      {row.kind === 'SKU' ? (
                        <button
                          className="inventory-row-link"
                          onClick={() => {
                            const next = new URLSearchParams(params);
                            next.set('skuId', row.skuId);
                            setParams(next);
                          }}
                        >
                          Chi tiết <ArrowRight size={14} />
                        </button>
                      ) : (
                        <Link
                          className="inventory-row-link"
                          to={`/admin/products/${row.product.id}/edit`}
                        >
                          Quản lý <ArrowRight size={14} />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inventory-pagination">
            <span>
              Trang {query.data.page} / {Math.max(1, query.data.totalPages)} ·{' '}
              {query.data.total} mặt hàng
            </span>
            <div>
              <button disabled={page <= 1} onClick={() => changePage(page - 1)}>
                Trước
              </button>
              <button
                disabled={page >= query.data.totalPages}
                onClick={() => changePage(page + 1)}
              >
                Sau
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function InventoryDetail({
  skuId,
  onBack,
}: {
  skuId: string;
  onBack: () => void;
}) {
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['admin', 'inventory-item', skuId],
    queryFn: () => getAdminInventoryItem(skuId),
    retry: false,
  });
  const { user } = useAuth();
  const actorId = user?.id ?? 'unknown';
  const [pendingAdjustment] = useState(() =>
    readPendingAdjustment(actorId, skuId),
  );
  const attempt = useRef<PendingAdjustment | null>(pendingAdjustment);
  const [type, setType] = useState<InventoryAdjustment['type']>(
    pendingAdjustment?.type ?? 'RESTOCK',
  );
  const [quantity, setQuantity] = useState(
    pendingAdjustment ? String(pendingAdjustment.quantity) : '',
  );
  const [reason, setReason] = useState(pendingAdjustment?.reason ?? '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const mutation = useMutation({
    mutationFn: (input: InventoryAdjustment) =>
      adjustAdminInventory(skuId, input),
    onSuccess: async () => {
      attempt.current = null;
      try {
        localStorage.removeItem(pendingStorageKey(actorId, skuId));
      } catch {
        /* Ignore unavailable storage after success. */
      }
      setError('');
      setSuccess('Đã cập nhật tồn kho.');
      setQuantity('');
      setReason('');
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['admin', 'inventory-item', skuId],
        }),
        client.invalidateQueries({ queryKey: ['admin', 'inventory'] }),
      ]);
    },
    onError: (errorValue) => {
      setSuccess('');
      setError(inventoryErrorMessage(errorValue));
      if (
        (errorValue as { code?: string }).code === 'INVENTORY_VERSION_CONFLICT'
      ) {
        attempt.current = null;
        try {
          localStorage.removeItem(pendingStorageKey(actorId, skuId));
        } catch {
          /* Ignore unavailable storage. */
        }
        void client.invalidateQueries({
          queryKey: ['admin', 'inventory-item', skuId],
        });
      }
    },
  });
  const row = detail.data;
  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    const numeric = Number(quantity);
    if (!Number.isInteger(numeric) || quantity.trim() === '') {
      setError('Nhập số lượng nguyên hợp lệ.');
      return;
    }
    if (!reason.trim()) {
      setError('Nhập lý do điều chỉnh.');
      return;
    }
    if (type === 'RESTOCK' && numeric <= 0) {
      setError('Số lượng nhập phải lớn hơn 0.');
      return;
    }
    if (type === 'ADJUSTMENT' && numeric === 0) {
      setError('Mức điều chỉnh phải khác 0.');
      return;
    }
    if (type === 'STOCKTAKE' && numeric < 0) {
      setError('Tồn kiểm kê không được âm.');
      return;
    }
    if (!row) return;
    const signature = JSON.stringify([type, numeric, reason.trim()]);
    if (attempt.current?.signature !== signature) {
      attempt.current = {
        signature,
        key: crypto.randomUUID(),
        type,
        quantity: numeric,
        reason: reason.trim(),
        ...(type === 'STOCKTAKE' ? { expectedVersion: row.version } : {}),
      };
      try {
        localStorage.setItem(
          pendingStorageKey(actorId, skuId),
          JSON.stringify(attempt.current),
        );
      } catch {
        /* The API key still protects retries in this page session. */
      }
    }
    mutation.mutate({
      idempotencyKey: attempt.current.key,
      type,
      quantity: numeric,
      reason: reason.trim(),
      ...(type === 'STOCKTAKE'
        ? { expectedVersion: attempt.current.expectedVersion }
        : {}),
    });
  }

  if (detail.isPending)
    return (
      <div className="inventory-state">
        <LoaderCircle className="inventory-spin" /> Đang tải SKU…
      </div>
    );
  if (detail.isError || !row)
    return (
      <div className="inventory-state inventory-state-error">
        <button onClick={onBack}>
          <ArrowLeft size={15} /> Quay lại danh sách
        </button>{' '}
        {inventoryErrorMessage(detail.error)}
      </div>
    );
  const delta =
    type === 'STOCKTAKE'
      ? Number(quantity || 0) - row.onHand
      : Number(quantity || 0);

  return (
    <>
      <button className="inventory-back" onClick={onBack}>
        <ArrowLeft size={15} /> Danh sách tồn kho
      </button>
      <div className="admin-inventory-heading inventory-detail-heading">
        <div>
          <span className="admin-inventory-kicker">CHI TIẾT SKU</span>
          <h1>{row.product.name}</h1>
          <p>
            {row.sku} · {optionsText(row)} ·{' '}
            <Link to={`/admin/products/${row.product.id}/edit`}>
              Mở sản phẩm
            </Link>
          </p>
        </div>
        <span
          className={`inventory-status ${row.product.status.toLowerCase()}`}
        >
          {row.product.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng bán'}
        </span>
      </div>
      <div className="inventory-metrics">
        <article>
          <span>Tồn thực tế</span>
          <strong>{row.onHand.toLocaleString('vi-VN')}</strong>
        </article>
        <article>
          <span>Đang giữ</span>
          <strong>{row.reserved.toLocaleString('vi-VN')}</strong>
        </article>
        <article>
          <span>Có thể bán</span>
          <strong>{row.available.toLocaleString('vi-VN')}</strong>
        </article>
      </div>
      {row.deleted ? (
        <div className="inventory-notice">
          SKU đã xóa mềm. Có thể xem tồn và lịch sử, nhưng không thể điều chỉnh.
        </div>
      ) : (
        <form className="inventory-adjust-form" onSubmit={submit}>
          <div className="inventory-section-heading">
            <div>
              <h2>Điều chỉnh tồn</h2>
              <p>
                Mỗi thay đổi được lưu vào lịch sử cùng tài khoản Admin và lý do.
              </p>
            </div>
          </div>
          <div className="inventory-form-grid">
            <label>
              Loại thao tác
              <select
                value={type}
                onChange={(event) => {
                  setType(event.target.value as InventoryAdjustment['type']);
                  setError('');
                }}
              >
                <option value="RESTOCK">Nhập hàng · cộng tồn</option>
                <option value="ADJUSTMENT">Điều chỉnh tăng / giảm</option>
                <option value="STOCKTAKE">Kiểm kê · đặt tồn thực tế</option>
              </select>
            </label>
            <label>
              {type === 'STOCKTAKE'
                ? 'Tồn thực tế sau kiểm kê'
                : type === 'RESTOCK'
                  ? 'Số lượng nhập'
                  : 'Mức điều chỉnh (+ / −)'}
              <input
                type="number"
                step="1"
                min={type === 'RESTOCK' || type === 'STOCKTAKE' ? 0 : undefined}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder={
                  type === 'STOCKTAKE'
                    ? String(row.onHand)
                    : 'Ví dụ: 12 hoặc -2'
                }
              />
            </label>
            <label className="inventory-reason">
              Lý do
              <textarea
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ví dụ: Nhập hàng từ nhà cung cấp, kiểm kê cuối ngày…"
              />
            </label>
          </div>
          <div className="inventory-preview">
            {type === 'STOCKTAKE' ? (
              <>
                Chênh lệch dự kiến:{' '}
                <strong className={delta < 0 ? 'negative' : ''}>
                  {delta > 0 ? '+' : ''}
                  {delta.toLocaleString('vi-VN')}
                </strong>{' '}
                · Tồn sau kiểm kê:{' '}
                <strong>{Number(quantity || 0).toLocaleString('vi-VN')}</strong>
              </>
            ) : (
              <>
                Tồn sau thao tác dự kiến:{' '}
                <strong>
                  {(
                    row.onHand +
                    (type === 'RESTOCK'
                      ? Math.max(0, Number(quantity || 0))
                      : Number(quantity || 0))
                  ).toLocaleString('vi-VN')}
                </strong>
              </>
            )}
          </div>
          {error ? (
            <div className="inventory-form-message error" role="alert">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="inventory-form-message success" role="status">
              {success}
            </div>
          ) : null}
          <button
            className="inventory-primary"
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className="inventory-spin" size={15} />
            ) : (
              <PackageCheck size={15} />
            )}{' '}
            {mutation.isPending ? 'Đang lưu…' : 'Xác nhận điều chỉnh'}
          </button>
        </form>
      )}
    </>
  );
}
