# Thiết kế database — Nexora

| Thông tin           | Giá trị                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Phiên bản           | 3.2 |
| Ngày                | 01/11/2026 |
| Trạng thái          | Prisma schema cho monolith một database; Auth, Category, Product/SKU, inventory và media hiện có trong schema             |
| Hệ quản trị         | PostgreSQL local trong Docker; bytes ảnh/video ở Supabase Storage                                                          |
| Tài liệu liên quan  | [BRD](BRD.md), [SRS](SRS.md), [Architecture — thiết kế triển khai hiện tại](Folder-ARCHITECTURE.md)                         |
| Phạm vi             | Ecommerce đa ngành COD/payOS, catalog synthetic/placeholder theo notebook, một kho, tracking và recommendation theo quy tắc |
| Kế hoạch triển khai | [Implementation tasks](IMPLEMENTATION_TASKS.md) — mã task, hiện trạng và điều kiện bàn giao                                 |

## Mục lục

Thiết kế hiện hành dùng một database PostgreSQL cho backend modular monolith theo [Architecture](Folder-ARCHITECTURE.md). Các FK/JOIN và transaction xuyên module trong tài liệu này được áp dụng trong database chung. `backend/prisma/schema.prisma` là source of truth; đồng bộ schema vào PostgreSQL local bằng `npm run db:push`. Prisma Migrate và các file migration đã được gỡ khỏi repo.

Metadata/tables thuộc ứng dụng trong PostgreSQL local, bytes ảnh ở Supabase Storage. Cấu hình DATABASE_URL theo Architecture; Auth dùng users/auth_sessions của Nexora, tách khỏi Supabase Auth.

Catalog đã có API/UI quản lý tồn cơ bản theo SKU; Product không SKU cũng có tồn cấp Product. Đơn và reservation được cập nhật cùng transaction; dự án không lưu lịch sử biến động tồn kho. `Inventory` là schema nguồn cho tồn SKU.

| Nội dung       | Thiết kế hiện hành                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Database       | PostgreSQL local trong Docker, một database chung; DATABASE_URL trỏ tới `postgres` trong Compose hoặc `localhost` trên host       |
| Module         | Auth, Catalog, Order, Payment, Notification, Tracking/Recommendation trong cùng backend; AuthModule và Catalog Category đã có         |
| FK/JOIN        | Cho phép giữa các bảng trong database chung; đơn vẫn lưu snapshot bất biến                                                            |
| Reservation    | Giữ hàng theo dòng đơn PENDING/CONFIRMED và tổng reserved trên SKU; không cần bảng reservation phân tán                               |
| Payment        | Trạng thái/mã giao dịch/link trên đơn theo mục 6; webhook cập nhật đơn và event nguyên tử, không dùng payment projection giữa service |
| Transaction    | Một transaction cho đơn/tồn/giỏ/history/event/idempotency; gọi provider ngoài khi không giữ khóa DB                                   |
| Email/tracking | email_outbox/job và business event ghi cùng transaction; worker gửi sau commit, không cần Kafka/inbox giữa module                     |
| Ảnh            | Module Catalog sở hữu image_assets/product_images trong database chung, credential phía backend; Order giữ snapshot                   |
| Schema         | Prisma ORM/Client; `schema.prisma` là source of truth; đồng bộ thủ công local bằng `db:push`, không chạy Prisma Migrate         |

