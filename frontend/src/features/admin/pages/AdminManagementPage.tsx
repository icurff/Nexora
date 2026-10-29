import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Check,
  Download,
  Filter,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { BrandLogo } from '../../../components/BrandLogo';
import {
  demoOrders,
  demoProducts,
  formatVnd,
} from '../../catalog/demo-data.js';

type ManagementKind =
  | 'products'
  | 'categories'
  | 'coupons'
  | 'orders'
  | 'reviews'
  | 'users'
  | 'notifications'
  | 'settings';
type RecordRow = { id: string; values: string[]; status?: string };
const configs: Record<
  ManagementKind,
  {
    title: string;
    eyebrow: string;
    description: string;
    button: string;
    columns: string[];
    initial: RecordRow[];
    filters?: string[];
  }
> = {
  products: {
    title: 'Sản phẩm',
    eyebrow: 'DANH MỤC CỬA HÀNG',
    description: 'Quản lý sản phẩm, giá bán và tình trạng hiển thị.',
    button: 'Thêm sản phẩm',
    columns: ['SẢN PHẨM', 'DANH MỤC', 'GIÁ BÁN', 'TỒN KHO', 'TRẠNG THÁI'],
    initial: demoProducts.slice(0, 6).map((p) => ({
      id: p.id,
      values: [
        p.name,
        p.category,
        formatVnd(p.price),
        `${p.stock} sản phẩm`,
        'Đang bán',
      ],
      status: 'Đang bán',
    })),
  },
  categories: {
    title: 'Danh mục',
    eyebrow: 'TỔ CHỨC CỬA HÀNG',
    description: 'Sắp xếp nhóm sản phẩm để khách hàng dễ khám phá.',
    button: 'Thêm danh mục',
    columns: ['TÊN DANH MỤC', 'MÔ TẢ', 'SẢN PHẨM', 'TRẠNG THÁI'],
    initial: [
      {
        id: 'C01',
        values: ['Thời trang', 'Phong cách mỗi ngày', '2', 'Đang hiển thị'],
        status: 'Đang hiển thị',
      },
      {
        id: 'C02',
        values: [
          'Nhà cửa & đời sống',
          'Thêm cảm hứng cho không gian sống',
          '3',
          'Đang hiển thị',
        ],
        status: 'Đang hiển thị',
      },
      {
        id: 'C03',
        values: [
          'Thiết bị số',
          'Công nghệ trong tầm tay',
          '1',
          'Đang hiển thị',
        ],
        status: 'Đang hiển thị',
      },
      {
        id: 'C04',
        values: ['Phụ kiện', 'Những món đồ nhỏ hữu ích', '2', 'Đang hiển thị'],
        status: 'Đang hiển thị',
      },
    ],
  },
  coupons: {
    title: 'Mã giảm giá',
    eyebrow: 'ƯU ĐÃI & CHIẾN DỊCH',
    description: 'Tạo chương trình ưu đãi và theo dõi hiệu quả sử dụng.',
    button: 'Tạo mã giảm giá',
    columns: [
      'MÃ ƯU ĐÃI',
      'LOẠI ƯU ĐÃI',
      'LƯỢT DÙNG',
      'HẠN SỬ DỤNG',
      'TRẠNG THÁI',
    ],
    initial: [
      {
        id: 'NEXORA50',
        values: [
          'NEXORA50',
          'Giảm 50.000 ₫',
          '28 / 100',
          '30/11/2026',
          'Đang hoạt động',
        ],
        status: 'Đang hoạt động',
      },
      {
        id: 'WELCOME10',
        values: [
          'WELCOME10',
          'Giảm 10%',
          '64 / 100',
          '15/11/2026',
          'Đang hoạt động',
        ],
        status: 'Đang hoạt động',
      },
      {
        id: 'FREESHIP',
        values: [
          'FREESHIP',
          'Miễn phí giao hàng',
          'Đã hết hạn',
          '20/10/2026',
          'Đã kết thúc',
        ],
        status: 'Đã kết thúc',
      },
    ],
  },
  orders: {
    title: 'Đơn hàng',
    eyebrow: 'VẬN HÀNH CỬA HÀNG',
    description: 'Theo dõi trạng thái xử lý và giao hàng của đơn.',
    button: 'Xuất danh sách',
    columns: ['MÃ ĐƠN', 'KHÁCH HÀNG', 'NGÀY ĐẶT', 'TỔNG TIỀN', 'TRẠNG THÁI'],
    initial: demoOrders.map((o, i) => ({
      id: o.id,
      values: [
        o.id,
        ['Minh Anh Nguyễn', 'Quốc Bảo Trần', 'Hà My Lê'][i],
        o.date,
        formatVnd(o.total),
        o.status,
      ],
      status: o.status,
    })),
    filters: ['Tất cả', 'Đang giao', 'Đã giao', 'Đã hủy'],
  },
  reviews: {
    title: 'Đánh giá',
    eyebrow: 'TRẢI NGHIỆM KHÁCH HÀNG',
    description: 'Theo dõi phản hồi và hỗ trợ khách hàng sau mua sắm.',
    button: 'Tải đánh giá',
    columns: ['KHÁCH HÀNG', 'SẢN PHẨM', 'ĐÁNH GIÁ', 'NGÀY GỬI', 'TRẠNG THÁI'],
    initial: [
      {
        id: 'RV01',
        values: [
          'Linh Phạm',
          'Túi tote Canvas Everyday',
          '★★★★★ · Rất đẹp, vải dày',
          '28/10/2026',
          'Đã duyệt',
        ],
        status: 'Đã duyệt',
      },
      {
        id: 'RV02',
        values: [
          'Duy Nguyễn',
          'Đèn bàn Aurora',
          '★★★★☆ · Ánh sáng dễ chịu',
          '27/10/2026',
          'Chờ duyệt',
        ],
        status: 'Chờ duyệt',
      },
      {
        id: 'RV03',
        values: [
          'Thu Hà',
          'Ly gốm Morning Ritual',
          '★★★★★ · Đóng gói cẩn thận',
          '26/10/2026',
          'Đã duyệt',
        ],
        status: 'Đã duyệt',
      },
    ],
  },
  users: {
    title: 'Người dùng',
    eyebrow: 'KHÁCH HÀNG NEXORA',
    description: 'Xem danh sách khách hàng và trạng thái tài khoản.',
    button: 'Thêm nhân viên',
    columns: ['TÀI KHOẢN', 'EMAIL', 'VAI TRÒ', 'NGÀY THAM GIA', 'TRẠNG THÁI'],
    initial: [
      {
        id: 'U01',
        values: [
          'Nguyễn Minh Anh',
          'minhanh@example.com',
          'Quản trị viên',
          '12/06/2026',
          'Hoạt động',
        ],
        status: 'Hoạt động',
      },
      {
        id: 'U02',
        values: [
          'Trần Quốc Bảo',
          'quocbao@example.com',
          'Khách hàng',
          '18/07/2026',
          'Hoạt động',
        ],
        status: 'Hoạt động',
      },
      {
        id: 'U03',
        values: [
          'Lê Hà My',
          'hamy@example.com',
          'Khách hàng',
          '02/08/2026',
          'Hoạt động',
        ],
        status: 'Hoạt động',
      },
    ],
  },
  notifications: {
    title: 'Thông báo',
    eyebrow: 'KẾT NỐI VỚI KHÁCH HÀNG',
    description: 'Soạn thông báo chương trình mới đến khách hàng.',
    button: 'Lưu bản nháp',
    columns: [],
    initial: [],
  },
  settings: {
    title: 'Cấu hình cửa hàng',
    eyebrow: 'TÙY CHỈNH NEXORA',
    description: 'Quản lý thông tin thương hiệu và trải nghiệm mua sắm.',
    button: 'Lưu thay đổi',
    columns: [],
    initial: [],
  },
};

