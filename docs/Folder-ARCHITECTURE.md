# Kiến trúc modular monolith — Nexora

| Thông tin           | Giá trị                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Phiên bản           | 2.9                                                                                         |
| Cập nhật            | 29/10/2026                                                                                  |
| Kiến trúc           | Một frontend React/Vite, một backend NestJS, một database PostgreSQL trên Supabase          |
| Tài liệu liên quan  | [BRD](BRD.md), [SRS](SRS.md), [Thiết kế database](DATABASE_DESIGN.md)                       |
| Kế hoạch triển khai | [Implementation tasks](IMPLEMENTATION_TASKS.md) — mã task, hiện trạng và điều kiện bàn giao |

## 1. Quyết định kiến trúc và hiện trạng

Nexora dùng modular monolith: các nghiệp vụ nằm trong cùng tiến trình NestJS và dùng chung database. Frontend gọi trực tiếp backend qua `/api/v1`; không có API gateway, gọi HTTP giữa các module, Saga hoặc Kafka. Cấu hình được tổ chức theo hai ứng dụng và các tài nguyên Supabase bên ngoài.

| Thành phần  | Đã triển khai                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Frontend    | React/Vite/TypeScript; Auth dùng API backend; các màn mockup Catalog, cart/checkout/orders và dữ liệu Admin dùng fixture/state cục bộ, chưa nối API nghiệp vụ |
| Backend     | NestJS, AuthModule, guard Customer/Admin, API khôi phục mật khẩu và endpoint Admin-only; không healthcheck |
| Auth        | Đăng ký Customer, login/refresh/logout/session, đổi/khôi phục mật khẩu và thu hồi phiên; JWT, refresh cookie HttpOnly |
| Persistence | Prisma repositories/PostgreSQL; Auth baseline, migration token reset và seed tài khoản demo                  |
| Docker      | Chỉ frontend/backend; PostgreSQL và Storage dùng Supabase bên ngoài, không healthcheck                      |
| CI          | Kiểm tra và Docker build cho hai ứng dụng frontend/backend                                                  |