1. [Các quyết định nền tảng](#decisions)
2. [Danh sách bảng và quan hệ](#tables)
3. [Tài khoản và địa chỉ](#accounts)
4. [Catalog, SKU và ảnh](#catalog)
5. [Visitor, giỏ hàng và chống lặp](#carts)
6. [Đơn hàng và snapshot](#orders)
7. [Lịch sử tồn kho](#inventory)
8. [Recommendation, event và audit](#tracking)
9. [Transaction và xử lý cạnh tranh](#transactions)
10. [Xóa dữ liệu và bảo toàn lịch sử](#retention)
11. [Index, dữ liệu nguồn và triển khai](#implementation)
12. [Kiểm chứng thiết kế](#verification)
13. [Nguồn kỹ thuật và lịch sử tài liệu](#references)

<a id="decisions"></a>

## 1. Các quyết định nền tảng

Đây là thiết kế vật lý cho một database dùng chung bởi backend monolith. Transaction/FK giữa các module được áp dụng trực tiếp khi triển khai; vẫn giữ snapshot và ranh giới nghiệp vụ. Prisma schema mô tả schema; `db:push` chỉ đồng bộ DB local, không dùng với Supabase hoặc DB có dữ liệu cần giữ.

| Nội dung         | Thiết kế                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Khóa chính       | `bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`; ID tự tăng                                                                                         |
| Mã SKU           | Hệ thống sinh, ví dụ `NX-SKU-000001`; duy nhất, bất biến, không dùng lại                                                                              |
| Catalog đa ngành | `categories.parent_id` cho cây danh mục; `products.description` cho mô tả/thông số chung; `product_variants.options` cho lựa chọn SKU                              |
| Snapshot đơn     | Cột riêng trong `orders` và `order_items`; riêng lựa chọn SKU dùng `options_snapshot` JSONB có mã, nhãn và giá trị tại lúc đặt                        |
| Hàng đang giữ    | Suy ra từ dòng đơn PENDING/CONFIRMED, đồng thời duy trì tổng `reserved` trên SKU                                                                      |
| Bảng reservation | Không tạo `inventory_reservations`                                                                                                                    |
| Tồn kho          | `on_hand`, `reserved`; `available = on_hand - reserved` được tính khi đọc                                                                             |
| Tiền             | Số nguyên VND; `numeric(14,0)`, không dùng float                                                                                                      |
| Thời gian        | `timestamptz`; API dùng ISO 8601 UTC, giao diện hiển thị Asia/Ho_Chi_Minh                                                                             |
| Phân quyền       | `role` trên `users`: CUSTOMER hoặc ADMIN; không cần bảng role/permission                                                                              |
| Thanh toán       | COD/payOS; trạng thái, provider order code, link và thời điểm thanh toán trên orders; chưa cần bảng payments                                          |
| Dữ liệu AI       | Giữ ID RetailRocket riêng và event website; chưa có bảng model, embedding hoặc training job                                                           |
| Catalog seed     | 500 Product, 23 danh mục, 1.664 mapping nguồn; provenance/version riêng, một SKU mặc định mỗi Product khi seed lần đầu                                |
| Mã nguồn CSV     | product_id/category_id/sku của CSV được lưu riêng, không thay khóa chính identity hoặc sku_code vận hành                                              |
| JSONB            | Cấu hình lựa chọn SKU riêng tại Product, lựa chọn SKU/snapshot; phần mở rộng event, ngữ cảnh recommendation, kết quả chống lặp và audit đã lọc |

Không bổ sung wishlist, voucher, review, hãng vận chuyển, nhiều kho hoặc đổi trả sau giao thành công. Email khôi phục mật khẩu và thông báo đơn hàng thuộc phạm vi.

### 1.1. Quy ước đọc bảng

- `NN`: bắt buộc, `NOT NULL`. `NULL`: có thể không có giá trị.
- `PK`: khóa chính. `FK`: khóa ngoại. `UQ`: duy nhất.
- 29 bảng nghiệp vụ bên dưới dùng id bigint tự tăng, NN, PK. Module ảnh còn bổ sung image_assets theo mục 4; chỉ users/auth_sessions đã có migration, không coi số bảng thiết kế là số bảng đã triển khai.
- Cột FK tới ID nội bộ dùng `bigint`. Mã nguồn ngoài và mã địa giới dùng chuỗi để giữ số 0 đầu.
- `created_at` mặc định thời điểm tạo. `updated_at` được backend cập nhật khi sửa; PostgreSQL không tự cập nhật chỉ vì tên cột như vậy.
- Giá trị trạng thái dùng `varchar` kèm CHECK danh sách cho phép; chưa cần PostgreSQL ENUM để dễ sửa migration.
- Các cột văn bản bắt buộc phải kiểm tra không rỗng sau trim. Giới hạn và kiểm tra đầu vào tuân theo SRS.
- FK mặc định `ON DELETE RESTRICT`, `ON UPDATE RESTRICT`; các ngoại lệ nằm ở mục 10.

### 1.2. Biểu diễn ID và tiền qua API

ID vẫn là số tự tăng trong PostgreSQL, nhưng serialize thành chuỗi thập phân trong JSON, ví dụ `"productId": "101"`, để không mất chính xác khi `bigint` vượt miền số nguyên an toàn của JavaScript. Không dùng ID tăng dần làm bằng chứng quyền truy cập; backend luôn kiểm tra chủ sở hữu.

Tiền tối đa mỗi trường là `99,999,999,999,999` VND. Giá trị này nằm trong miền số nguyên an toàn của JavaScript, nhưng backend chỉ chuyển từ Decimal sang Number sau kiểm tra số nguyên và giới hạn. Tính tổng bằng số học chính xác, kiểm tra giới hạn trước khi ghi. PostgreSQL có thể làm tròn đầu vào thập phân khi lưu `numeric(14,0)`, vì vậy API phải từ chối giá `199000.5` trước khi ghi, không dựa vào kiểu cột để từ chối.

### 1.3. Chuẩn hóa chuỗi

Định nghĩa `normalize_label(text)`: Unicode NFC → trim → gộp khoảng trắng liên tiếp thành một → chuyển chữ thường. Triển khai một hàm SQL IMMUTABLE với hành vi này và kiểm thử cùng bộ mẫu với backend; cột khóa chuẩn hóa là generated stored, không nhận từ client.

- `Đen`, `đen` và `ĐEN` có cùng khóa `đen`.
- `Đen` và `Black` khác nhau; `M` và `Medium` khác nhau.
- Không bỏ dấu khi so trùng giá trị lựa chọn SKU. Bỏ dấu chỉ áp dụng tìm kiếm tên sản phẩm.
- Email có quy tắc riêng: trim + lowercase, không gộp khoảng trắng bên trong và không bỏ dấu chấm hoặc `+tag`.

<a id="tables"></a>

## 2. Danh sách bảng và quan hệ

| Nhóm             | Bảng                                                                                  | Mục đích                                                           |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Tài khoản        | `users`, `auth_sessions`, `password_reset_tokens`                                     | Danh tính, quyền, phiên đăng nhập, token khôi phục mật khẩu        |
| Địa chỉ          | `user_addresses`                                                                       | Sổ địa chỉ nhận hàng; tên địa giới lưu dưới dạng text               |
| Catalog          | `categories`, `brands`, `products`, `product_variants`, `product_images`              | Sản phẩm, SKU, giá, ảnh và tổng tồn                                |
| Nguồn catalog    | `catalog_datasets`, `retailrocket_category_mappings`                                  | Version/checksum artifact và category nguồn → root → danh mục seed |
| Ngữ cảnh khách   | `visitors`, `tracking_sessions`                                                       | Nhận diện trình duyệt và phiên hành vi                             |
| Giỏ và chống lặp | `carts`, `cart_items`, `idempotency_requests`                                         | Giỏ Customer, chống thực hiện lặp                                  |
| Đơn và kho       | `orders`, `order_items`, `order_status_history`, `order_notes`       | Snapshot và vòng đời đơn                                            |
| Gợi ý và event   | `recommendation_requests`, `recommendation_items`, `interaction_events`               | Kết quả gợi ý theo thứ tự và hành vi                               |
| Kiểm toán        | `admin_audit_logs`                                                                    | Ai thay đổi dữ liệu quản trị, lúc nào                              |
| Thông báo        | `email_outbox`, `user_notifications`                                                  | Hàng đợi email và hộp thông báo Customer                            |

Thiết kế gồm **29 bảng nghiệp vụ** và image_assets bổ sung cho upload, thuộc các module trong [Architecture](Folder-ARCHITECTURE.md). Nhiều bảng là dữ liệu hệ thống, không tương ứng số màn hình quản trị. Địa giới/provenance được seed; visitor/session/history/event/idempotency/email job do backend ghi. Không nhập hàng triệu event RetailRocket vào dữ liệu vận hành. brands chỉ giữ nhãn metadata seed, không có CRUD Admin.

| Quan hệ                                                           | Bội số     | Ghi chú                                                                                |
| ----------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| User → AuthSession / Address / Order                              | 1–N        | Một khách có nhiều phiên, địa chỉ và đơn                                               |
| User → PasswordResetToken                                         | 1–N        | Token khôi phục có hạn; chỉ lưu hash và chỉ dùng một lần                               |
| LocationDataset → Province → Ward                                 | 1–N–N      | Một bản dữ liệu địa giới hoàn chỉnh                                                    |
| Category / Brand → Product                                        | 1–N        | Category bắt buộc khi tạo Product; Brand metadata seed tùy chọn, không có thao tác quản trị |
| CatalogDataset → Category / Product / RetailrocketCategoryMapping | 1–N        | Nguồn seed bất biến; không đồng nhất ID artifact với ID database                       |
| Category → RetailrocketCategoryMapping                            | 1–N        | Một danh mục seed gắn một root; nhiều category nguồn thuộc root đó                     |
| Category → Product qua seed_category_id                           | 1–N        | Danh mục nguồn ban đầu; tách category_id vận hành có thể sửa                           |
| Category → Category                                               | 1–N        | Cây danh mục vận hành; parent_id NULL là gốc, độc lập cây RetailRocket offline         |
| Product → Variant / Image                                         | 1–N        | Ảnh chung hoặc gắn một SKU cùng Product; không phụ thuộc riêng màu sắc                 |
| User → Cart                                                       | 1–1        | Mỗi Customer có tối đa một giỏ; Guest không có giỏ                                     |
| Cart -> CartItem -> Variant/Product | 1-N | A cart line targets one SKU or one Product without SKUs |
| User → Order → OrderItem → Variant                                | 1–N–N, N–1 | Dòng đơn giữ FK và snapshot độc lập                                                    |
| Order → StatusHistory / Note                                      | 1–N        | Ghi chú nội bộ tách khỏi lịch sử công khai                                             |
| Variant → InventoryMovement                                       | 1–N        | Ghi cả thay đổi on_hand và reserved                                                    |
| Visitor → TrackingSession → Event                                 | 1–N–N      | Phiên hành vi khác phiên đăng nhập                                                     |
| RecommendationRequest → RecommendationItem → Product              | 1–N, N–1   | Lưu đúng thứ tự đã trả về                                                              |
| RecommendationItem → Event                                        | 1–N        | Impression/click tham chiếu đúng item được gợi ý                                       |
| Order/User → EmailOutbox                                          | 1–N        | Email thông báo gắn nguồn sự kiện; hàng đợi chống gửi lặp                              |
| User/Order → UserNotification                                    | 1–N        | Thông báo đơn COD lưu bền vững theo chủ sở hữu                                         |

<a id="accounts"></a>

## 3. Tài khoản và địa chỉ

### 3.1. `users`

| Cột                    | Kiểu         | Null/default | Ý nghĩa                                      |
| ---------------------- | ------------ | ------------ | -------------------------------------------- |
| email                  | varchar(254) | NN, UQ       | Email trim/lowercase, bất biến qua API hồ sơ |
| password_hash          | varchar(255) | NULL         | Hash bcrypt nếu tài khoản dùng mật khẩu; Google-only để NULL và có thể đặt mật khẩu qua khôi phục email |
| google_subject         | varchar(255) | NULL, UQ     | Subject ổn định đã xác minh từ Google OIDC; không lưu access/ID token của Google |
| avatar_url             | varchar(2048) | NULL        | Ảnh hồ sơ Google lưu lúc tạo tài khoản bằng Google; đăng nhập/liên kết sau không tự ghi đè |
| full_name              | varchar(100) | NN           | Tên hồ sơ                                    |
| phone                  | varchar(16)  | NULL         | Tối đa 15 chữ số và dấu `+`                  |
| role                   | varchar(16)  | NN, CUSTOMER | CUSTOMER / ADMIN                             |
| status                 | varchar(16)  | NN, ACTIVE   | ACTIVE / LOCKED                              |
| locked_at              | timestamptz  | NULL         | Thời điểm khóa hiện tại                      |
| lock_reason            | varchar(500) | NULL         | Lý do khóa hiện tại                          |
| created_at, updated_at | timestamptz  | NN           | Thời gian tạo/sửa                            |

Ràng buộc: email không rỗng và đúng dạng chuẩn hóa; LOCKED phải có `locked_at` và lý do; ACTIVE có cả hai NULL. API khóa chỉ áp dụng CUSTOMER. Không xóa user qua giao diện. Lưu trạng thái và lý do khóa hiện tại; không lưu lịch sử thao tác khóa/mở. Mở khóa xóa thông tin khóa hiện tại.

### 3.2. `auth_sessions`

Mỗi lần đăng nhập tạo một dòng; các lần refresh cập nhật dòng đó.

| Cột                | Kiểu        | Null/default | Ý nghĩa                                                                   |
| ------------------ | ----------- | ------------ | ------------------------------------------------------------------------- |
| user_id            | bigint      | NN, FK users | Chủ phiên                                                                 |
| refresh_token_hash | char(64)    | NN, UQ       | SHA-256 của token ngẫu nhiên đủ mạnh; không lưu token rõ                  |
| refresh_version    | integer     | NN, 0        | Tăng khi refresh; token chứa session ID/version có xác thực               |
| expires_at         | timestamptz | NN           | Hạn refresh hiện tại                                                      |
| last_used_at       | timestamptz | NN           | Lần dùng gần nhất                                                         |
| revoked_at         | timestamptz | NULL         | Phiên đã thu hồi                                                          |
| revoke_reason      | varchar(50) | NULL         | LOGOUT / PASSWORD_CHANGED / PASSWORD_RESET / ACCOUNT_LOCKED / TOKEN_REUSE |
| created_at         | timestamptz | NN           | Thời điểm đăng nhập                                                       |

CHECK `expires_at > created_at`, `refresh_version >= 0`; revoked_at và revoke_reason cùng NULL hoặc cùng có giá trị. Index `(user_id, revoked_at)`.

Refresh khóa dòng phiên, xác minh token hiện tại rồi đổi hash/version trong một transaction. Frontend chỉ chạy một yêu cầu refresh tại một thời điểm. Token cũ có chữ ký hợp lệ nhưng version đã dùng lại làm thu hồi phiên; token tùy ý không được phép thu hồi phiên của người khác. Logout thu hồi phiên hiện tại; đổi mật khẩu/khóa khách thu hồi tất cả phiên.

Access token chứa session ID. Guard kiểm tra cả trạng thái user và session ở mỗi request cần đăng nhập để token cũ bị chặn ngay khi logout/khóa/đổi mật khẩu. Thời hạn access/refresh là cấu hình backend, không phải cấu trúc database.

### 3.3. `password_reset_tokens`

Migration `1_password_reset` tạo bảng này sau baseline `0_auth`.

| Cột        | Kiểu        | Null/default | Ý nghĩa                                                             |
| ---------- | ----------- | ------------ | ------------------------------------------------------------------- |
| id         | bigint      | PK, identity | Khóa token                                                          |
| user_id    | bigint      | NN, FK users | Tài khoản yêu cầu đặt lại mật khẩu                                  |
| token_hash | char(64)    | NN, UQ       | SHA-256 token ngẫu nhiên; token rõ chỉ tồn tại trong liên kết email |
| expires_at | timestamptz | NN           | Hạn 30 phút từ lúc tạo                                              |
| used_at    | timestamptz | NULL         | Đã dùng thành công thì không dùng lại                               |
| created_at | timestamptz | NN           | Thời điểm yêu cầu                                                   |

Index `(user_id, created_at DESC)` và `(expires_at)`. Chỉ cho dùng khi chưa hết hạn, chưa dùng và tài khoản còn hợp lệ. Token tiêu thụ, đổi hash mật khẩu và thu hồi toàn bộ `auth_sessions` phải cùng transaction. Khi phát hành token mới, token cũ của user bị xóa; token hết hạn/dùng rồi có thể được dọn khi user yêu cầu token mới.
Gửi reset hiện gọi Gmail SMTP trực tiếp sau commit, không lưu job bền vững và không tự retry. Hai endpoint không tiết lộ tài khoản tồn tại; lỗi provider xóa token vừa cấp để khách yêu cầu lại. Task 015 đã bổ sung email_outbox/worker cho email đơn COD; token reset không nằm trong payload job.

### 3.4. `user_addresses`

| Cột             | Kiểu         | Null/default | Ý nghĩa                         |
| --------------- | ------------ | ------------ | ------------------------------- |
| id              | bigint       | PK           | Định danh địa chỉ               |
| user_id         | bigint       | NN, FK users | Chủ địa chỉ                     |
| recipient_name  | varchar(100) | NN           | Tên người nhận                  |
| recipient_phone | varchar(16)  | NN           | Điện thoại người nhận           |
| province_name   | varchar(150) | NN           | Tên tỉnh/thành được chọn        |
| ward_name       | varchar(150) | NN           | Tên đơn vị cấp xã được chọn     |
| address_line    | varchar(300) | NN           | Số nhà/đường/thôn/căn hộ        |
| is_default      | boolean      | NN, false    | Địa chỉ mặc định                |
| created_at      | timestamptz  | NN           | Thời điểm tạo                   |
| updated_at      | timestamptz  | NN           | Thời điểm sửa                   |

Index `(user_id, created_at, id)` hỗ trợ chọn địa chỉ cũ nhất. Mọi thao tác ghi khóa dòng `users` trước; địa chỉ đầu tiên tự mặc định; khi xóa mặc định, chọn địa chỉ còn lại cũ nhất theo `(created_at, id)`. Không lưu mã địa giới hoặc khóa ngoại tới danh mục.

Frontend đọc JSON tiếng Việt `vn_only_simplified_json_generated_data_vn_units.json` từ raw GitHub URL, dùng mã chỉ cho lựa chọn giao diện rồi gửi `FullName` làm text. API kiểm tra trường và quyền sở hữu nhưng không xác minh quan hệ tỉnh–xã. Địa chỉ giữ nguyên text khi nguồn thay đổi hoặc không truy cập được. Đơn hàng tương lai phải chụp riêng tên người nhận/địa chỉ lúc đặt.
<a id="catalog"></a>

## 4. Catalog, SKU và ảnh

Ba artifact đầu vào và quy trình latest category/quota được đặc tả tại [SRS mục 8.3](SRS.md#catalog-preprocessing). Thiết kế này bổ sung lớp import cho đầu ra notebook; không khẳng định notebook đã tạo schema PostgreSQL hoặc seed. Danh mục hiển thị đa ngành và brand là nhãn synthetic, không phải tên thật đã giải mã từ RetailRocket.

### 4.1. `categories`

| Cột                           | Kiểu         | Null/default              | Ý nghĩa                                                      |
| ----------------------------- | ------------ | ------------------------- | ------------------------------------------------------------ |
| name                          | varchar(100) | NN                        | Tên danh mục                                                 |
| name_key                      | text         | NN, UQ, database-maintained | normalize_label(name); trigger tính lại khi tạo/đổi tên để Prisma ghi được |
| slug                          | varchar(150) | NN, UQ                    | Đường dẫn thân thiện                                         |
| parent_id                     | bigint       | NULL, FK categories       | Danh mục cha trong catalog vận hành; NULL là danh mục gốc    |
| option_config              | jsonb        | NN, `{}`                  | Cột legacy từ migration Category; giữ dữ liệu cũ, không dùng cho SKU mới |
| is_active                     | boolean      | NN, true                  | Cột legacy; Catalog hiện không dùng trạng thái danh mục      |
| seed_dataset_id               | bigint       | NULL, FK catalog_datasets | Bộ CSV đã tạo danh mục; NULL cho danh mục Admin              |
| seed_category_id              | integer      | NULL                      | category_id trong categories_demo.csv, 1..23 ở snapshot đầu  |
| retailrocket_root_category_id | varchar(50)  | NULL                      | root_categoryid trong CSV, chuỗi số chuẩn                    |
| created_at, updated_at        | timestamptz  | NN                        | Thời gian                                                    |

CHECK `parent_id IS NULL OR parent_id <> id`, `jsonb_typeof(option_config) = 'object'`; index `(parent_id, is_active)` được giữ từ schema cũ. `option_config` và `is_active` được giữ để tương thích dữ liệu cũ nhưng Category API và Product/SKU không dùng. Tên chuẩn hóa vẫn duy nhất toàn catalog để giữ thiết kế đơn giản. Không tự làm cây phân cấp từ tên synthetic hoặc import toàn bộ cây RetailRocket vào cây danh mục vận hành.

Triển khai hiện tại dùng `BEFORE INSERT OR UPDATE OF name` trigger để chuẩn hóa `name` về NFC và duy trì `name_key` bằng hàm SQL `normalize_label`; cột là thường với unique constraint, không phải generated column vì Prisma không mô tả generated column PostgreSQL. Trigger giữ chuẩn hóa ở database ngay cả khi tên được ghi ngoài API Catalog. Source of truth là migration `2_catalog_categories`.

Catalog kiểm tra cha tồn tại và không có chu trình; thao tác đổi cây dùng khóa transaction cấp cây trong database chung rồi kiểm tra tổ tiên. CHECK chống tự trỏ không đủ chống chu trình nhiều nút. Mọi danh mục đều có thể gán cho Product; lọc gồm danh mục con. Danh mục không có thao tác bật/tắt.

`categories.option_config` là cột legacy còn giữ lại, không dùng để định nghĩa SKU. Mỗi Product mới khai báo bộ lựa chọn riêng trong `products.option_config`; mọi SKU của Product phải có đúng các mã lựa chọn đó.

Ba cột nguồn cùng NULL hoặc cùng có giá trị; CHECK seed_category_id > 0 khi có. UQ `(seed_dataset_id, seed_category_id)` và `(seed_dataset_id, retailrocket_root_category_id)`. Thêm UQ `(id, seed_dataset_id)` và `(id, seed_dataset_id, retailrocket_root_category_id)` làm đích FK ghép. name/slug là nội dung vận hành được sửa; ba cột provenance bất biến. 23 tên tiếng Anh của notebook được nhập ban đầu; category_mapping không lặp tên vì có thể suy ra qua FK.

### 4.2. `brands`

Cột gồm `name`, `name_key`, `slug`, `created_at`; không có ba cột nguồn của categories hoặc cờ trạng thái quản trị. Bảng chỉ là danh sách nhãn seed bất biến để lưu metadata cho Product, không có CRUD/API/màn hình Admin. UQ cho name_key và slug. Sáu brand seed là Nexora, Aurevia, Velmora, Orlena, Novaris, Elvora, đều synthetic; không phải thương hiệu gốc của item RetailRocket.

### 4.3. `products`

Migration `3_product_management` triển khai các trường Admin; migration `5_product_sku_options` bổ sung `option_config` riêng trên Product và backfill giá trị cũ từ Category cho sản phẩm hiện có. Cột này lưu mã/nhãn lựa chọn riêng của sản phẩm; Category chỉ phân loại. Brand, slug, `variant_option_keys` và provenance/seed trong bảng dưới vẫn là thiết kế cho luồng import sau.

| Cột                      | Kiểu          | Null/default              | Ý nghĩa                                                                                                                       |
| ------------------------ | ------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| name | varchar(200) | NN | Tên hiển thị 1–200 ký tự, không rỗng |
| option_config | jsonb | NN, `{"options": {}}` | Cấu hình riêng của Product, tối đa 5 mã lựa chọn; cố định sau khi tạo |
| price_vnd | bigint | NULL | Product-level price used when Product has no SKUs; each SKU has its own price |
| search_name              | text          | NN                        | Tên chuẩn hóa bỏ dấu/lowercase phục vụ tìm chuỗi con                                                                          |
| slug                     | varchar(250)  | NN, UQ                    | Sinh có hậu tố ID khi trùng tên                                                                                               |
| description | varchar(5000) | NN | Văn bản mô tả 1–5.000 ký tự, chứa thông tin/thông số chung |
| variant_option_keys      | jsonb         | NN, `[]`                  | Các mã lựa chọn của SKU đang bán, ví dụ `["color","storage"]`; `[]` cho sản phẩm không có biến thể                            |
| category_id | bigint | NN, FK categories | Danh mục bắt buộc từ khi tạo Product |
| brand_id                 | bigint        | NULL, FK brands           | Thương hiệu tùy chọn                                                                                                          |
| status | varchar(16) | NN, ACTIVE | ACTIVE / INACTIVE; Product mới qua Admin luôn ACTIVE |
| retailrocket_item_id     | varchar(50)   | NULL, UQ                  | ID để nối model/dataset sau này                                                                                               |
| retailrocket_category_id | varchar(50)   | NULL                      | Category nguồn của item tại snapshot, chỉ điền khi có artifact latest-category bổ sung; ba CSV hiện tại không xuất trường này |
| seed_dataset_id          | bigint        | NULL, FK catalog_datasets | Bộ dữ liệu đã tạo Product; version tra qua FK, không lặp seed_manifest_version                                                |
| seed_product_id          | integer       | NULL                      | product_id trong products_demo.csv, 1..500 ở snapshot đầu                                                                     |
| seed_sku                 | varchar(64)   | NULL                      | sku trong CSV, dạng NXR-00001; không phải sku_code vận hành                                                                   |
| seed_category_id         | bigint        | NULL, FK categories       | ID nội bộ của danh mục lúc import, khác category_id vận hành                                                                  |
| source_interactions      | bigint        | NULL                      | interactions lịch sử của item trên cả ba event nguồn                                                                          |
| source_users             | bigint        | NULL                      | users lịch sử là visitor khác nhau của item                                                                                   |
| created_at, updated_at   | timestamptz   | NN                        | Thời gian                                                                                                                     |

CHECK status IN ('ACTIVE', 'INACTIVE'); name/description are required. Admin creates ACTIVE Products with a shared primary image. A Product without SKUs requires price_vnd and uses product_inventory; a Product with SKUs uses per-SKU prices and inventory. Products may be created without SKUs and receive them later.

Product inventory is used only while a Product has no active SKUs. Cart rows then reference product_id and read price from products.price_vnd. When SKUs exist, cart rows reference variant_id and use SKU prices and inventory. Adding the first SKU requires Product stock to be zero.

`search_name` do cùng thao tác sửa tên cập nhật, có xử lý `đ → d`. Chỉ dùng tìm kiếm, không dùng làm khóa duy nhất. PostgreSQL tìm kiếm catalog 500 sản phẩm bằng LIKE đã escape ký tự `%`/`_` và điều kiện SKU tương đương; chưa cần Elasticsearch, cache hoặc extension tìm kiếm.

`retailrocket_item_id` duy nhất khi có giá trị; nhiều sản phẩm NULL được phép. Bỏ hm_article_id vì H&M không còn là đầu vào catalog. Các cột nguồn không sửa qua form Admin; không gán lại source_item_id khi đã có Product. Với Product seed, seed_dataset_id, seed_product_id, seed_sku, seed_category_id, source_interactions, source_users cùng có giá trị và retailrocket_item_id bắt buộc; Product Admin có nhóm seed cùng NULL. CHECK seed_product_id > 0, source_interactions >= source_users AND source_users > 0 khi có; seed_sku không rỗng. Không đặt giới hạn 500 lên PK hoặc toàn bộ bảng Product.

UQ `(seed_dataset_id, seed_product_id)` và `(seed_dataset_id, seed_sku)`; FK ghép `(seed_category_id, seed_dataset_id)` → `categories(id, seed_dataset_id)`. Nếu bổ sung retailrocket_category_id, FK ghép `(seed_dataset_id, retailrocket_category_id, seed_category_id)` → `retailrocket_category_mappings(dataset_id, source_category_id, category_id)`; cột này phải NULL khi không có seed_dataset_id. FK bỏ qua khi category nguồn NULL, phù hợp CSV hiện tại. Không gán categoryid = root_categoryid hoặc lấy một leaf bất kỳ trong root để lấp trường thiếu.

Category nguồn/root dùng để truy vết qua seed_category_id; category_id hiện hành vẫn cho Admin đổi theo nghiệp vụ. Thống kê source_interactions/source_users là snapshot bất biến, không cập nhật từ event web, không đưa vào dashboard LIVE hoặc xếp hạng “được quan tâm” của website. Manifest/CSV giữ tên và các giá trị ban đầu để đối chiếu sau khi Admin sửa nội dung.

Index: `(status, created_at DESC, id DESC)`, `(category_id, status)`, `(brand_id)`.

### 4.4. `product_variants`

Schema hiện tại dùng các cột `id`, `product_id`, `sku`, `options`, `price_vnd`, `deleted_at`, `created_at`, `updated_at`; tồn nằm riêng trong `inventory`. Các cột seed/provenance trong thiết kế tổng thể vẫn dành cho import tương lai.

Một dòng là một SKU cụ thể có giá và tồn riêng. `options` là object mã lựa chọn → giá trị hiển thị, ví dụ `{"color":"Đen","storage":"256GB"}`. Sản phẩm không có biến thể có đúng một SKU mặc định với `options = {}`; không thêm nhãn màu/size giả để lấp dữ liệu.

| Cột                    | Kiểu         | Null/default    | Ý nghĩa                                                         |
| ---------------------- | ------------ | --------------- | --------------------------------------------------------------- |
| product_id             | bigint       | NN, FK products | Sản phẩm cha                                                    |
| sku                   | varchar(40)  | NN, UQ          | Mã tự sinh, bất biến                                            |
| options                | jsonb        | NN, `{}`        | Mã lựa chọn → giá trị; các SKU cùng Product có cùng bộ mã       |
| price_vnd              | bigint       | NN              | Giá bán hiện tại, số nguyên VND > 0                             |
| deleted_at             | timestamptz  | NULL            | Đánh dấu xóa mềm, giữ lịch sử SKU                               |
| created_at, updated_at | timestamptz  | NN              | Thời gian                                                       |

Tồn SKU lưu trong `inventory`; Product không SKU có `product_inventory`. `on_hand` là hàng thực tế, `reserved` là lượng giữ; `available = on_hand - reserved` được tính khi đọc. Không lưu lịch sử biến động tồn. Đặt/hủy đơn cập nhật `reserved` trong transaction; Admin chỉ điều chỉnh `on_hand`, không sửa reserved trực tiếp. `version` tăng khi tồn hoặc reservation đổi để phát hiện thao tác dựa trên dữ liệu cũ.

Ràng buộc DB:

- CHECK `jsonb_typeof(options) = 'object'`, `price_vnd > 0`; ứng dụng kiểm tra options theo `Product.optionConfig`.
- CHECK `inventory.on_hand >= 0 AND inventory.reserved >= 0 AND inventory.reserved <= inventory.on_hand`.
- Xóa SKU dùng `deleted_at`; không xóa dòng inventory hoặc SKU được đơn tham chiếu. Catalog từ chối xóa khi on_hand hoặc reserved còn dương. Tổ hợp options không trùng giữa các SKU chưa xóa; Catalog khóa Product → SKU → Inventory trong thao tác kho/SKU để tuần tự hóa kiểm tra.
- Index `(product_id, deleted_at)`; `available` không lưu thành cột riêng.

Định nghĩa hàm SQL IMMUTABLE `canonical_variant_options(jsonb)` cho cột generated options_key: kiểm tra object và giới hạn trường/mã/giá trị; chuẩn hóa từng giá trị bằng normalize_label, sắp mã theo thứ tự byte ổn định rồi serialize danh sách cặp thành JSON text có escaping xác định. `{}` cho khóa `[]`. Không ghép bằng dấu phân cách tùy ý hoặc lấy thứ tự khóa client làm khóa; không dùng hash làm bằng chứng duy nhất chống trùng. Tổng khóa tối đa 1.500 byte để giới hạn kích thước index. Khác thứ tự khóa/hoa thường/khoảng trắng vẫn trùng tổ hợp; `Đen` khác `Black`, `256GB` khác `256 GB` nếu chưa có quy tắc đồng nhất chủ động. Backend lưu giá trị hiển thị đã trim/NFC/gộp khoảng trắng và xác nhận đúng tập mã Product; DB bảo vệ chống trùng qua UQ. Hàm generated chỉ xử lý cùng dòng, không đọc cấu hình Category.

Mã SKU được server sinh theo ID sau khi tạo row trong cùng transaction (`SKU-` kèm ID đệm); người dùng không nhập/sửa mã. Không thêm trạng thái riêng cho SKU. Xóa mềm làm SKU ngừng xuất hiện trong quản trị/bán mới; SKU còn reservation không xóa được. Tồn 0 hoặc available 0 ngăn đặt mua qua kiểm tra stock.

Không lưu cột `available`; không tạo bảng Color/Size hoặc EAV tổng quát. Khách chọn giá trị từ SKU có sẵn; Admin cấu hình mã lựa chọn riêng trong từng Product. Bản đầu lọc options theo so khớp chính xác sau chuẩn hóa, không lọc khoảng số trên chuỗi dung lượng/kích thước.

CSV không có thông số/lựa chọn; adapter dùng variant_option_keys = `[]`, options = `{}`, lấy toàn bộ price/stock vào một SKU và reserved = 0. sku_code vẫn sinh NX-SKU qua sequence, còn NXR của CSV ở products.seed_sku. Không suy đoán thông số thật từ nhãn synthetic, không sao chép stock sang nhiều biến thể. SKU thêm sau có tồn riêng qua Catalog; UI chọn sẵn SKU duy nhất. Khi chuyển sang nhiều biến thể, tạm ngừng bán Product, ngừng bán SKU mặc định, cập nhật tập mã và nhập các SKU mới/tồn riêng qua nghiệp vụ kho rồi mở lại Product khi hợp lệ; không nhân tồn cũ. Tồn SKU mặc định cũ không tự chuyển sang SKU mới và các reservation cũ vẫn được xử lý theo SKU đã giữ.

SKU code và options cố định sau khi tạo; nếu options khai báo sai thì xử lý tồn về 0, xóa mềm SKU và thêm SKU đúng. Giá và tồn có thể điều chỉnh; thao tác tồn cần lý do. Tồn 0 làm SKU không thể bán; không có trạng thái riêng cho SKU. Trang Admin Tồn kho liệt kê từng SKU và Product không có SKU. Dòng SKU mở luồng nhập hàng, điều chỉnh +/- và kiểm kê; dòng Product mở form Product để quản lý tồn cấp Product. Không có màn hình lịch sử tồn.

Mỗi Admin gửi `idempotencyKey` cùng payload chuẩn hóa. `inventory_adjustment_requests` lưu actor, key, payload và response thành công trong cùng transaction với cập nhật Inventory; unique `(actor_user_id, key)` giúp retry cùng payload trả kết quả cũ và từ chối key dùng lại với payload khác. Khi kiểm kê, client gửi version đã đọc; mismatch bị từ chối để Admin tải lại. API không cho chỉnh `reserved` hoặc `available`.

### 4.5. `product_images` — liên kết ảnh tại Catalog

Migration hiện tại lưu liên kết Product/SKU tới media asset, alt text, thứ tự, cờ ảnh đại diện và thời gian tạo. Bảng tên legacy `image_assets` lưu metadata cho cả ảnh và video; media asset chỉ được tạo sau khi Supabase Storage trả upload thành công.

| Cột | Kiểu | Null/default | Ý nghĩa |
| --- | --- | --- | --- |
| id | bigint identity | NN, PK | ID liên kết |
| product_id | bigint | NN, FK products | Sản phẩm |
| variant_id | bigint | NULL, FK product_variants | NULL là ảnh chung; có giá trị là ảnh của SKU cùng Product |
| image_asset_id | bigint | NN, FK image_assets | Asset do Catalog quản lý |
| alt_text | varchar(200) | NN, `''` | Văn bản thay thế |
| sort_order | integer | NN, 0 | Thứ tự trong bộ ảnh |
| is_primary | boolean | NN, false | Ảnh đại diện Product |
| created_at | timestamptz | NN | Thời gian |

CHECK `sort_order >= 0`; trigger kiểm tra SKU thuộc cùng Product; partial UQ một ảnh đại diện chung cho mỗi Product; CHECK ảnh đại diện phải là ảnh chung. Video không thể là ảnh đại diện. Migration hiện tại ngăn trùng media asset hai lần trong cùng Product. Gỡ liên kết không xóa asset Storage; Order giữ snapshot metadata cần thiết cho đơn lịch sử.

Khi chọn SKU, ưu tiên ảnh SKU rồi ảnh chung. Không tạo trạng thái READY cho asset; API chỉ cho liên kết imageAssetId đã được ghi metadata sau upload thành công.
### 4.5.1. `image_assets` — metadata Supabase Storage tại Catalog

Catalog lưu thông tin media trong PostgreSQL; Supabase Storage giữ bytes. Backend nhận ảnh JPEG/PNG/WebP tối đa 5 MiB hoặc video MP4/WebM/MOV tối đa 50 MB, upload vào object path mới với `upsert:false`, rồi khi Storage trả thành công thì ghi metadata và trả ID nội bộ cùng public URL. Không xác minh chữ ký bytes, đọc object lại, tính SHA-256 hoặc dùng trạng thái READY/PENDING. Nếu Storage thành công nhưng ghi metadata thất bại, object có thể mồ côi; upload lần nữa sẽ dùng path mới. Bucket phải cho phép các MIME type và giới hạn tương ứng.

| Cột | Kiểu | Null/default | Ý nghĩa |
| --- | --- | --- | --- |
| id | bigint identity | NN, PK | imageAssetId trong API, serialize chuỗi |
| uploaded_by_id | bigint | NN, FK users | Admin đã upload |
| bucket | varchar(100) | NN | Bucket do backend cấu hình |
| object_path | varchar(500) | NN, UQ cùng bucket | Path bất biến do Catalog sinh |
| content_type | varchar(100) | NN | MIME thuộc allowlist JPEG/PNG/WebP hoặc MP4/WebM/QuickTime |
| content_length | integer | NN | Kích thước file upload |
| public_url | text | NN | URL public được dựng từ cấu hình bucket và object path |
| created_at | timestamptz | NN | Thời gian ghi metadata sau khi Storage nhận upload |

Backend chỉ cho Admin upload và giữ secret key phía server. Migration `6_product_video_media` nới CHECK MIME/kích thước cho video; Bucket phải được cấu hình riêng, public-read cho browser, không cho anon/browser ghi. Gỡ liên kết không xóa object. Không tạo bucket/policy tự động; database backup không bao gồm object bytes nên cần backup Storage riêng.
### 4.6. Ví dụ SKU

| id   | product_id       | sku_code      | options                             |   price | on_hand | reserved | available khi đọc |
| ---- | ---------------- | ------------- | ----------------------------------- | ------: | ------: | -------: | ----------------: |
| 1001 | 101 — Áo thun    | NX-SKU-000001 | `{"color":"Đen","size":"M"}`        |  199000 |      12 |        2 |                10 |
| 1002 | 101 — Áo thun    | NX-SKU-000002 | `{"color":"Đen","size":"L"}`        |  199000 |       8 |        0 |                 8 |
| 1003 | 102 — Điện thoại | NX-SKU-000003 | `{"color":"Đen","storage":"256GB"}` | 8990000 |       5 |        1 |                 4 |
| 1004 | 103 — Sách       | NX-SKU-000004 | `{}`                                |   99000 |      10 |        0 |                10 |

Lọc `color = Đen + storage = 256GB + còn hàng` phải áp dụng trong **cùng một dòng product_variants**. Dùng EXISTS với toàn bộ điều kiện lựa chọn/giá/tồn; không EXISTS riêng cho mỗi mã rồi ghép các SKU khác nhau. Truy vấn so sánh giá trị theo normalize_label, thống nhất với options_key; không dùng raw JSON containment phân biệt hoa/thường thay cho hợp đồng này.

### 4.7. `catalog_datasets`

Một dòng định danh một bộ artifact catalog đã import thành công. Manifest và CSV được lưu bền vững ngoài DB; đây là bảng provenance, không phải hệ thống ETL/job.

| Cột                  | Kiểu         | Null/default | Ý nghĩa                                         |
| -------------------- | ------------ | ------------ | ----------------------------------------------- |
| version              | varchar(100) | NN, UQ       | Nhãn bộ catalog đóng băng                       |
| manifest_storage_key | varchar(500) | NN, UQ       | Đường dẫn tương đối đến manifest local bất biến |
| manifest_sha256      | char(64)     | NN           | SHA-256 manifest                                |
| products_sha256      | char(64)     | NN           | Hash products_demo.csv                          |
| categories_sha256    | char(64)     | NN           | Hash categories_demo.csv                        |
| mapping_sha256       | char(64)     | NN           | Hash category_mapping.csv                       |
| selection_method     | varchar(100) | NN           | Ví dụ root_quota_sqrt_interactions_v1           |
| random_seed          | integer      | NN           | 42 cho metadata notebook                        |
| product_count        | integer      | NN           | 500 ở snapshot đầu                              |
| category_count       | integer      | NN           | 23 ở snapshot đầu                               |
| mapping_count        | integer      | NN           | 1664 ở snapshot đầu                             |
| imported_at          | timestamptz  | NN           | Thời điểm commit seed lần đầu                   |

CHECK count > 0, random_seed >= 0, hash là 64 ký tự hex thường. Manifest giữ phiên bản/checksum notebook và input clean, quota/item ID được chọn, mô tả tie-break, schema CSV, object key/version/CDN URL và hash ảnh đã upload. Counts đối chiếu trong importer, không thể bảo đảm tổng số dòng bằng CHECK trên bảng này. Cùng version khác hash bị từ chối; cùng version/cùng hash chỉ bổ sung phần thiếu mà không sửa dữ liệu vận hành.

### 4.8. `retailrocket_category_mappings`

| Cột                | Kiểu        | Null/default            | Ý nghĩa                                         |
| ------------------ | ----------- | ----------------------- | ----------------------------------------------- |
| dataset_id         | bigint      | NN, FK catalog_datasets | Phiên bản catalog                               |
| source_category_id | varchar(50) | NN                      | categoryid nguồn, chuỗi số chuẩn                |
| root_category_id   | varchar(50) | NN                      | root_categoryid nguồn, chuỗi số chuẩn           |
| category_id        | bigint      | NN, FK categories       | ID nội bộ được phân giải từ category_id của CSV |

UQ `(dataset_id, source_category_id)`; thêm UQ `(dataset_id, source_category_id, category_id)` làm đích FK của products. FK ghép `(category_id, dataset_id, root_category_id)` → `categories(id, seed_dataset_id, retailrocket_root_category_id)` bảo đảm cùng dataset/root. Index `(category_id, dataset_id, root_category_id)` phục vụ tra ngược. ID nguồn chuẩn hóa từ giá trị nguyên, không lưu `.0` và không đoán từ nhãn danh mục.

Snapshot đầu có 1.664 dòng từ inner join cây 1.669 category với 23 root đã chọn. Không có parent_id hoặc tên category gốc vì CSV không xuất chúng. category_name chỉ được kiểm tra khi import rồi suy từ categories, không lưu lặp. Không cần bảng cây toàn bộ 1.669 category trong DB vận hành; cây và item-category latest ở khu vực offline. Hai bảng nguồn cùng các cột provenance được giữ bất biến; đổi dataset là tác vụ migration chủ động, không tự thêm một bộ 500 Product trùng retailrocket_item_id hoặc danh mục trùng name_key vào database đang chạy.

<a id="carts"></a>

## 5. Visitor, giỏ hàng và chống lặp

**Hiện trạng cart MVP:** Prisma hiện có `carts` với ID riêng và unique `user_id`, cùng `cart_items` với ID riêng và unique `(cart_id, variant_id)`. API xác thực quantity dương, nhưng schema MVP chưa có `carts.version` hoặc CHECK quantity; chưa triển khai `idempotency_requests`, tracking events, transaction nghiệp vụ hay checkout. Các phần bên dưới mô tả target đầy đủ cho giai đoạn sau và không đồng nghĩa đã triển khai.

### 5.1. `visitors`

| Cột          | Kiểu        | Null/default | Ý nghĩa                                        |
| ------------ | ----------- | ------------ | ---------------------------------------------- |
| token_hash   | char(64)    | NN, UQ       | Hash token ngẫu nhiên trong cookie trình duyệt |
| created_at   | timestamptz | NN           | Lần tạo ngữ cảnh                               |
| last_seen_at | timestamptz | NN           | Hoạt động gần nhất                             |

Cookie dùng token ngẫu nhiên để nhận diện ngữ cảnh trình duyệt phục vụ tracking, không dùng làm quyền truy cập giỏ. Visitor không phải Customer, không nối với visitor ID lịch sử RetailRocket. Sau logout tạo visitor/ngữ cảnh Guest mới; giỏ vẫn thuộc tài khoản và chỉ đọc được sau khi tài khoản xác thực lại.

### 5.2. `tracking_sessions`

| Cột          | Kiểu        | Null/default    | Ý nghĩa                                                    |
| ------------ | ----------- | --------------- | ---------------------------------------------------------- |
| visitor_id   | bigint      | NN, FK visitors | Ngữ cảnh trình duyệt                                       |
| user_id      | bigint      | NULL, FK users  | User được liên kết với phiên; chỉ được gán một lần từ NULL |
| linked_at    | timestamptz | NULL            | Thời điểm login/liên kết                                   |
| started_at   | timestamptz | NN              | Bắt đầu phiên                                              |
| last_seen_at | timestamptz | NN              | Hoạt động gần nhất                                         |
| ended_at     | timestamptz | NULL            | Kết thúc rõ ràng khi logout/chuyển ngữ cảnh                |

CHECK last_seen_at >= started_at; ended_at nếu có >= started_at; user_id/linked_at cùng có hoặc cùng NULL. Index `(visitor_id, last_seen_at DESC)` và `(user_id, started_at)`; thêm UQ `(id, visitor_id)` cho FK ghép với events/recommendation_requests.

Sau 30 phút không hoạt động tạo session mới, không tái dùng session cũ. Server tuần tự hóa việc tìm/tạo phiên bằng khóa visitor. Login chỉ liên kết session Guest còn hiện hành; nếu session thuộc tài khoản khác, kết thúc và tạo session mới. Event đã ghi giữ nguyên user_id; không UPDATE hàng loạt event Guest. Export có thể cung cấp user_id lúc event và user liên kết phiên như hai trường khác nhau.

### 5.3. `carts`

| Cột                    | Kiểu        | Null/default | Ý nghĩa                            |
| ---------------------- | ----------- | ------------ | ---------------------------------- |
| user_id                | bigint      | NN, FK users | Chủ giỏ Customer                   |
| version                | bigint      | NN, 0        | Tăng mỗi lần nội dung giỏ thay đổi |
| created_at, updated_at | timestamptz | NN           | Thời gian                          |

CHECK version >= 0; user_id luôn có giá trị. Guest không có bản ghi cart.

UQ `(user_id)` bảo đảm mỗi tài khoản chỉ có tối đa một giỏ.

Giỏ tài khoản vẫn tồn tại sau checkout dù rỗng. Backend lấy user_id từ phiên đã xác thực; không nhận chủ giỏ do client tự khai. Guest gọi API giỏ bị từ chối và không tạo bản ghi.

### 5.4. `cart_items`

| Cột                    | Kiểu        | Null/default            | Ý nghĩa      |
| ---------------------- | ----------- | ----------------------- | ------------ |
| cart_id                | bigint      | NN, FK carts            | Giỏ          |
| variant_id             | bigint      | NULL, FK product_variants | SKU when Product has SKUs |
| product_id             | bigint      | NULL, FK products | Product direct sale when no SKU |
| quantity               | integer     | NN                      | Số lượng > 0 |
| created_at, updated_at | timestamptz | NN                      | Thời gian    |

UQ `(cart_id, variant_id)` and `(cart_id, product_id)`; each row must reference exactly one target; CHECK quantity > 0; index variant_id. Price and availability are read from Catalog. Selection for subtotal is frontend state; cart rows do not store selection or price.

### 5.5. `idempotency_requests`

Lưu kết quả thao tác đã thành công để request gửi lại không cộng giỏ, tạo đơn hoặc nhập tồn hai lần.

| Cột             | Kiểu         | Null/default | Ý nghĩa                                                  |
| --------------- | ------------ | ------------ | -------------------------------------------------------- |
| scope_key       | varchar(100) | NN           | Server tạo: user:ID hoặc cart:ID                         |
| operation       | varchar(100) | NN           | Ví dụ order.create, cart.add, inventory.adjust           |
| idempotency_key | varchar(100) | NN           | Khóa client giữ nguyên khi retry                         |
| request_hash    | char(64)     | NN           | SHA-256 payload chuẩn hóa, gồm resource/version          |
| resource_type   | varchar(40)  | NN           | order / cart / inventory_movement...                     |
| resource_id     | bigint       | NN           | ID kết quả, tham chiếu đa loại do backend kiểm tra       |
| result_code     | varchar(50)  | NN           | Kết quả nghiệp vụ ổn định                                |
| result_metadata | jsonb        | NN, {}       | Dữ liệu tối thiểu để dựng phản hồi, không chứa PII/token |
| created_at      | timestamptz  | NN           | Thời gian commit thao tác                                |

UQ `(scope_key, operation, idempotency_key)`. Chưa tự xóa trong demo để không mất khả năng chống lặp. result_metadata phải là JSON object. scope_key và resource_type không phải FK đa hình; backend chịu trách nhiệm, không tin client.

Trong transaction, kiểm tra bản ghi idempotency cũ rồi chèn trước một bản ghi giữ chỗ theo scope/key. Unique constraint serialize các request đồng thời dùng cùng key; request sau đọc lại kết quả đã commit, hoặc tiếp tục nếu transaction trước rollback. Cùng payload trả kết quả cũ, payload khác trả xung đột. Cập nhật response vào bản ghi giữ chỗ cùng transaction với nghiệp vụ để rollback không để lại kết quả thành công.

Không cache toàn bộ response chứa địa chỉ/token. Retry tạo đơn trả cùng ID/mã đơn; trạng thái đơn đọc lại có thể đã thay đổi. Mọi lần retry vẫn kiểm tra người gọi và quyền truy cập.

<a id="orders"></a>

## 6. Đơn hàng và snapshot

### 6.1. `orders`

| Cột                       | Kiểu          | Null/default | Ý nghĩa                                                                  |
| ------------------------- | ------------- | ------------ | ------------------------------------------------------------------------ |
| order_code                | varchar(64)   | NN, UQ       | Mã hệ thống sinh, ví dụ NX-ORD-000001                                    |
| user_id                   | bigint        | NN, FK users | Khách đặt                                                                |
| status                    | varchar(24)   | NN, PENDING  | PENDING / CONFIRMED / SHIPPING / DELIVERED / DELIVERY_FAILED / CANCELLED |
| version                   | bigint        | NN, 0        | Tăng khi đổi trạng thái; chống thao tác trên dữ liệu cũ                  |
| payment_method            | varchar(10)   | NN, COD      | CHECK COD / PAYOS                                                        |
| payment_status            | varchar(16)   | NN, UNPAID   | UNPAID / PAID                                                            |
| payos_order_code          | bigint        | NULL, UQ     | Mã số duy nhất gửi payOS; NULL với COD                                   |
| payos_payment_link_id     | varchar(100)  | NULL         | ID liên kết payOS                                                        |
| payos_checkout_url        | text          | NULL         | URL khách dùng để thanh toán                                             |
| payos_reference           | varchar(100)  | NULL, UQ     | Mã giao dịch do payOS trả về sau khi trả tiền                            |
| currency                  | char(3)       | NN, VND      | CHECK chỉ VND                                                            |
| subtotal                  | numeric(14,0) | NN           | Tổng tiền hàng snapshot                                                  |
| shipping_fee              | numeric(14,0) | NN           | 30000 tại lúc tạo                                                        |
| total_amount              | numeric(14,0) | NN           | subtotal + shipping_fee                                                  |
| recipient_name            | varchar(100)  | NN           | Snapshot người nhận                                                      |
| recipient_phone           | varchar(16)   | NN           | Snapshot điện thoại                                                      |
| province_code_snapshot    | varchar(20)   | NN           | Mã tỉnh tại lúc đặt                                                      |
| province_name_snapshot    | varchar(150)  | NN           | Tên tỉnh tại lúc đặt                                                     |
| ward_code_snapshot        | varchar(20)   | NN           | Mã đơn vị cấp xã tại lúc đặt                                             |
| ward_name_snapshot        | varchar(150)  | NN           | Tên đơn vị cấp xã tại lúc đặt                                            |
| address_line_snapshot     | varchar(300)  | NN           | Địa chỉ chi tiết tại lúc đặt                                             |
| location_version_snapshot | varchar(100)  | NN           | Phiên bản địa giới được dùng                                             |
| customer_note             | varchar(1000) | NULL         | Ghi chú khách; không phải ghi chú nội bộ                                 |
| expires_at                | timestamptz   | NN           | created_at + 24 giờ; áp dụng cho PENDING UNPAID                          |
| confirmed_at              | timestamptz   | NULL         | Lần xác nhận                                                             |
| first_shipped_at          | timestamptz   | NULL         | Lần đầu xuất kho; không đổi khi giao lại                                 |
| delivered_at              | timestamptz   | NULL         | Giao thành công                                                          |
| paid_at                   | timestamptz   | NULL         | Thời điểm xác nhận đã thu COD hoặc webhook payOS hợp lệ                  |
| cancelled_at              | timestamptz   | NULL         | Kết thúc bằng hủy                                                        |
| returned_at               | timestamptz   | NULL         | Nhận toàn bộ hàng giao thất bại về kho                                   |
| cancel_reason_code        | varchar(50)   | NULL         | CUSTOMER_CANCELLED / ADMIN_CANCELLED / EXPIRED / RETURN_RECEIVED         |
| cancel_reason             | varchar(500)  | NULL         | Nội dung lý do hủy                                                       |
| created_at, updated_at    | timestamptz   | NN           | Thời gian                                                                |

Mã đơn dùng sequence riêng `order_code_seq`, cùng nguyên tắc không cắt chữ số/không tái dùng như SKU. `payos_order_code` dùng sequence số riêng, duy nhất và không tái sử dụng vì payOS nhận một mã số cho payment request; không dùng mã đơn hiển thị `NX-ORD-...` làm mã này.

CHECK cùng dòng:

- `subtotal > 0`, `shipping_fee = 30000`, `total_amount = subtotal + shipping_fee`, version >= 0.
- `expires_at = created_at + interval '24 hours'`; tất cả thời điểm thực hiện nếu có không trước created_at. Chỉ PENDING UNPAID hết hạn; đơn PAID không tự hết hạn.
- DELIVERED bắt buộc PAID và có delivered_at/paid_at. Với COD, paid_at = delivered_at; payOS/webhook thuộc phạm vi tương lai. COD hiện chưa ghi event tracking `transaction`.
- COD PAID chỉ khi DELIVERED; PAYOS PAID chỉ khi xác minh webhook thành công và payment reference có giá trị. CANCELLED bắt buộc UNPAID.
- COD bắt buộc các cột `payos_*` NULL; PAYOS bắt buộc `payos_order_code`, cho phép link ID/URL NULL nếu khởi tạo liên kết lỗi; `payos_reference` chỉ có khi PAID.
- CANCELLED có cancelled_at, cancel_reason_code và cancel_reason không rỗng; trạng thái khác các cột hủy NULL.
- CONFIRMED/SHIPPING/DELIVERY_FAILED/DELIVERED phải có confirmed_at; SHIPPING/DELIVERY_FAILED/DELIVERED phải có first_shipped_at.
- PENDING không có confirmed_at/first_shipped_at; CONFIRMED chưa có first_shipped_at.
- RETURN_RECEIVED tương đương returned_at có giá trị và chỉ hợp lệ với CANCELLED + first_shipped_at có giá trị. CANCELLED đã từng giao bắt buộc là RETURN_RECEIVED; hủy trước giao không có returned_at.

Tổng dòng bằng subtotal, thứ tự các chuyển trạng thái và kiểm tra quyền thuộc transaction backend; không thể thay bằng CHECK chỉ đọc một dòng.

Index `(user_id, created_at DESC, id DESC)`, `(status, created_at DESC)`, `(expires_at) WHERE status = 'PENDING' AND payment_status = 'UNPAID'`, `(paid_at) WHERE payment_status = 'PAID'`.

Không cần FK từ đơn tới sổ địa chỉ. Snapshot là dữ liệu giao hàng độc lập, nên xóa địa chỉ không ảnh hưởng đơn. Các cột code/name snapshot không FK sang địa giới hiện tại.

### 6.2. `order_items`

| Cột                           | Kiểu          | Null/default            | Ý nghĩa                                                                                                         |
| ----------------------------- | ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| order_id                      | bigint        | NN, FK orders           | Đơn                                                                                                             |
| product_id                    | bigint        | NN, FK products         | Sản phẩm nguồn                                                                                                  |
| variant_id                    | bigint        | NN, FK product_variants | SKU nguồn                                                                                                       |
| product_name_snapshot         | varchar(200)  | NN                      | Tên tại lúc đặt                                                                                                 |
| sku_code_snapshot             | varchar(64)   | NN                      | Mã SKU tại lúc đặt                                                                                              |
| options_snapshot              | jsonb         | NN, `{}`                | Mã lựa chọn → `{label, value}` tại lúc đặt; giữ cả nhãn và giá trị, không tra cấu hình hiện hành để dựng lại    |
| image_asset_id_snapshot       | bigint        | NULL                    | ID image_assets tại thời điểm đặt; FK trong database chung và giữ asset lịch sử, metadata snapshot vẫn bất biến |
| image_storage_key_snapshot    | varchar(500)  | NULL                    | object_path bất biến tại lúc đặt                                                                                |
| image_storage_bucket_snapshot | varchar(255)  | NULL                    | Bucket tại lúc đặt                                                                                              |
| image_provider_snapshot       | varchar(50)   | NULL                    | Provider sở hữu asset lịch sử                                                                                   |
| image_content_type_snapshot   | varchar(100)  | NULL                    | MIME của asset ảnh lúc đặt; không dựa vào trạng thái provider                                              |
| image_cdn_url_snapshot        | text          | NULL                    | URL đọc ảnh; fallback UI khi CDN không sẵn sàng                                                                 |
| retailrocket_item_id_snapshot | varchar(50)   | NULL                    | ID nguồn tại lúc đặt, tiện export                                                                               |
| unit_price                    | numeric(14,0) | NN                      | Giá một đơn vị tại lúc đặt                                                                                      |
| quantity                      | integer       | NN                      | Số lượng > 0                                                                                                    |
| line_total                    | numeric(14,0) | Generated stored        | unit_price × quantity                                                                                           |
| created_at                    | timestamptz   | NN                      | Thời gian tạo                                                                                                   |

UQ (order_id, variant_id); CHECK unit_price > 0, quantity > 0, options_snapshot là object. Backend lấy label/value snapshot từ dữ liệu đã xác thực dưới khóa checkout. FK ghép Product/Variant và FK image_assets áp dụng trong database chung; không dùng dữ liệu Catalog hiện tại để viết lại snapshot. Index variant_id và product_id.

Sau khi tạo đơn, không sửa/xóa dòng, kể cả đơn CANCELLED. Không tính lại giá từ product_variants khi hiển thị đơn. Dòng đơn không cần `reservation_status`: trạng thái giữ hàng được xác định từ orders.status.

Ví dụ sau khi mua 2 áo Đen/M:

```json
{
  "id": "9001",
  "order_id": "501",
  "product_id": "101",
  "variant_id": "1001",
  "product_name_snapshot": "Áo thun basic",
  "sku_code_snapshot": "NX-SKU-000001",
  "options_snapshot": {
    "color": { "label": "Màu sắc", "value": "Đen" },
    "size": { "label": "Kích cỡ", "value": "M" }
  },
  "unit_price": 199000,
  "quantity": 2,
  "line_total": 398000
}
```

Đây là **JSON minh họa response**. Trong PostgreSQL, tên/mã SKU/giá/số lượng là cột riêng; riêng options_snapshot là JSONB để giữ các lựa chọn đa ngành. Nếu ngày mai áo đổi tên, nhãn thuộc tính đổi hoặc giá lên 219000đ, đơn này vẫn giữ tên/nhãn/giá lúc đặt, 199000đ/chiếc. Đơn có subtotal 398000, ship 30000, total 428000. Không cần chụp toàn bộ thông số Product vào đơn trong phạm vi hiện tại.

### 6.3. `order_status_history`

| Cột           | Kiểu         | Null/default   | Ý nghĩa                             |
| ------------- | ------------ | -------------- | ----------------------------------- |
| order_id      | bigint       | NN, FK orders  | Đơn                                 |
| from_status   | varchar(24)  | NULL           | NULL chỉ với dòng tạo đơn           |
| to_status     | varchar(24)  | NN             | Trạng thái sau thao tác             |
| order_version | bigint       | NN             | Phiên bản sau thao tác; tạo mới = 0 |
| actor_type    | varchar(16)  | NN             | CUSTOMER / ADMIN / SYSTEM           |
| actor_user_id | bigint       | NULL, FK users | NULL khi SYSTEM                     |
| reason_code   | varchar(50)  | NULL           | Mã lý do                            |
| reason_text   | varchar(500) | NULL           | Nội dung công khai cho khách        |
| created_at    | timestamptz  | NN             | Thời điểm chuyển                    |

UQ `(order_id, order_version)`; CHECK actor_type SYSTEM tương đương actor_user_id NULL; from/to thuộc tập trạng thái và tuân theo bảng chuyển ở mục 9.3. Dòng tạo là NULL → PENDING, version 0. Index `(order_id, created_at, id)` và `(to_status, created_at, order_id)`.

Lý do hủy/giao thất bại bắt buộc. Backend không trả ID/tên nhân viên nếu không cần; DTO Customer chỉ hiển thị diễn biến được phép. Dashboard đếm thất bại bằng distinct order_id trong thời gian chọn, tránh đếm mỗi lần giao lại như đơn mới.

### 6.4. `order_notes`

| Cột            | Kiểu          | Null/default  | Ý nghĩa                    |
| -------------- | ------------- | ------------- | -------------------------- |
| order_id       | bigint        | NN, FK orders | Đơn                        |
| author_user_id | bigint        | NN, FK users  | Admin ghi                  |
| content        | varchar(1000) | NN            | Ghi chú nội bộ, không rỗng |
| created_at     | timestamptz   | NN            | Thời gian                  |

Index `(order_id, created_at, id)`. Chỉ thêm và đọc trong phạm vi Admin; không join bảng này vào response Customer.

<a id="inventory"></a>

## 7. Tồn kho và đối soát reservation

Dự án không lưu lịch sử từng lần nhập, điều chỉnh, giữ hoặc giải phóng tồn. Giá trị hiện tại và ersion nằm trong inventory/product_inventory; nguồn reservation đối soát bằng các dòng đơn còn PENDING hoặc CONFIRMED. Lỗi hoặc trạng thái không nhất quán được xử lý trong cùng transaction, không suy ra từ bảng movement riêng.

### 7.2. Đối soát hàng đang giữ

```sql
SELECT v.id AS variant_id,
       v.reserved AS stored_reserved,
       COALESCE(SUM(oi.quantity) FILTER (
         WHERE o.status IN ('PENDING', 'CONFIRMED')
       ), 0) AS expected_reserved
FROM product_variants v
LEFT JOIN order_items oi ON oi.variant_id = v.id
LEFT JOIN orders o ON o.id = oi.order_id
GROUP BY v.id, v.reserved
HAVING v.reserved <> COALESCE(SUM(oi.quantity) FILTER (
  WHERE o.status IN ('PENDING', 'CONFIRMED')
), 0);
```

Kết quả đúng là không có dòng. Chạy một truy vấn nhất quán để kiểm tra; không tự sửa reserved khi có chênh lệch vì có thể che lỗi nghiệp vụ.

Đơn PENDING đã tới hạn nhưng chưa được transaction hủy vẫn được tính vào reserved. Nó không được xác nhận hoặc đặt thêm tác động mới, nhưng hàng chỉ được giải phóng khi cập nhật đơn và tổng tồn cùng commit. Không trừ nó khỏi truy vấn đối soát chỉ dựa vào expires_at.

Không dùng CHECK liên bảng để bảo đảm tổng reservation: [PostgreSQL quy định CHECK chỉ kiểm tra dòng hiện tại](https://www.postgresql.org/docs/current/ddl-constraints.html).

<a id="tracking"></a>

## 8. Recommendation, event và audit

Các bảng tracking/gợi ý này thuộc kế hoạch backend monolith, chưa có migration. Model Python/FastAPI là tích hợp tương lai, không cần recommendation_db hoặc consumer cho website hiện tại.

### 8.1. `recommendation_requests`

| Cột                 | Kiểu        | Null/default             | Ý nghĩa                                        |
| ------------------- | ----------- | ------------------------ | ---------------------------------------------- |
| visitor_id          | bigint      | NN, FK visitors          | Ngữ cảnh trình duyệt                           |
| tracking_session_id | bigint      | NN, FK tracking_sessions | Phiên hành vi                                  |
| user_id             | bigint      | NULL, FK users           | User tại lúc request                           |
| placement           | varchar(50) | NN                       | Vị trí hiển thị do server cho phép             |
| context_product_id  | bigint      | NULL, FK products        | Sản phẩm đang xem nếu có                       |
| rule_name           | varchar(50) | NN                       | RELATED_CATEGORY / POPULAR_7D / NEWEST         |
| rule_version        | varchar(50) | NN                       | Phiên bản thuật toán quy tắc                   |
| source              | varchar(24) | NN, rule_based           | Chỉ rule_based trong giai đoạn hiện tại        |
| context_metadata    | jsonb       | NN, {}                   | Ngữ cảnh tối thiểu, ví dụ ID sản phẩm loại trừ |
| created_at          | timestamptz | NN                       | Thời điểm tính kết quả                         |

FK ghép `(tracking_session_id, visitor_id)` tới tracking_sessions `(id, visitor_id)`. Index `(tracking_session_id, created_at)`; metadata là object được kiểm tra theo allowlist, không chứa thông tin giao hàng/token.

Lưu request và items trong một transaction trước khi trả kết quả; lỗi recommendation được phép làm ẩn khối, không cản checkout. Không suy ra user từ ID client gửi. Request rỗng vẫn có thể lưu mà không có item.

### 8.2. `recommendation_items`

| Cột                       | Kiểu        | Null/default                   | Ý nghĩa                                                   |
| ------------------------- | ----------- | ------------------------------ | --------------------------------------------------------- |
| recommendation_request_id | bigint      | NN, FK recommendation_requests | Lần gợi ý                                                 |
| product_id                | bigint      | NN, FK products                | Sản phẩm được trả về                                      |
| position                  | integer     | NN                             | Thứ tự bắt đầu từ 1                                       |
| reason_code               | varchar(50) | NN                             | Lý do thực tế, ví dụ SAME_CATEGORY / MOST_VIEWED / NEWEST |

CHECK position > 0; UQ `(recommendation_request_id, position)` và `(recommendation_request_id, product_id)`. Thêm UQ `(id, product_id)` cho FK event. Index product_id.

Lưu bằng bảng con để event tham chiếu đúng item/thứ tự và kiểm tra trùng rõ ràng, không dùng mảng JSON cho danh sách kết quả chính. Không cần score giả khi thuật toán hiện tại không tạo score.

RELATED_CATEGORY/POPULAR_7D thiếu ứng viên thì trả ít hơn; không có mới fallback NEWEST và ghi đúng rule/reason. Loại sản phẩm hiện tại/trong giỏ, ngừng bán hoặc không có SKU available > 0. Popularity dùng event view thật trong 7 ngày, đếm distinct visitor_id; seed/replay không tham gia.

### 8.3. `interaction_events`

| Cột                    | Kiểu         | Null/default                  | Ý nghĩa                                                                                       |
| ---------------------- | ------------ | ----------------------------- | --------------------------------------------------------------------------------------------- |
| event_id               | varchar(100) | NN, UQ                        | Khóa chống trùng, khác PK số tự tăng                                                          |
| event_type             | varchar(30)  | NN                            | view / search / addtocart / removefromcart / order_created / transaction / impression / click |
| event_source           | varchar(16)  | NN                            | FRONTEND / BACKEND                                                                            |
| data_origin            | varchar(16)  | NN, LIVE                      | LIVE / SEED / REPLAY                                                                          |
| schema_version         | integer      | NN, 1                         | Phiên bản schema event                                                                        |
| visitor_id             | bigint       | NULL, FK visitors             | Trình duyệt tạo hành vi                                                                       |
| tracking_session_id    | bigint       | NULL, FK tracking_sessions    | Phiên tạo hành vi                                                                             |
| user_id                | bigint       | NULL, FK users                | Chủ hành vi tại lúc xảy ra                                                                    |
| product_id             | bigint       | NULL, FK products             | Sản phẩm nếu loại event cần                                                                   |
| variant_id             | bigint       | NULL, FK product_variants     | SKU nếu đã xác định                                                                           |
| order_id               | bigint       | NULL, FK orders               | Đơn liên quan                                                                                 |
| order_item_id          | bigint       | NULL, FK order_items          | Dòng mua hoàn tất                                                                             |
| recommendation_item_id | bigint       | NULL, FK recommendation_items | Item gợi ý đã hiển thị/click                                                                  |
| quantity               | integer      | NULL                          | Mức tăng/giảm giỏ hoặc số lượng mua, luôn > 0                                                 |
| metadata               | jsonb        | NN, {}                        | Chỉ các trường bổ sung được phép                                                              |
| occurred_at            | timestamptz  | NN                            | Lúc xảy ra, backend tự xác định với event nghiệp vụ                                           |
| received_at            | timestamptz  | NN                            | Lúc backend nhận/ghi                                                                          |

`event_id` phía frontend có dạng UUID ngẫu nhiên là được, nhưng **PK vẫn là bigint tự tăng**. Prefix do server gắn `fe:`/`be:` để client không chiếm khóa event nghiệp vụ. Backend có thể dùng khóa xác định `be:transaction:order-item:9001` hoặc `be:order-created:501`.

| Loại           | Bắt buộc                                            | Nguồn và quy tắc                                                                           |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| view           | visitor/session, product                            | FRONTEND; chi tiết tải thành công                                                          |
| search         | visitor/session                                     | FRONTEND; submit tìm kiếm, product/variant/order NULL                                      |
| impression     | visitor/session, product, recommendation_item       | FRONTEND; ≥50% hiển thị liên tục ≥1 giây                                                   |
| click          | visitor/session, product, recommendation_item       | FRONTEND; click từ khối gợi ý                                                              |
| addtocart      | visitor/session, product, variant, quantity         | BACKEND; lượng tăng thực tế                                                                |
| removefromcart | visitor/session, product, variant, quantity         | BACKEND; lượng giảm thực tế                                                                |
| order_created  | visitor/session, user, order                        | BACKEND; một event/đơn, product/variant/order_item NULL                                    |
| transaction    | user, order, order_item, product, variant, quantity | BACKEND; một event/dòng khi thanh toán được xác minh (payOS webhook) hoặc thu COD khi giao |

CHECK theo ma trận trên và danh sách enum, quantity > 0 nếu có, schema_version > 0, metadata là object. Event nghiệp vụ chỉ được ghi nội bộ, endpoint public chỉ nhận bốn loại FRONTEND.

Riêng `transaction` do Admin xác nhận sau này: user_id là **khách mua**, không phải Admin. visitor/session để NULL vì có thể không có phiên khách đang hoạt động; nối về event order_created qua order_id khi cần attribution. Người Admin thao tác nằm trong order_status_history. Không tự tạo phiên browsing cho khách lúc Admin giao hàng.

FK ghép:

- `(tracking_session_id, visitor_id)` tới tracking_sessions `(id, visitor_id)`; hai trường cùng NULL hoặc cùng có giá trị.
- `(variant_id, product_id)` tới product_variants `(id, product_id)`; có variant phải có product.
- `(order_item_id, order_id, variant_id, product_id)` tới order_items `(id, order_id, variant_id, product_id)`; có order_item thì tất cả phải có.
- `(recommendation_item_id, product_id)` tới recommendation_items `(id, product_id)`; có recommendation_item phải có product.

Backend kiểm tra recommendation request thuộc ngữ cảnh người gọi và event user_id khớp danh tính server. FK không thay thế kiểm tra quyền. Retry event cùng ID nhưng nội dung khác bị từ chối, không ghi đè event đầu.

Partial UQ `(order_id) WHERE event_type = 'order_created'`; partial UQ `(order_item_id) WHERE event_type = 'transaction'`. Index `(product_id, occurred_at DESC)`, `(tracking_session_id, occurred_at, id)`, `(user_id, occurred_at DESC)`, `(order_id)`, `(recommendation_item_id)`. Với popularity LIVE view dùng index `(occurred_at, product_id, visitor_id) WHERE event_type = 'view' AND data_origin = 'LIVE'`.

Không lưu query tìm kiếm thô trong event để tránh người dùng vô tình gõ email/điện thoại. Có thể lưu query_length, result_count, category_id. Event không chứa tên người nhận, email, địa chỉ, ghi chú, token, URL có query tùy ý hoặc payload request nguyên bản. JSONB tiện cho dữ liệu bổ sung, còn các trường thường lọc/join vẫn là cột: [kiểu JSON của PostgreSQL](https://www.postgresql.org/docs/current/datatype-json.html).

### 8.4. `admin_audit_logs`

| Cột           | Kiểu         | Null/default | Ý nghĩa                                |
| ------------- | ------------ | ------------ | -------------------------------------- |
| actor_user_id | bigint       | NN, FK users | Admin thao tác                         |
| action        | varchar(100) | NN           | PRODUCT_UPDATED, CUSTOMER_LOCKED...    |
| entity_type   | varchar(50)  | NN           | user / product / variant / category... |
| entity_id     | bigint       | NN           | ID đối tượng, không FK đa hình         |
| before_data   | jsonb        | NULL         | Các trường được phép trước thay đổi    |
| after_data    | jsonb        | NULL         | Các trường được phép sau thay đổi      |
| reason        | varchar(500) | NULL         | Lý do theo nghiệp vụ                   |
| created_at    | timestamptz  | NN           | Thời gian                              |

Index `(entity_type, entity_id, created_at)` và `(actor_user_id, created_at)`. JSON nếu có phải là object. Ghi cùng transaction thay đổi. Chỉ ghi diff theo allowlist; không dump toàn bộ user/order, password_hash, token hoặc địa chỉ vào audit. Chuyển trạng thái đơn và thay đổi kho đã có lịch sử chuyên biệt; audit chỉ thêm nếu có mục đích tra cứu, không làm nguồn tính tồn.

### 8.5. `email_outbox`

Hàng đợi dùng cho email xác nhận/thay đổi trạng thái đơn; email khôi phục mật khẩu gửi trực tiếp sau khi tạo token, không lưu liên kết có token rõ trong hàng đợi.

| Cột             | Kiểu         | Null/default    | Ý nghĩa                                                              |
| --------------- | ------------ | --------------- | -------------------------------------------------------------------- |
| event_key       | varchar(160) | NN, UQ          | Khóa xác định loại sự kiện và đối tượng, chống xếp/gửi lặp           |
| user_id         | bigint       | NULL, FK users  | Người nhận nếu còn tài khoản                                         |
| order_id        | bigint       | NULL, FK orders | Đơn liên quan                                                        |
| recipient_email | varchar(254) | NN              | Địa chỉ tại thời điểm phát sinh sự kiện                              |
| template_key    | varchar(80)  | NN              | Tên template allowlist; không lưu HTML tùy ý                         |
| payload         | jsonb        | NN, {}          | Dữ liệu mẫu tối thiểu, không chứa token, credential hoặc request thô |
| status          | varchar(16)  | NN, PENDING     | PENDING / SENT / FAILED                                              |
| attempts        | integer      | NN, 0           | Số lần thử gửi                                                       |
| available_at    | timestamptz  | NN              | Thời điểm worker được phép thử tiếp                                  |
| lease_token     | uuid         | NULL            | Token nhận việc hiện tại, chặn worker cũ ghi đè kết quả              |
| lease_until     | timestamptz  | NULL            | Hạn lease để worker khác phục hồi job sau restart                    |
| sent_at         | timestamptz  | NULL            | Thời điểm gửi thành công                                             |
| finished_at     | timestamptz  | NULL            | Thời điểm trạng thái SENT/FAILED kết thúc                            |
| last_error_code | varchar(80)  | NULL            | Mã lỗi đã lọc, không lưu nội dung chứa bí mật                        |
| created_at      | timestamptz  | NN              | Thời điểm xếp hàng                                                   |

UQ event_key bảo đảm một email cho mỗi loại sự kiện; CHECK attempts >= 0, payload là object và trạng thái phù hợp với sent_at. Index `(status, available_at, id)` cho worker và `(order_id, created_at)` cho tra cứu vận hành. Ghi hàng đợi cùng transaction đổi trạng thái/tạo đơn; worker gửi ngoài transaction, cập nhật trạng thái và retry lỗi tạm thời với backoff, giới hạn số lần. Recipient là PII, chỉ role backend được đọc; không đưa vào event tracking/audit. Giữ hàng gửi tối đa 90 ngày rồi xóa theo chính sách dọn dẹp.

Worker nhận job trong transaction ngắn bằng `FOR UPDATE SKIP LOCKED`, gửi bên ngoài transaction và cập nhật theo lease token. Mặc định quét 5 giây, lease 60 giây, timeout gửi 30 giây, tối đa 5 lần với backoff 30 giây, 2/10/30 phút. Cấu hình provider thiếu khiến job FAILED; job PENDING giữ lại qua restart. SMTP có thể đã nhận thư trước khi backend mất kết nối nên không đảm bảo giao đúng một lần.

### 8.6. `user_notifications`

Lưu thông báo Customer về đơn COD. Mỗi lần tạo hoặc đổi trạng thái đơn tạo một event key dựa trên ID `order_status_history`; chỉ ghi từ thời điểm triển khai, không backfill lịch sử.

| Cột       | Kiểu         | Null/default | Ý nghĩa |
|-----------|--------------|--------------|---------|
| id        | bigint       | NN, PK       | ID thông báo, serialize thành chuỗi |
| user_id   | bigint       | NN, FK users | Customer sở hữu thông báo |
| order_id  | bigint       | NN, FK orders | Đơn liên quan |
| event_key | varchar(160) | NN           | Khóa sự kiện dùng cùng email job |
| type      | varchar(40)  | NN           | ORDER_CREATED/CONFIRMED/CANCELLED/EXPIRED |
| title     | varchar(160) | NN           | Tiêu đề hiển thị |
| body      | varchar(500) | NN           | Nội dung ngắn, không chứa ghi chú riêng |
| created_at| timestamptz  | NN           | Thời điểm tạo |
| read_at   | timestamptz  | NULL         | Thời điểm Customer đánh dấu đã đọc |

Unique `(user_id, event_key)` chống tạo trùng; index `(user_id, created_at DESC, id DESC)` cho danh sách và `(user_id, read_at)` cho số chưa đọc. Cùng transaction Order ghi `user_notifications` và `email_outbox`; API luôn lấy chủ sở hữu từ phiên đăng nhập. SSE chỉ phát tín hiệu đồng bộ, PostgreSQL vẫn là nguồn dữ liệu. Chưa đặt thời hạn xóa thông báo.

<a id="transactions"></a>

## 9. Transaction và xử lý cạnh tranh trong database chung

Các use case dưới đây dùng transaction trên database chung; provider của các module tham gia phải dùng cùng Prisma.TransactionClient/transaction context. Không dùng Saga hoặc messaging để thay thế tính nguyên tử giữa đơn/tồn/giỏ.

### 9.1. Quy tắc khóa chung

Dùng transaction ngắn ở mức READ COMMITTED, khóa bản ghi khi thao tác cần tính đúng trạng thái hiện tại. `SELECT ... FOR UPDATE` giữ khóa ghi dòng đến hết transaction: [tài liệu khóa của PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

Thứ tự thống nhất khi một thao tác cần nhiều nhóm: users theo ID → visitors theo ID → carts theo ID → orders theo ID → categories khi cần → products theo ID → product_variants theo ID. Bản ghi giữ chỗ idempotency được tạo trước các khóa dòng; unique constraint phân xử các request cùng scope/key. Brand seed chỉ đọc sau khởi tạo, không phải nhóm khóa quản trị/runtime. Những nhóm không dùng thì bỏ qua. Mọi đường ghi catalog/stock/checkout phải theo cùng thứ tự, không có nhánh khóa SKU rồi quay lại khóa product/order.

Lock products khi checkout và khi sửa trạng thái/ảnh/SKU để không đặt đơn bằng snapshot nửa cũ nửa mới. Master dữ liệu ngừng dùng và thay bản địa giới cũng dùng cùng quy ước lock hoặc lock chia sẻ phù hợp khi đọc xác thực. Tất cả thao tác địa chỉ/khóa tài khoản/đổi mật khẩu trước hết khóa user, tránh tài khoản bị khóa giữa kiểm tra và commit.

Nếu có deadlock/serialization failure, rollback toàn bộ và retry có giới hạn với cùng idempotency key; không retry từng câu lệnh rời rạc. Không upload file, gọi network hoặc gọi dịch vụ AI khi đang giữ transaction.

### 9.2. Tạo đơn COD

1. Xác thực Customer/session; kiểm tra bản ghi theo user và idempotency key; cùng key/payload đã thành công thì trả đơn cũ, payload khác thì trả xung đột; nếu chưa có thì tạo bản ghi giữ chỗ idempotency trong transaction.
2. Khóa user, địa chỉ đã lưu và giỏ; kiểm tra quyền sở hữu, phiên bản địa chỉ và các dòng/quantity vừa xác nhận.
3. Khóa Product → SKU → Inventory theo ID tăng dần; Catalog đọc lại trạng thái bán, giá và available. Giá client chỉ dùng đối chiếu, tổng tiền được tính từ dữ liệu Catalog trong transaction.
4. Khi giá/dòng/địa chỉ thay đổi hoặc thiếu hàng, rollback và yêu cầu Customer tải lại/xác nhận; không giữ một phần.
5. Tạo đơn COD `PENDING / UNPAID`, snapshot bất biến, phí 30.000đ, expires_at = created_at + 24 giờ, lịch sử và `order_created`; tăng reserved, xóa đúng cart_items đã chọn và lưu kết quả idempotency trong cùng transaction.
6. Gửi lại cùng key/payload lấy đúng đơn đã commit; unique constraint khiến request đồng thời cùng key chờ kết quả của request trước. GET tra cứu có thể chưa thấy transaction chưa commit; khi đó client retry POST với cùng key/payload để nhận kết quả an toàn.

### 9.3. Chuyển trạng thái đơn

Mọi thao tác có version kỳ vọng và idempotency key; khóa order trước khi kiểm tra trạng thái/hạn, rồi khóa các SKU cần đổi tồn. Snapshot và totals không đổi.

| Từ                | Thao tác                                 | Sang            | Biến động từng dòng q                                                             |
| ----------------- | ---------------------------------------- | --------------- | --------------------------------------------------------------------------------- |
| PENDING           | Admin xác nhận                           | CONFIRMED       | UNPAID chỉ trước hạn; PAYOS đã PAID không tự hết hạn                              |
| PENDING           | Customer/Admin hủy hoặc hệ thống hết hạn | CANCELLED       | Chỉ UNPAID; reserved −q, RELEASE                                                  |
| CONFIRMED         | Admin hủy có lý do                       | CANCELLED       | Chỉ UNPAID; reserved −q, RELEASE                                                  |
| CONFIRMED         | Admin bắt đầu giao                       | SHIPPING        | on_hand −q, reserved −q, SHIP                                                     |
| PENDING/CONFIRMED | Webhook payOS hợp lệ                     | Giữ trạng thái  | Chỉ PAYOS UNPAID, chữ ký/mã đơn/số tiền khớp; PAID, paid_at, transaction mỗi dòng |
| SHIPPING          | Xác nhận giao + đã thu COD               | DELIVERED       | COD: PAID, paid_at, transaction mỗi dòng                                          |
| SHIPPING          | Xác nhận giao payOS đã PAID              | DELIVERED       | Giữ PAID; không ghi transaction trùng                                             |
| SHIPPING          | Báo giao thất bại có lý do               | DELIVERY_FAILED | Không đổi; giao lại, không hoàn tiền trong phạm vi này                            |
| DELIVERY_FAILED   | Giao lại                                 | SHIPPING        | Không đổi; không ghi SHIP lần nữa                                                 |
| DELIVERY_FAILED   | Xác nhận đã nhận đủ hàng nguyên vẹn      | CANCELLED       | Chỉ UNPAID; on_hand +q, RETURN                                                    |

Update trạng thái/version/mốc thời gian, tổng tồn, history, business events và idempotency trong cùng transaction. PayOS webhook xác minh chữ ký và đối chiếu mã đơn/số tiền trước khi khóa đơn; cập nhật PAID và ghi transaction events nguyên tử. Webhook trùng trả thành công mà không ghi hiệu ứng lặp. COD ghi transaction lúc Admin xác nhận thu tiền; không ghi lại khi đơn PAID chuyển DELIVERED. Không hủy/hoàn tồn đơn đã PAID trong phạm vi này; đơn payOS giao thất bại chỉ có thể giao lại. Không có đường SHIPPING → CANCELLED trực tiếp hoặc mở lại DELIVERED/CANCELLED.

### 9.4. Đơn quá hạn

Worker tìm PENDING UNPAID có expires_at <= thời gian DB, khóa từng đơn và kiểm tra lại trước hủy. PENDING PAYOS đã PAID không hết hạn. Có thể dùng FOR UPDATE SKIP LOCKED khi chạy nhiều worker; mỗi đơn là transaction riêng. Chạy quét bù khi backend khởi động.

Ngay khi admin xác nhận, lấy thời gian thực của DB **sau khi lấy khóa** (ví dụ clock_timestamp), không chỉ dựa vào now() từ đầu transaction đã chờ lâu. Nếu đơn UNPAID hết hạn, chuyển hủy và giải phóng giữ hàng bằng transaction hợp lệ; trả kết quả đã hết hạn sau commit, không ném lỗi bên trong làm rollback việc hủy. PAYOS đã PAID vẫn được xác nhận kể cả sau expires_at. CONFIRMED không tự hết hạn.

### 9.5. Thêm giỏ cho Customer đã đăng nhập

- Chỉ Customer hoạt động đã xác thực mới được đọc/thêm/sửa/xóa giỏ. API xác định giỏ bằng user_id trong phiên, không nhận user_id từ request body.
- Thêm/tăng giỏ dùng khóa cart và kiểm tra SKU/available hiện tại, chống lặp theo idempotency key; không thay đổi tồn. Event addtocart/removefromcart ghi cùng transaction.
- SKU phải đang bán và lượng cộng dồn không vượt available; nếu không đủ hàng, từ chối và trả lượng tối đa để Customer điều chỉnh.
- Không có giỏ Guest, thời hạn giỏ hoặc quy trình hợp nhất khi đăng nhập. Checkout vẫn kiểm tra lại stock và giá.

### 9.6. Nhập hàng và kiểm kê

Khóa Product rồi SKU rồi Inventory, đọc reserved mới nhất, tính on_hand mới; từ chối nếu nhỏ hơn reserved. Cập nhật on_hand và idempotency cùng transaction. Với số thực tế bằng on_hand hiện tại, trả thành công không thay đổi. Không cho Admin đặt reserved trực tiếp và không lưu lịch sử tồn.

### 9.7. Tích hợp payOS

- Lưu client ID, API key và checksum key trong secret/config backend; không lưu trong database, frontend hoặc log.
- Tạo payment link phía backend theo `payos_order_code`, `total_amount`, VND, return URL, cancel URL và thời hạn không vượt `orders.expires_at`. Một đơn chỉ có một liên kết đang dùng; retry trả/tạo lại liên kết cho cùng đơn, không tạo thêm đơn hoặc cộng giữ hàng.
- Webhook kiểm tra chữ ký theo tài liệu payOS, sau đó đối chiếu mã đơn, số tiền, currency, phương thức PAYOS và trạng thái UNPAID. Khi triển khai tương lai, kết quả payOS ghi payment_status, paid_at, payos_reference và transaction events trong cùng transaction. COD hiện chỉ cập nhật PAID/paid_at khi Admin xác nhận thu tiền; Tracking chưa triển khai.
- Chữ ký sai, số tiền/mã đơn không khớp, webhook đến đơn đã hủy/hết hạn hoặc trạng thái không phù hợp không được đánh dấu PAID; lưu cảnh báo để đối soát thủ công. Không cung cấp refund trong phiên bản này.
- Return/cancel URL chỉ phục vụ điều hướng giao diện; frontend đọc trạng thái đơn từ API. Webhook lặp cho giao dịch đã thành công phản hồi 2xx nhưng không cập nhật doanh thu/event lần nữa.

<a id="retention"></a>

## 10. Xóa dữ liệu, bảo toàn lịch sử và quyền ghi

| Dữ liệu                                          | Chính sách                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| User                                             | Không xóa qua UI; khóa tài khoản                                                                                            |
| Category                                         | Ngừng dùng; chỉ xóa dữ liệu chưa được tham chiếu nếu có công cụ bảo trì                                                     |
| CatalogDataset/CategoryMapping và cột provenance | Không sửa/xóa qua API; giữ artifact/checksum và FK, không cascade mất liên kết nguồn                                        |
| Product/Variant                                  | Ngừng bán; không cung cấp API xóa trong bản đầu, giữ FK của đơn/event                                                       |
| Địa giới                                         | Giữ các bản cũ; không cascade xóa địa chỉ                                                                                   |
| UserAddress                                      | Có thể xóa vật lý; đơn dùng snapshot độc lập                                                                                |
| ProductImage                                     | Có thể gỡ liên kết nếu catalog vẫn hợp lệ; bản đầu không xóa vật lý asset Supabase Storage, kể cả asset chưa gắn            |
| ImageAsset                                       | Catalog sở hữu metadata/trạng thái upload và operation chống lặp; giữ asset có metadata trong Catalog và lịch sử, chưa xóa vật lý trong bản đầu |
| CartItem                                         | Có thể xóa theo nghiệp vụ; FK cart_id cho phép ON DELETE CASCADE khi dọn giỏ                                                |
| Cart/Visitor/TrackingSession                     | Giữ trong demo; đánh trạng thái hết hạn, không cascade mất event                                                            |
| Order/OrderItem/History/Movement                 | Giữ nguyên; không sửa/xóa lịch sử qua API                                                                                   |
| Event/Recommendation/Audit                       | Chỉ thêm và đọc; chưa có tác vụ tự dọn trong demo                                                                           |
| Idempotency                                      | Giữ kết quả trong demo; không xóa trước lịch sử nghiệp vụ liên quan                                                         |
| PasswordResetToken                               | Xóa token đã hết hạn/đã dùng theo tác vụ dọn định kỳ                                                                        |
| EmailOutbox                                      | Xóa bản ghi SENT/FAILED quá 90 ngày; giữ PENDING để retry/điều tra                                                          |

Tài khoản ứng dụng không có quyền DDL/TRUNCATE. Migration dùng tài khoản riêng. Với bảng append-only như order_items, history, movements, events và audit, quyền runtime chỉ SELECT/INSERT nếu workflow cho phép; UPDATE/DELETE bị chặn ở DB. Dùng trigger chặn thay đổi cột snapshot orders và sku_code/ý nghĩa SKU đã có đơn khi tạo migration. Những bất biến tổng nhiều bảng còn được bảo vệ bởi transaction và kiểm thử; không tuyên bố chỉ FK/CHECK đã bảo đảm toàn bộ nghiệp vụ.

Giữ database/CSV/manifest bền vững. Backup Nexora gồm metadata asset/CDN URL và artifact seed; không có kho file gốc riêng. Khôi phục bytes ảnh phụ thuộc Supabase Storage, không được bảo đảm chỉ bằng backup database.

<a id="implementation"></a>

## 11. Index, dữ liệu nguồn và thứ tự triển khai

### 11.1. Nguyên tắc index

Các index cụ thể đã ghi ở từng bảng. PK/UQ tạo index phục vụ khóa đó; không tạo thêm index trùng tiền tố một cách máy móc. FK phía con không tự có index phù hợp trong mọi trường hợp, vì vậy kiểm tra truy vấn join/xóa trước khi bổ sung.

Bản đầu không phân vùng event, không thêm GIN cho mọi JSONB, không materialized view dashboard. Khi có dữ liệu thực và truy vấn chậm, dùng EXPLAIN ANALYZE để quyết định. Dashboard dùng orders.paid_at cho tiền thu, orders.created_at cho đơn mới và status_history cho lịch sử thất bại/hủy.

### 11.2. Seed có thể chạy lại

1. Seed Admin bằng cấu hình local, lưu hash; không ghi mật khẩu thật vào tài liệu/repository.
2. Không nhập địa giới vào database; giao diện lấy dữ liệu JSON tỉnh/xã từ nguồn online đã chọn.
3. Đọc/validate toàn bộ ba CSV và manifest trước ghi: schema 14/3/4 cột, count 500/23/1664 của snapshot đầu, ID duy nhất, category/root/name tham chiếu đúng, số nguyên/boolean hợp lệ, checksum và quota đúng. root của Product suy từ danh mục seed; không đòi category nguồn cấp item mà CSV không có. Tái xuất từ clean phải dùng latest category một dòng/item và kiểm tra cây như SRS 8.3.1.
4. Đọc/kiểm tra placeholder bằng stream/buffer giới hạn, gọi provider module Catalog trong backend với idempotency key ổn định; upload Supabase Storage; ghi metadata sau phản hồi thành công trước transaction nhập lô. Không gọi network khi giữ khóa DB hoặc lưu file gốc. Upload thất bại thì chưa nhập catalog. Giữ asset khi rollback để seed lại dùng cùng ID; không tự dọn trong bản đầu.
5. Khóa tác vụ seed catalog để không chạy hai importer đồng thời. Trong một transaction, tạo/đối chiếu catalog_datasets; cùng version khác hash thì từ chối. Nhập categories theo `(seed_dataset_id, seed_category_id)`, parent_id NULL cho danh mục mới; giữ cây danh mục đã có. Product seed dùng options `{}` và cấu hình `{"options": {}}`. Nhập mappings qua ID nội bộ và nhãn brand metadata seed theo name_key. Không ép ID CSV vào identity và không gán provenance lên danh mục Admin trùng tên; xung đột phải báo để xử lý.
6. Nhập Product mới theo source_item_id → retailrocket_item_id, lưu seed_product_id/seed_sku, danh mục seed và thống kê nguồn. Đối chiếu thêm cặp dataset/seed_product_id; nếu ID cũ trỏ item khác, source_item_id thuộc dataset khác hoặc Product đã có nhưng thiếu provenance cần thiết thì báo xung đột, không ghép tùy ý. category_id vận hành lúc tạo bằng seed_category_id nội bộ; về sau Admin được đổi category_id.
7. Product mới có variant_option_keys `[]`, nhận một SKU options `{}`, mã vận hành sinh qua sequence, price = CSV.price, on_hand = CSV.stock, reserved = 0, first_reserved_at NULL; thêm ảnh chung seed variant_id NULL làm đại diện. Chỉ mở ACTIVE sau đủ kiểm tra, kể cả hết hàng; is_active false → INACTIVE.
8. Với Product đã import, không tái dựng SKU mặc định theo options rỗng nếu Admin đã sửa biến thể; không ghi đè mô tả/tập mã/options, giá, tồn, category/cấu hình/cây, ảnh hoặc trạng thái. Seed chỉ tạo Product chưa có và các bản ghi nguồn còn thiếu khi nhất quán; provenance bất biến sai thì dừng để sửa chủ động. Kiểm tra counts và tham chiếu của bộ seed rồi commit toàn lô. Lỗi giữa chừng rollback dataset/category/mapping/Product/SKU mới.
9. Không import hàng triệu event RetailRocket vào interaction_events LIVE. source_interactions/source_users không sinh event hoặc đơn. Dataset training ở khu vực nguồn riêng; replay dùng DB test hoặc data_origin REPLAY.

`catalog_datasets.version`, ID RetailRocket và các unique constraint giúp seed không nhân đôi. Manifest/CSV là artifact bất biến; bảng catalog_datasets chỉ lưu thông tin đối chiếu, không có bảng ETL/job. Sản phẩm Admin mới không có RetailRocket ID vẫn bán được và nhận recommendation theo quy tắc. Đổi sang một bộ catalog mới trong DB đang có giao dịch cần migration đối chiếu riêng; không tự reset database hoặc cập nhật mapping nguồn của Product cũ.

#### Ánh xạ CSV sang database

| Nguồn                                                  | Đích hoặc xử lý                                                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| products.product_id                                    | products.seed_product_id; products.id vẫn identity                                                                                                                    |
| products.source_item_id                                | products.retailrocket_item_id, UQ toàn catalog                                                                                                                        |
| products.sku                                           | products.seed_sku; không ghi đè product_variants.sku_code                                                                                                             |
| products.name, description                             | products.name/description; tạo search_name/slug theo quy tắc web                                                                                                      |
| products.brand                                         | Phân giải brands.name_key → products.brand_id                                                                                                                         |
| products.category_id, category_name                    | Tra danh mục seed, kiểm tra tên trên artifact; lưu products.seed_category_id và category_id lúc tạo                                                                   |
| products.price, stock                                  | Một SKU mặc định: price, on_hand; reserved = 0                                                                                                                        |
| Không có thuộc tính trong CSV                          | Product variant_option_keys `[]`; SKU options `{}`; Category mới parent_id NULL/option_config `{}`                                                |
| products.image_url                                     | product_images.source_url; upload qua Catalog lên Supabase Storage, lưu image_asset_id và projection bucket/object_path/public_url; is_placeholder = true |
| products.is_active                                     | true → ACTIVE sau validation, false → INACTIVE                                                                                                                        |
| products.interactions, users                           | products.source_interactions/source_users; snapshot nguồn                                                                                                             |
| categories.category_id, root_categoryid, category_name | categories.seed_category_id, retailrocket_root_category_id, name                                                                                                      |
| mapping.categoryid, root_categoryid, category_id       | retailrocket_category_mappings.source_category_id/root_category_id/category_id đã phân giải                                                                           |
| mapping.category_name                                  | Chỉ đối chiếu tên categories_demo lúc import; không ghi đè tên Admin khi seed lại                                                                                     |

products_demo không xuất categoryid của item, nên products.retailrocket_category_id mặc định NULL. Nếu cần điền, bổ sung artifact `itemid → latest categoryid` cùng snapshot/version và kiểm tra FK mapping. Không thể suy ngược chính xác leaf category từ category_mapping khi một root có nhiều leaf. Timestamp latest category và parentid cũng không tồn tại trong ba CSV; không bịa dữ liệu để lấp schema.

### 11.3. Các đợt migration đề xuất

| Đợt | Nội dung                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Hàm chuẩn hóa, users/auth_sessions, địa giới và địa chỉ                                                                                                                                                                                                          |
| 02  | catalog_datasets → categories có parent_id/option_config → brands metadata/mappings → products description/variant_option_keys → variants options/options_key/first_reserved_at → images variant_id; hàm canonical, sequence SKU và CHECK/UQ/FK nội bộ Catalog |
| 03  | Visitor/session, cart, idempotency                                                                                                                                                                                                                               |
| 04  | Sequence mã đơn, orders/items/history/notes                                                                                                                                                                                                                       |
| 05  | Recommendation requests/items, events, audit                                                                                                                                                                                                                     |
| 06  | Trigger bất biến, quyền runtime, chỉ mục bổ sung và seed                                                                                                                                                                                                         |
| 07  | password_reset_tokens, email_outbox, worker gửi email và chính sách dọn dữ liệu                                                                                                                                                                                  |

Các đợt trên là các nhóm nội dung thiết kế, không phải số migration phải chạy lại. Phần users/auth_sessions trong đợt 01 đã có ở migration 1; không tạo lại bảng. Các mục còn thiếu như địa giới/địa chỉ phải nằm trong migration mới. Task 002/010/019/021/024/029/040/043/049/063 theo dõi tại [Implementation tasks](IMPLEMENTATION_TASKS.md).

Các đợt trên là nhóm thay đổi schema theo kế hoạch nghiệp vụ, không phải migration đang chạy. Dự án hiện dùng `schema.prisma` và đồng bộ thủ công với PostgreSQL local bằng `npm run db:push`; Prisma Migrate và các file migration đã được gỡ. Module ảnh lưu metadata trong database chung; Tracking/gợi ý website thuộc backend; model Python/FastAPI là tích hợp tương lai, chưa cần database riêng.

### 11.4. Triển khai Catalog trong schema ứng dụng

Schema hiện tại mô tả các bảng Auth, Category, Product/SKU, media và inventory trong `backend/prisma/schema.prisma`. Prisma Migrate và migration files không thuộc workflow hiện tại. Các bảng Order/Payment/Tracking/Recommendation còn lại là thiết kế; triển khai schema bằng `db:push` chỉ khi chủ động đồng bộ PostgreSQL local.

Schema được mô tả trong `backend/prisma/schema.prisma`; chỉ đồng bộ thủ công bằng `npm run db:push` tới PostgreSQL local không có dữ liệu cần giữ. Không trỏ lệnh này tới Supabase hoặc database dùng chung. Bất biến snapshot/ID/tồn được kiểm chứng bằng DB test riêng trước bàn giao.

<a id="verification"></a>

## 12. Kiểm chứng thiết kế khi triển khai

Đây là danh sách cần kiểm thử sau khi có migration/backend, **chưa phải kết quả đã chạy**.

| Mã    | Kịch bản                                                                                                                  | Kết quả phải đạt                                                                                                                 | SRS                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| DB-01 | Tạo options color/storage rồi tạo lại với thứ tự khóa/hoa thường/khoảng trắng khác; tạo hai SKU options rỗng cùng Product | UQ product/options_key từ chối tổ hợp trùng; không phụ thuộc thứ tự JSON hoặc kiểu ngành hàng                                    | TC-26               |
| DB-02 | Hai request lấy mã SKU cùng lúc, một rollback                                                                             | Mã không trùng, khoảng trống hợp lệ                                                                                              | TC-26               |
| DB-03 | Hai request cùng tranh sản phẩm cuối                                                                                      | Chỉ một đơn giữ được; không âm tồn                                                                                               | TC-16               |
| DB-04 | Retry đặt đơn sau timeout hoặc khi giỏ/giá đã đổi                                                                            | Cùng key/payload trả cùng đơn; thay payload bị từ chối                                                                             | TC-17               |
| DB-05 | Idempotency key cũ với payload khác                                                                                       | Xung đột, không thay đổi dữ liệu                                                                                                 | TC-17               |
| DB-06 | Lỗi ghi history/event giữa checkout                                                                                       | Rollback đơn, giỏ, tồn, địa chỉ và idempotency                                                                                   | TC-15               |
| DB-07 | Đổi tên/giá/ảnh/địa chỉ/nhãn thuộc tính sau đặt                                                                           | Snapshot đơn gồm nhãn/giá trị options và asset reference được giữ; ảnh SKU fallback ảnh chung đúng                               | TC-18, TC-28        |
| DB-08 | Confirm/cancel đồng thời tại hạn 24 giờ                                                                                   | Một chuyển trạng thái hợp lệ; RELEASE tối đa một lần                                                                             | TC-19, TC-20        |
| DB-09 | Restart qua hạn của PENDING                                                                                               | Quét bù, không confirm quá hạn, đối soát reserved đúng                                                                           | TC-20               |
| DB-10 | Giao thất bại → giao lại nhiều lần                                                                                        | Chỉ một SHIP, không tăng phí                                                                                                     | TC-24               |
| DB-11 | Nhận hàng về rồi retry                                                                                                    | Một RETURN, CANCELLED/UNPAID                                                                                                     | TC-25               |
| DB-12 | Admin giao thành công rồi retry                                                                                           | Một transaction mỗi dòng; user là khách, actor history là Admin                                                                  | TC-23, TC-34        |
| DB-13 | Đổi/xóa địa chỉ mặc định đồng thời                                                                                        | Còn địa chỉ thì có đúng một mặc định                                                                                             | TC-07               |
| DB-14 | Logout rồi tài khoản khác dùng trình duyệt                                                                                | Không lộ giỏ hoặc đổi chủ event cũ                                                                                               | TC-13, TC-35        |
| DB-15 | Kiểm kê dưới reserved hoặc tranh checkout                                                                                 | Bị từ chối; on_hand/reserved không âm hoặc không nhất quán                                                                       | TC-29               |
| DB-16 | Client giả event mua, đổi user/session/recommendation item                                                                | Bị từ chối; event ID lặp không tạo thêm dòng                                                                                     | TC-33, TC-34, TC-35 |
| DB-17 | Seed hai lần sau khi Admin đổi tồn/giá                                                                                    | Không nhân SKU/INITIAL hoặc ghi đè thay đổi                                                                                      | TC-37               |
| DB-18 | Chạy đối soát sau mọi nhánh đơn                                                                                           | reserved đúng tổng dòng PENDING/CONFIRMED                                                                                        | TC-16–TC-25         |
| DB-19 | Khóa/mở user và dùng lại access/refresh cũ                                                                                | Phiên cũ không sống lại, đơn đang xử lý giữ nguyên                                                                               | TC-31               |
| DB-20 | Export event và đọc response Customer                                                                                     | Không lộ PII/token/ghi chú nội bộ; ID nguồn nhất quán                                                                            | TC-38, TC-40        |
| DB-21 | Import vào DB đã có Product/Category ID; source ID dạng số thực nguyên                                                    | ID identity không bị ép theo CSV; chuẩn hóa nguồn không mất chính xác; đủ provenance                                             | TC-44               |
| DB-22 | Mapping sai root/dataset/category; Product seed thiếu trường nguồn hoặc category gốc không thuộc root                     | CHECK/FK/importer từ chối; category gốc NULL từ CSV hợp lệ                                                                       | TC-44               |
| DB-23 | Một version khác checksum, source_item_id xung đột, lỗi giữa import                                                       | Từ chối/rollback cả lô; không mất dữ liệu cũ hoặc catalog nhập nửa chừng                                                         | TC-43, TC-44        |
| DB-24 | Seed stock 0/dương rồi seed lại sau khi Admin sửa nhãn SKU/tồn/category                                                   | Một SKU mặc định khi tạo; không thêm lại SKU/INITIAL, không nhân stock hoặc ghi đè sửa đổi                                       | TC-37, TC-45        |
| DB-25 | Đối chiếu CSV và counts sau seed; xem ảnh CDN và dữ liệu LIVE                                                             | 500 Product/23 category/1664 mapping nguồn, đúng quota; ảnh CDN; thống kê nguồn không sinh LIVE/doanh thu                        | TC-43, TC-45        |
| DB-26 | Thanh toán COD/payOS; webhook hợp lệ, giả chữ ký, sai số tiền, gửi lặp và webhook đến đơn hết hạn/hủy                     | Chỉ đúng khoản payOS được xác nhận; payment status, paid_at, reference và transaction không lệch hoặc ghi lặp                    | TC-46–TC-48         |
| DB-27 | Reset token hợp lệ/sai/hết hạn/dùng lại; đổi mật khẩu đồng thời với phiên cũ                                              | Chỉ một lần reset; thu hồi mọi phiên trong cùng transaction; token rõ không được lưu                                             | TC-49               |
| DB-28 | Thêm email_outbox trùng event key; provider lỗi và worker retry                                                           | Một hàng/event; lỗi email không rollback order/payment; retry có giới hạn/backoff và không lộ recipient/secret trong event/audit | TC-50               |
| DB-29 | Storage upload thành công nhưng commit metadata lỗi; gắn/thay/gỡ ảnh | Có thể có object mồ côi; FK metadata trong database chung; snapshot đơn bất biến         | TC-28, TC-53, TC-54 |

<a id="references"></a>

## 13. Nguồn kỹ thuật và lịch sử tài liệu

- [module ảnh Catalog](Folder-ARCHITECTURE.md#image-upload): hợp đồng upload Supabase Storage, ghi metadata khi Storage báo thành công; không có SHA-256, trạng thái READY hoặc idempotency; schema hiện hành tại mục 4.5–4.5.1.
- [Supabase Storage uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads): upload object/path mới; [public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals): quyền đọc/ghi riêng.
- Build Demo Catalog — `Build_Demo_Catalog.docx` (chưa có trong checkout; cần cung cấp để đối chiếu): diễn giải tiền xử lý và hướng AI.
- Notebook Build — `Build_Demo_Catalog.ipynb` (chưa có trong checkout; cần cung cấp để đối chiếu): thuật toán quota và schema ba CSV; chuẩn đối chiếu artifact.
- Notebook EDA — `EDA_Exploratory_Data_Analysis.ipynb` (chưa có trong checkout; cần cung cấp để đối chiếu): số liệu nguồn và giới hạn merge category.
- [PostgreSQL — Identity Columns](https://www.postgresql.org/docs/current/ddl-identity-columns.html): identity sinh ID qua sequence; vẫn khai báo PRIMARY KEY để bảo đảm duy nhất.
- [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html): CHECK, UNIQUE, FK và phạm vi bảo đảm của từng loại.
- [PostgreSQL — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html): khóa dòng trong transaction.
- [PostgreSQL — JSON Types](https://www.postgresql.org/docs/current/datatype-json.html): JSONB cho dữ liệu mở rộng có cấu trúc.
- [payOS — API](https://payos.vn/docs/api/): tạo payment request và nhận dữ liệu webhook.
- [payOS — Kiểm tra dữ liệu với signature](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/): xác minh chữ ký webhook.
- [payOS — Webhook thanh toán](https://payos.vn/docs/du-lieu-tra-ve/webhook/): payload và phản hồi webhook.

| Phiên bản | Ngày       | Thay đổi                                                                                                                    |
| --------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2.3       | 27/10/2026 | Chỉ giữ thiết kế schema Supabase hiện hành, migration có version và cấu hình đang dùng; bỏ phương án chuyển đổi đã lỗi thời |
| 2.4 | 29/10/2026 | Giữ schema Auth qua Prisma baseline và lịch sử cũ; dùng chung Prisma.TransactionClient, mật khẩu tối thiểu 6 ký tự |
| 2.5 | 29/10/2026 | Thêm migration password_reset_tokens; reset gửi Resend trực tiếp, chưa có email_outbox/worker |
| 2.6 | 29/10/2026 | Chuyển gửi email reset sang Gmail SMTP qua Nodemailer |
| 2.7 | 30/10/2026 | Thêm schema/migration Category và ghi rõ cách Prisma duy trì name_key bằng trigger |
| 2.8 | 30/10/2026 | Chuẩn hóa NFC, trim và gộp khoảng trắng Unicode của tên Category trong migration mới |
| 2.9 | 01/11/2026 | Bỏ Attributes riêng của Product; thông tin chung dùng mô tả, Category chỉ phân loại; từng Product tự cấu hình lựa chọn SKU. |
| 3.0 | 01/11/2026 | Product chỉ ACTIVE/INACTIVE, mặc định ACTIVE; tạo đủ nội dung/SKU/ảnh/tồn trong một transaction; không có DRAFT. |
| 3.1 | 01/11/2026 | Ghi nhận schema Product/SKU triển khai: tồn riêng, SKU không có trạng thái bán, tồn điều chỉnh có lý do và xóa SKU mềm. |
| 3.4 | 01/11/2026 | Chuyển cấu hình SKU sang Product; Category chỉ phân loại, backfill cấu hình cũ. |
| 3.5 | 01/11/2026 | Mở rộng metadata Catalog để lưu video MP4/WebM/MOV tối đa 50 MB. |

Auth, password_reset_tokens, categories, Product/SKU, ảnh/video media và tồn kho Catalog đã có migration. Các bảng nghiệp vụ Order/Payment/Tracking/Recommendation và ca kiểm chứng trong tài liệu là thiết kế, chưa phải kết quả đã triển khai. Các ví dụ ID/giá chỉ minh họa.\n