function AdminPageTitle({
  config,
  onPrimaryAction,
}: {
  config: (typeof configs)[ManagementKind];
  onPrimaryAction?: () => void;
}) {
  return (
    <div className="admin-page-heading">
      <div>
        <span>{config.eyebrow}</span>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </div>
      <div className="admin-heading-actions">
        <button className="admin-button-secondary">
          <Download size={16} /> Xuất
        </button>
        <button className="admin-button-primary" onClick={onPrimaryAction}>
          <Plus size={17} /> {config.button}
        </button>
      </div>
    </div>
  );
}

export function AdminManagementPage({ kind }: { kind: ManagementKind }) {
  const config = configs[kind];
  const [rows, setRows] = useState(config.initial);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Tất cả');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState('Thông tin chung');
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          `${row.id} ${row.values.join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === 'Tất cả' || row.status === filter),
      ),
    [rows, query, filter],
  );
  if (kind === 'settings')
    return (
      <div>
        <AdminPageTitle config={config} />
        <div className="settings-tabs">
          {['Thông tin chung', 'Giao diện', 'Thanh toán', 'Chính sách'].map(
            (item) => (
              <button
                key={item}
                className={tab === item ? 'active' : ''}
                onClick={() => setTab(item)}
              >
                {item}
              </button>
            ),
          )}
        </div>
        <div className="settings-layout">
          <section className="admin-panel settings-form">
            <div className="admin-panel-head">
              <div>
                <span>CÀI ĐẶT CỬA HÀNG</span>
                <h2>{tab}</h2>
              </div>
            </div>
            <label>
              Tên cửa hàng
              <input defaultValue="Nexora" />
            </label>
            <label>
              Mô tả ngắn
              <input defaultValue="Những lựa chọn tinh tế cho nhịp sống mỗi ngày." />
            </label>
            <label>
              Email hỗ trợ
              <input defaultValue="hello@nexora.vn" />
            </label>
            <label>
              Địa chỉ cửa hàng
              <textarea defaultValue="24 Nguyễn Thị Minh Khai, Quận 1, TP. Hồ Chí Minh" />
            </label>
            <div className="settings-switch-row">
              <span>
                <strong>Thanh toán khi nhận hàng</strong>
                <small>Cho phép khách trả tiền khi nhận sản phẩm.</small>
              </span>
              <input type="checkbox" defaultChecked />
            </div>
            <div className="settings-switch-row">
              <span>
                <strong>Thanh toán trực tuyến</strong>
                <small>Hiển thị lựa chọn thanh toán điện tử.</small>
              </span>
              <input type="checkbox" defaultChecked />
            </div>
            <button className="admin-button-primary">
              <Check size={16} /> Lưu thay đổi (demo)
            </button>
          </section>
          <aside className="admin-panel settings-preview">
            <span className="section-eyebrow">XEM TRƯỚC</span>
            <div className="settings-preview-brand">
              <BrandLogo className="settings-brand-logo" />
            </div>
            <h3>Thương hiệu của bạn</h3>
            <p>Các thiết lập xem trước sẽ xuất hiện trên cửa hàng.</p>
            <div className="settings-color">
              <i />
              <i />
              <i />
              <i />
            </div>
          </aside>
        </div>
      </div>
    );
  if (kind === 'notifications')
    return (
      <div>
        <AdminPageTitle config={config} />
        <div className="notification-layout">
          <section className="admin-panel notification-form">
            <div className="admin-panel-head">
              <div>
                <span>SOẠN THÔNG BÁO</span>
                <h2>Thông tin chiến dịch</h2>
              </div>
            </div>
            <label>
              Tiêu đề thông báo
              <input placeholder="Ví dụ: Ưu đãi cuối tuần đã bắt đầu" />
            </label>
            <label>
              Nội dung
              <textarea
                placeholder="Viết nội dung bạn muốn gửi tới khách hàng..."
                rows={5}
              />
            </label>
            <label>
              Liên kết đích
              <input placeholder="/products hoặc /categories" />
            </label>
            <div className="notification-audience">
              <Users />
              <span>
                <strong>Tất cả khách hàng</strong>
                <small>Thông báo sẽ hiển thị trong hộp thư Nexora.</small>
              </span>
              <Check />
            </div>
            <div className="form-actions">
              <button className="admin-button-secondary">Lưu bản nháp</button>
              <button
                className="admin-button-primary"
                onClick={() =>
                  window.alert('Bản xem trước không gửi thông báo.')
                }
              >
                Xem trước <ArrowRight size={16} />
              </button>
            </div>
          </section>
          <aside className="admin-panel notification-preview">
            <span className="section-eyebrow">XEM TRƯỚC THÔNG BÁO</span>
            <div className="notification-preview-card">
              <span className="notification-bell">
                <ShoppingBag />
              </span>
              <div>
                <strong>Ưu đãi cuối tuần đã bắt đầu</strong>
                <p>
                  Khám phá bộ sưu tập mới cùng những ưu đãi dành riêng cho bạn.
                </p>
                <small>Vừa xong · Nexora</small>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  if (kind === 'reviews')
    return (
      <div>
        <AdminPageTitle config={config} />
        <div className="admin-list-tools">
          <div className="admin-tabs">
            {['Tất cả', 'Chờ duyệt', 'Đã duyệt'].map((item) => (
              <button
                key={item}
                className={filter === item ? 'active' : ''}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <label className="admin-list-search">
            <Search size={16} />
            <input
              placeholder="Tìm đánh giá..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="review-list">
          {visible.map((row) => (
            <article className="admin-panel review-card" key={row.id}>
              <div className="review-card-top">
                <div className="admin-customer">
                  <i>
                    {row.values[0]
                      .split(' ')
                      .map((x) => x[0])
                      .join('')}
                  </i>
                  <span>
                    <strong>{row.values[0]}</strong>
                    <small>{row.values[3]}</small>
                  </span>
                </div>
                <span
                  className={`admin-status ${row.status === 'Đã duyệt' ? 'complete' : 'processing'}`}
                >
                  <i />
                  {row.status}
                </span>
              </div>
              <div className="review-stars">
                ★★★★★ <small>{row.values[2].split('·')[1]}</small>
              </div>
              <p>
                “Sản phẩm được đóng gói rất cẩn thận, chất lượng đúng như mô tả.
                Mình sẽ tiếp tục ủng hộ Nexora.”
              </p>
              <div className="review-card-bottom">
                <span>
                  Sản phẩm: <strong>{row.values[1]}</strong>
                </span>
                <div>
                  <button className="admin-button-secondary">Ẩn</button>
                  <button
                    className="admin-button-primary"
                    onClick={() =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id
                            ? {
                                ...item,
                                status: 'Đã duyệt',
                                values: item.values.map((v) =>
                                  v === 'Chờ duyệt' ? 'Đã duyệt' : v,
                                ),
                              }
                            : item,
                        ),
                      )
                    }
                  >
                    {row.status === 'Đã duyệt' ? 'Đã duyệt' : 'Duyệt đánh giá'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  const showFilters = config.filters ?? ['Tất cả', 'Đang bán', 'Đã kết thúc'];
  function addRow(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    setRows([
      {
        id: `DEMO-${Date.now().toString().slice(-4)}`,
        values: [
          draft.trim(),
          kind === 'products' ? 'Phụ kiện' : 'Bản xem trước',
          kind === 'products' ? '299.000 ₫' : '—',
          kind === 'products' ? '12 sản phẩm' : 'Chưa xuất bản',
          'Bản nháp',
        ],
        status: 'Bản nháp',
      },
      ...rows,
    ]);
    setDraft('');
    setShowForm(false);
  }
  return (
    <div>
      <AdminPageTitle
        config={config}
        onPrimaryAction={() => setShowForm(true)}
      />
      {kind === 'products' || kind === 'categories' || kind === 'coupons' ? (
        <div className="admin-summary-note">
          <span>
            <TrendingUp size={17} />
          </span>
          <div>
            <strong>
              {kind === 'products'
                ? 'Tổng cộng 248 sản phẩm'
                : kind === 'categories'
                  ? '4 danh mục đang hoạt động'
                  : '2 chương trình đang áp dụng'}
            </strong>
            <small>Dữ liệu minh họa cho giao diện xem trước.</small>
          </div>
          <button>
            <ArrowRight size={16} />
          </button>
        </div>
      ) : null}
      <div className="admin-list-toolbar">
        <div className="admin-tabs">
          {showFilters.map((item) => (
            <button
              key={item}
              className={filter === item ? 'active' : ''}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="admin-list-controls">
          <label className="admin-list-search">
            <Search size={16} />
            <input
              placeholder={`Tìm ${config.title.toLowerCase()}...`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button className="admin-button-secondary">
            <Filter size={15} /> Bộ lọc
          </button>
        </div>
      </div>
      {showForm ? (
        <form className="admin-panel quick-create-form" onSubmit={addRow}>
          <label>
            {kind === 'products'
              ? 'Tên sản phẩm'
              : kind === 'categories'
                ? 'Tên danh mục'
                : 'Tên hoặc mã'}
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Nhập tên..."
            />
          </label>
          <button
            className="admin-button-secondary"
            type="button"
            onClick={() => setShowForm(false)}
          >
            Hủy
          </button>
          <button className="admin-button-primary" type="submit">
            <Check size={15} /> Lưu bản nháp
          </button>
        </form>
      ) : null}
      <section className="admin-panel admin-table-panel">
        <div className="admin-table-caption">
          <span>{visible.length} kết quả</span>
          <button>
            <ArrowDown size={14} /> Mới nhất
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  {row.values.map((value, index) => (
                    <td key={`${row.id}-${index}`}>
                      {index === 0 && kind === 'products' ? (
                        <span className="table-product">
                          <img
                            src={
                              demoProducts.find((p) => p.name === value)
                                ?.image ?? '/demo-products/tote.svg'
                            }
                            alt=""
                          />
                          <strong>{value}</strong>
                        </span>
                      ) : index === row.values.length - 1 ? (
                        <span
                          className={`admin-status ${row.status?.includes('Đã') || row.status?.includes('Hoạt động') || row.status?.includes('bán') ? 'complete' : 'processing'}`}
                        >
                          <i />
                          {value}
                        </span>
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                  <td>
                    <button className="table-icon" aria-label="Xem chi tiết">
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? (
            <div className="table-empty">Không có kết quả phù hợp.</div>
          ) : null}
        </div>
        <div className="table-pagination">
          <span>
            Hiển thị <strong>{visible.length}</strong> trên {rows.length} mục
          </span>
          <div>
            <button disabled>Trước</button>
            <button className="active">1</button>
            <button>2</button>
            <button>Tiếp</button>
          </div>
        </div>
      </section>
    </div>
  );
}