Catalog, giỏ/đơn hàng, thanh toán, email thông báo đơn, tracking, rule-based recommendation và tích hợp Supabase Storage chưa được triển khai. Khôi phục mật khẩu gửi trực tiếp qua Gmail SMTP; task 015 về email job/worker/retry chưa triển khai. Các luồng khác bên dưới là thiết kế cho các bước tiếp theo. Task chi tiết và hiện trạng nằm trong [Implementation tasks](IMPLEMENTATION_TASKS.md#current-status); không tạo folder ứng dụng mới để làm những task này.

Khoảng trống hiện tại: frontend lưu access token trong localStorage, khác mục tiêu bộ nhớ frontend ở NFR-02; Origin/CSRF, rate limit, request ID và chuẩn lỗi chung chưa hoàn chỉnh. Rate limit hiện chưa bật; dự kiến dùng Redis khi triển khai sau. HTTP/guard tests hiện thay Auth/DB adapter, chưa chứng minh hành vi PostgreSQL/provider/trình duyệt thực tế. Các cấu hình Compose/CI có sẵn chưa phải bằng chứng nghiệm thu startup/persistence hoặc pipeline từ xa.

## 2. Cấu trúc repository

```text
nexora/
├── frontend/                   # React + Vite; package/lockfile/Dockerfile riêng
│   ├── src/
│   └── vite.config.ts
├── backend/                    # Một ứng dụng NestJS
│   ├── src/
│   │   ├── auth/               # Controller/service, models, UserRepository/SessionRepository và guards
│   │   ├── database/           # PrismaService, cấu hình TLS, seed và CLI
│   │   ├── generated/prisma/   # Client sinh tự động, không commit
│   │   ├── app.module.ts
│   │   ├── configure-app.ts    # Prefix/validation dùng chung bootstrap và test
│   │   └── main.ts
│   ├── prisma/                # schema.prisma và Prisma Migrate SQL
│   ├── prisma.config.ts       # Cấu hình Prisma CLI 7
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── Dockerfile
├── docker-compose.yml
├── docs/
├── .github/workflows/ci.yml
├── .agents/skills/
└── AGENTS.md
```

Frontend tổ chức màn hình theo feature trong `frontend/src/features/`: `auth`, `account`, `catalog`, `cart`, `wishlist`, `checkout`, `orders`, `content` và `admin`. Mỗi màn có file riêng trong `pages/`; `frontend/src/pages/` chỉ giữ route exports để `App.tsx` ánh xạ URL. Layout dùng chung nằm trong `layouts/`, API client và hooks Auth đang có vẫn thuộc feature Auth. Auth gọi API backend và hiển thị lỗi khi request thất bại. `catalog/demo-data.ts` cùng Zustand store thương mại cung cấp fixture/state cục bộ cho các màn chưa nối API; thao tác ở đó chưa ghi backend.

```text
frontend/src/
├── features/
│   ├── auth/{components,hooks,pages,services}/
│   ├── account/pages/
│   ├── catalog/{components,pages}/
│   ├── cart/pages/
│   ├── wishlist/pages/
│   ├── checkout/pages/
│   ├── orders/pages/
│   ├── content/pages/
│   └── admin/pages/
├── layouts/                  # Store and Admin shells
├── pages/                    # Route exports only
├── context/                  # Auth provider and local commerce store
└── App.tsx
```

Chỉ có hai thư mục ứng dụng. Các thư mục docs, docker và cấu hình công cụ vẫn phục vụ repository. Mỗi ứng dụng tự quản lý dependencies; chạy npm từ đúng thư mục, dùng Node 24/npm 11. Không dùng npm workspaces ở root.

## 3. Luồng request và phân quyền

```mermaid
flowchart LR
    Browser[Trình duyệt] --> Frontend[Frontend :5173]
    Frontend -->|/api proxy| Backend[Backend NestJS :3000]
    Backend --> Postgres[(Supabase PostgreSQL)]
    Backend -. upload tương lai .-> Storage[Supabase Storage]
    Browser -. đọc ảnh public .-> Storage
    Backend -. tích hợp tương lai .-> Providers[payOS / Email]
```

Vite proxy `/api` tới `http://localhost:3000` khi chạy host, hoặc `http://backend:3000` trong Compose. Browser không cần biết DNS container. API Auth giữ nguyên `/api/v1/auth/...`. Không có endpoint /health hoặc Docker healthcheck; truy cập API/log ứng dụng để chẩn đoán kết nối. depends_on chỉ sắp thứ tự khởi động container, không kiểm chứng backend đã sẵn sàng.

AuthGuard xác minh access token và phiên/tài khoản còn hiệu lực trực tiếp qua AuthService. RolesGuard kiểm tra Customer/Admin ở route cần bảo vệ; mỗi nghiệp vụ kiểm tra quyền sở hữu. Không tin actor, role, giá, tồn hoặc trạng thái thanh toán từ browser. Module mới import AuthModule để dùng guard; không gọi endpoint introspection hoặc tin header danh tính. Endpoint introspection và internal service token đã được loại bỏ.

## 4. Ranh giới module

Chỉ AuthModule và DatabaseModule hiện có. Tạo module nghiệp vụ khi triển khai chức năng tương ứng, không tạo scaffold rỗng.

| Module dự kiến            | Trách nhiệm                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| Auth                      | Tài khoản, phiên, hồ sơ, địa chỉ, password reset                     |
| Catalog                   | Danh mục, Product/SKU, ảnh/Supabase Storage, tồn kho và ledger       |
| Order                     | Giỏ, quote, tạo đơn, snapshot, vòng đời đơn và idempotency           |
| Payment                   | payOS link/webhook và quy tắc COD; phối hợp Order trong cùng backend |
| Notification              | Gửi email khôi phục mật khẩu trực tiếp qua Gmail SMTP; email job bền vững/worker retry thuộc task 015 chưa triển khai |
| Tracking / Recommendation | Event website, export không PII và gợi ý theo quy tắc khi triển khai |

Controller xử lý HTTP và DTO; service chứa nghiệp vụ; UserRepository/SessionRepository dùng Prisma Client để truy cập dữ liệu Auth. SQL khóa hàng tham số hóa nằm trong repository; service không chứa SQL. Provider ngoài có adapter riêng. Module giao tiếp bằng lời gọi provider trong tiến trình. Khi một use case cần nhiều module, truyền cùng Prisma.TransactionClient để tất cả ghi chung một transaction. Không import vòng hoặc tạo database/ứng dụng riêng cho từng module.

## 5. Supabase PostgreSQL và dữ liệu hiện có

Backend kết nối trực tiếp PostgreSQL trên Supabase bằng Prisma Client/adapter-pg, không dùng Supabase Data API cho nghiệp vụ. AuthModule/users/auth_sessions và JWT hiện có vẫn thuộc Nexora; không chuyển sang Supabase Auth hoặc sửa bảng auth.users/storage.objects của provider.

Cấu hình DATABASE_URL là PostgreSQL connection URI, không phải SUPABASE_URL HTTPS hoặc API key. Lấy host/port thực từ Dashboard > Connect; direct connection dùng cho backend/migration, Session pooler khi mạng chỉ hỗ trợ IPv4. Không đoán hostname hoặc dùng Transaction pooler cho runner migration hiện tại. Provision role ứng dụng có quyền schema/tables/sequences cần thiết; không chạy application bằng tài khoản administrator. Role chạy migration phải sở hữu/quản lý các bảng ứng dụng; quyền runtime tối thiểu cần được kiểm chứng ở task 002.

Kết nối luôn bật SSL và rejectUnauthorized:true. DATABASE_SSL_CA nhận PEM root certificate nếu chain chưa nằm trong CA mặc định của Node; hỗ trợ literal \n trong env. Bỏ các query parameter sslmode/sslcert/sslkey/sslrootcert khỏi DATABASE_URL vì chúng có thể ghi đè SSL object của pg. URL-encode ký tự đặc biệt trong mật khẩu. Database config không log connection string hoặc secret.

Compose chỉ mô tả hai ứng dụng. File .env ở root và backend/.env dùng DATABASE_URL, DATABASE_SSL_CA tùy chọn cùng cấu hình Auth/port/cookie. Chỉ giữ các biến được code hiện tại sử dụng; chưa khai báo API key hoặc biến Storage. Backend và migration cùng đọc DATABASE_URL, không đọc DIRECT_URL. Connection URL cần được người dùng điền từ Dashboard > Connect, không dùng hostname giả.

Dọn cấu hình repository không xóa tài khoản, phiên hoặc dữ liệu thật. Không tự dump/upload dữ liệu hay chạy migration lên project Supabase thật; xác định project đích và phạm vi dữ liệu trước thao tác. Task 002 kiểm chứng schema/role/permission, task 069 kiểm chứng backup/restore DB và Storage riêng.

Prisma schema nằm ở backend/prisma/schema.prisma, migration SQL có version ở backend/prisma/migrations. Baseline 0_auth giữ nguyên DDL, CHECK, FK, index và lịch sử auth_schema_migrations của Auth cũ. Prisma Migrate ghi lịch sử mới trong _prisma_migrations. Database mới chạy migration:run; database đã áp dụng Auth cũ cần migration:baseline một lần trước migration:run. Baseline kiểm tra schema diff trước khi đánh dấu đã áp dụng; không tạo lại bảng hoặc đổi dữ liệu. Không dùng db push/migrate reset hoặc tự reseed database làm việc. Các module chia sẻ Prisma.TransactionClient; FK/JOIN chung hợp lệ và đơn giữ snapshot bất biến.

Dữ liệu nghiệp vụ chỉ đi qua backend. Tắt Data API nếu không dùng; nếu giữ bật, phải cấu hình grants/RLS để anon/authenticated không đọc/ghi bảng tài khoản/phiên và dữ liệu riêng. Nexora JWT không tự trở thành Supabase JWT. Kết nối TLS và đọc mapping Auth qua Prisma đã được kiểm tra trên project Supabase hiện tại; baseline Prisma, quyền runtime tối thiểu và Storage vẫn cần kiểm chứng riêng.

## 6. Transaction, retry và tích hợp ngoài

Các module tham gia một use case phải dùng cùng Prisma.TransactionClient; không mở transaction riêng hoặc tự commit trong provider lồng nhau. Quote do server ký có TTL mặc định 15 phút theo Database mục 9.2; quote không giữ hàng và không giữ khóa giỏ qua request/UI. POST /orders trả đơn sau commit; retry sau timeout dùng cùng key/payload, không cần checkoutId/operationId phân tán.

Checkout tương lai dùng một transaction ngắn: kiểm tra user/session/giỏ/quote; khóa products/SKU theo thứ tự ổn định; kiểm tra available; lưu đơn/snapshot; tăng reserved và ghi ledger/history/event; xóa đúng dòng giỏ; lưu kết quả idempotency rồi commit. Một dòng không hợp lệ khiến toàn bộ rollback. Gửi lại cùng key/payload trả cùng đơn; khác payload bị từ chối.

Lifecycle cập nhật đơn, tồn, ledger, audit, business event và idempotency trong cùng transaction. Giữ `available = on_hand - reserved`, không âm tồn, thêm giỏ không giữ hàng. Kiểm tra chuyển trạng thái theo SRS. Hủy, hết hạn, ship và nhận lại chỉ gây hiệu ứng một lần. Worker quét bù đơn hết hạn sau restart.

Không gọi network khi đang giữ khóa DB. Tạo payOS link cho đơn đã commit; lỗi link giữ đơn UNPAID, cho retry trên chính đơn. Webhook phải xác minh chữ ký/mã đơn/số tiền, sau đó khóa đơn và ghi PAID/event nguyên tử; webhook lặp không tạo hiệu ứng lặp. Browser return/cancel chỉ đọc trạng thái. Cạnh tranh payment/hủy dùng cùng khóa đơn và kiểm tra trạng thái mới nhất.

Task 016 gửi email reset mật khẩu trực tiếp qua Gmail SMTP sau khi commit token; provider lỗi thì xóa token vừa cấp để khách yêu cầu lại. Cấu hình cần `GMAIL_USER` và `GMAIL_APP_PASSWORD`; tài khoản Gmail phải bật Xác minh 2 bước để tạo App Password. Đây chưa phải hàng đợi bền vững, không tự retry khi backend dừng. Task 015 sẽ bổ sung email_outbox/job và worker retry cho email nghiệp vụ. Không cần broker hoặc inbox giữa module. Tracking nghiệp vụ ghi event trong cùng transaction; email không đi vào dữ liệu export AI. Lỗi gửi email hoặc recommendation sau commit không làm mất nghiệp vụ.

<a id="image-upload"></a>

## 7. Ảnh với Supabase Storage

Đây là thiết kế cho module Catalog chưa triển khai. Backend nhận upload từ Admin đã qua AuthGuard/RolesGuard; adapter Supabase Storage dùng SUPABASE_URL, SUPABASE_SECRET_KEY và SUPABASE_STORAGE_BUCKET. Secret key hoặc service_role legacy chỉ ở backend, không VITE_* hoặc response/log. Chưa thêm SDK/client upload cho đến khi thực hiện task 021–023.

Bucket catalog-images là bucket public dành riêng ảnh catalog; browser tải URL public trực tiếp qua HTTPS/CDN. Public read không cho phép ghi công khai: không mở policy upload/update/delete cho anon hoặc browser. Backend xác thực quyền Admin trước khi dùng server key. Không lưu PII/tài liệu riêng trong bucket này. Cấu hình bucket public, MIME JPEG/PNG/WebP và giới hạn 5 MiB phải được thiết lập trên project khi triển khai; chưa được tạo bởi code hiện tại.

Catalog kiểm tra bytes/MIME/kích thước ảnh bằng buffer/stream có giới hạn, ghi image_assets PENDING với bucket/object_path sinh trước upload. Upload dùng path riêng bất biến và upsert:false; thay ảnh tạo path mới, không ghi đè object đang có trong snapshot. Timeout giữ PENDING; đối soát object/path và SHA-256 bytes trước khi READY/retry. URL được dựng không tự chứng minh object tồn tại; xác minh metadata/nội dung cần thiết trước commit READY.

image_assets và product_images ở PostgreSQL Supabase; bytes ở Storage, không trên server/volume ứng dụng hoặc bảng nghiệp vụ. READY chỉ được gắn vào Product/SKU; ưu tiên ảnh SKU trước ảnh chung. Đơn giữ snapshot bucket/object_path/content_hash/public URL. Gỡ liên kết không xóa object; dọn vật lý chỉ khi kiểm tra mọi tham chiếu và chặn liên kết mới đồng thời. Không trực tiếp sửa bảng storage.objects để thao tác file.

Mọi upload/provider request nằm ngoài transaction giữ khóa nghiệp vụ. Storage API và transaction PostgreSQL là hai thao tác riêng dù cùng nhà cung cấp; chỉ commit metadata khi upload/đối soát đã được xác nhận. Backup DB không bao gồm bytes Storage: cần backup/restore và đối chiếu object riêng.

## 8. Chạy local và kiểm tra

### Chuẩn bị Supabase

Trong project Supabase, chuẩn bị connection URI và role/quyền cho schema ứng dụng. Bổ sung DATABASE_URL vào .env ở root (Compose) hoặc backend/.env (npm host); giữ signing secrets đang dùng. Nếu cần CA riêng, tải server root certificate từ Dashboard Database settings và đặt PEM trong DATABASE_SSL_CA. Không gửi mật khẩu hoặc secret key qua chat/log. File .env.example chỉ chứa placeholder, không phải thông tin project đã chạy.

Auth dùng PostgreSQL và signing secrets riêng của Nexora; không dùng Supabase Auth. Khôi phục mật khẩu cần `GMAIL_USER`, `GMAIL_APP_PASSWORD` và `FRONTEND_URL` (host gốc của frontend); backend tự thêm `/reset-password?token=...` vào liên kết email. Gmail App Password yêu cầu bật Xác minh 2 bước; lưu thông tin này chỉ trong backend `.env` hoặc secret của môi trường chạy. Cấu hình Compose ở root `.env`, chạy backend host ở `backend/.env`. AUTH_ACCESS_SECRET và AUTH_REFRESH_SECRET vẫn bắt buộc. Biến Supabase Storage chưa cần tới khi triển khai Catalog Storage. Xem [Implementation tasks](IMPLEMENTATION_TASKS.md#current-status).

### Docker Compose — hai ứng dụng

```powershell
docker compose config --quiet
docker compose up -d --build
docker compose exec backend npm run migration:run
docker compose logs -f backend
```

Frontend mặc định http://localhost:5173, backend http://localhost:3000; API dùng /api/v1. Backend phải kết nối được Supabase PostgreSQL để khởi động. Không có healthcheck hoặc service_healthy; frontend có thể khởi động trước khi backend nhận request. Migration chạy tường minh sau khi đã xác nhận project/DB đích; không tự seed hay chuyển dữ liệu local.

Backend runtime dùng built JS, thay code cần docker compose up -d --build backend; frontend source có mount để Vite reload. Cấu hình mới dùng network mặc định của Compose. Không sử dụng thao tác xóa dữ liệu như một phần của cập nhật cấu hình.

### Chạy npm trên host

Dùng Node 24/npm 11. Sao chép backend/.env.example thành backend/.env khi chưa có, điền DATABASE_URL/Supabase CA và hai signing secret. Backend dùng Node loadEnvFile từ thư mục chạy; root .env chỉ được Compose nạp, không tự nạp cho npm trong backend.

```powershell
cd backend
npm ci
npm run build
npm run migration:run
npm run start:dev
```

Terminal khác từ root:

```powershell
cd frontend
npm ci
npm run dev
```

Không cần Docker để chạy npm vì database/storage ở Supabase. Seed demo chỉ khi đã chủ động cấu hình DEMO_CUSTOMER_EMAIL/PASSWORD và DEMO_ADMIN_EMAIL/PASSWORD: npm run seed:demo sau build/migration. Không tự seed project đang làm việc để test.

### Validation

Prisma Client được sinh khi npm ci/npm run build, hoặc chạy npm run prisma:generate sau khi sửa schema. Source sinh ở src/generated/prisma được bỏ qua bởi Git/ESLint và biên dịch vào dist. Docker build cần copy prisma/schema.prisma và prisma.config.ts trước npm ci. Prisma CLI có trong dependencies để các lệnh migration vẫn dùng được trong runtime image.

Database đã có schema Auth cũ nhưng chưa có lịch sử Prisma cần chạy sau build, trước migration:run. Lệnh đối chiếu với `prisma/schema.auth-baseline.prisma` để chỉ xác nhận baseline cũ; migration reset mới sẽ được deploy ở bước sau:

```powershell
npm run migration:baseline
npm run migration:status
```

Trong Docker, thêm docker compose exec backend trước lệnh npm. Nếu baseline báo khác schema, đối chiếu schema và migration SQL; không reset hay ép đánh dấu đã áp dụng. Database mới không chạy migration:baseline. Các script npm gọi Prisma CLI chuẩn. prisma.config.ts dùng DATABASE_URL, bật sslmode=require/sslaccept=strict cho Prisma schema engine và cung cấp CA qua file tạm từ DATABASE_SSL_CA, rồi xóa file khi CLI kết thúc. Không có CLI runner riêng; có thể gọi npx prisma migrate với cùng cấu hình. Seed dùng Prisma createMany/skipDuplicates trong một transaction và giữ tài khoản đã có.

Backend: typecheck, lint, test, build. HTTP/config tests dùng URL giả và thay DB/Auth adapter; không chứng minh kết nối SSL/migration/permissions ở project thật. Frontend: typecheck/lint/build, chưa có test script. test:e2e vẫn thiếu config. Task 071 cần DB test Supabase/project test riêng và bằng chứng provider thật; không tạo dữ liệu test trong project làm việc.

### Nguồn kỹ thuật

- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres): lựa chọn direct/session connection và SSL.
- [node-postgres SSL](https://node-postgres.com/features/ssl): URL SSL query parameters có thể ghi đè SSL object.
- [Supabase Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): public read và quyền ghi.
- [Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads): path mới/upsert và retry.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): secret key chỉ dùng ở backend.

## 9. Phạm vi nghiên cứu và hạ tầng tương lai

Recommendation model Python/FastAPI vẫn là hướng tích hợp AI sau, ngoài hai ứng dụng hiện tại; chưa tạo folder/container/database. Rule-based recommendation và tracking của website sẽ được triển khai trong backend trước. Lỗi model/gợi ý không chặn mua hàng. Dataset RetailRocket, notebook và artifact nghiên cứu giữ nguyên.

Kafka, Redis và Elasticsearch không phải phụ thuộc hoặc yêu cầu của kiến trúc monolith hiện tại. Bổ sung search/cache/provider riêng khi một yêu cầu cụ thể cần; PostgreSQL luôn quyết định tồn và thanh toán. CD lên AWS chưa được triển khai.

## 10. Phiên bản cấu hình hiện tại

| Phiên bản | Ngày       | Thay đổi                                                                                                      |
| --------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| 2.3       | 27/10/2026 | Chuẩn hóa env root/backend, chỉ giữ cấu hình hai ứng dụng và Supabase; dọn tên biến/tài liệu đã được thay thế |
| 2.4       | 29/10/2026 | Bỏ biến Storage chưa sử dụng khỏi env mẫu/Compose; làm rõ DATABASE_URL dùng chung cho backend và migration |
| 2.5       | 29/10/2026 | Chuyển sang Prisma repositories/Migrate, baseline Auth cũ; mật khẩu tối thiểu 6 ký tự, giữ bcrypt và bỏ kiểm tra 72 byte |
| 2.6       | 29/10/2026 | Task 016 gửi email reset trực tiếp qua Resend; email_outbox/worker/retry của task 015 vẫn chưa triển khai |
| 2.7       | 29/10/2026 | Task 017 thêm UI reset mật khẩu; `/admin` kiểm tra quyền qua endpoint Admin-only                          |
| 2.8       | 29/10/2026 | Tổ chức màn UI theo feature; storefront và dữ liệu Admin dùng fixture cục bộ, chưa tích hợp API nghiệp vụ |
| 2.9       | 29/10/2026 | Chuyển gửi email đặt lại mật khẩu từ Resend sang Gmail SMTP qua Nodemailer                         |
