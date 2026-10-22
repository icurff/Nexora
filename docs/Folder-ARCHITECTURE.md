# Kiến trúc microservices — Nexora

| Thông tin | Giá trị |
|---|---|
| Phiên bản | 2.0 |
| Ngày | 22/10/2026 |
| Trạng thái | Gateway chuyển tiếp HTTP Auth; Auth vẫn chưa có API nghiệp vụ; CI GitHub Actions có job độc lập cho sáu backend và frontend; Docker/Compose và PostgreSQL đã có; Recommendation FastAPI, messaging, cache/search chưa triển khai |
| Stack | Hiện tại ReactJS + Vite, NestJS, PostgreSQL; dự kiến Kafka, Elasticsearch, Redis, Cloudinary và Python/FastAPI cho Recommendation |
| Phát triển | Mỗi ứng dụng Node độc lập trong thư mục riêng; Docker Compose local dùng khi cần |
| Triển khai sau | AWS; giai đoạn đầu có thể dùng EC2 + Compose, sau đó chuyển ứng dụng sang ECS |
| Liên quan | [BRD](BRD.md), [SRS](SRS.md), [Database baseline](DATABASE_DESIGN.md) |

## 1. Các quyết định chính

Hiện tại có **5 service NestJS, 1 API gateway và 1 frontend**. Recommendation dự kiến là dịch vụ Python/FastAPI độc lập ở giai đoạn sau. Mỗi ứng dụng Node có package, lockfile, cấu hình và Dockerfile riêng. Người mới có thể chạy từng ứng dụng từ thư mục tương ứng.

Các quyết định để giữ khối lượng phù hợp với đồ án:

- `catalog-service` giữ sản phẩm, danh mục, SKU, liên kết ảnh Product/SKU, tồn kho và tìm kiếm Elasticsearch.
- `order-service` giữ giỏ hàng, checkout, đơn hàng, dashboard và Saga orchestrator; orchestrator là NestJS provider trong Order, lưu tiến trình bền vững tại order_db.
- Recommendation dự kiến dùng Python/FastAPI, sở hữu tracking, dữ liệu hành vi, gợi ý và adapter AI; chưa triển khai trong đợt Docker/PostgreSQL hiện tại.
- Saga dùng orchestration: Order gửi command, Catalog/Payment thực thi transaction local và trả result qua Kafka; Order quyết định bước tiếp theo hoặc compensation. Domain event vẫn dùng để cập nhật tìm kiếm, email và tracking/gợi ý.
- Catalog sở hữu module ảnh, metadata trong `catalog_db` và Cloudinary credential; frontend đọc ảnh HTTPS từ CDN, không lưu file gốc trong Nexora.
- Admin là nhóm API và màn hình trong từng miền nghiệp vụ.
- Worker outbox, consumer Kafka và worker email chạy cùng ứng dụng sở hữu chúng ở local; có thể tách process/replica khi triển khai sau.

Các yêu cầu đã chốt vẫn được áp dụng: đăng nhập trước khi thêm/xem/sửa giỏ; COD và payOS; email thông báo và khôi phục mật khẩu; danh mục cha–con và catalog đa ngành; thương hiệu chỉ là metadata seed; chưa hỗ trợ hoàn tiền hoặc hủy đơn đã PAID.

## 2. Service và quyền sở hữu dữ liệu

| Thành phần | Trách nhiệm | Dữ liệu sở hữu | Cổng container / local |
|---|---|---|---|
| `frontend` | Web Customer/Admin, gọi API gateway, theo dõi kết quả checkout | Trạng thái giao diện | 5173 |
| `api-gateway` | Route API, CORS, xác thực đầu vào, rate limit, request ID, chuyển webhook payOS | Không có database nghiệp vụ | container 3000 / local 3000 |
| `auth-service` | Đăng ký/đăng nhập, phiên, khóa tài khoản, hồ sơ, địa chỉ, địa giới, token reset mật khẩu | `auth_db` | container 3000 / local 3001 |
| `catalog-service` | Danh mục, Product/SKU, giá, upload/metadata/liên kết ảnh, tồn kho/reservation, import và tìm kiếm | `catalog_db`; Cloudinary adapter và index Elasticsearch dự kiến | container 3000 / local 3002 |
| `order-service` | Giỏ tài khoản, quote, checkout, Saga orchestrator, đơn/snapshot/lịch sử/ghi chú, dashboard | `order_db` | container 3000 / local 3003 |
| `payment-service` | Payment intent COD/payOS, payment link, webhook, đối chiếu provider, ghi nhận thu COD | `payment_db` | container 3000 / local 3004 |
| `notification-service` | Mẫu email, nhận yêu cầu gửi, retry, trạng thái gửi và adapter SMTP/API | `notification_db` | container 3000 / local 3005 |
| Recommendation (dự kiến) | Python/FastAPI: tracking, export, gợi ý, adapter AI | `recommendation_db` sẽ tạo khi triển khai | 8000 nội bộ, chưa có container |

Ở local hiện dùng **một PostgreSQL container với 5 database và 5 tài khoản ứng dụng riêng**: Auth, Catalog, Order, Payment, Notification. Mỗi tài khoản chỉ truy cập database của mình. Database của Recommendation sẽ được tạo cùng dịch vụ FastAPI sau này.

ID của entity bên ngoài được lưu như reference, không có FK hoặc JOIN xuyên database. Ví dụ `order_items.variant_id` là mã SKU thuộc catalog; dòng đơn giữ snapshot tên, options (mã/nhãn/giá trị), ảnh và giá. Mỗi service giữ migration, ORM model và repository của riêng mình. Audit thay đổi được ghi tại service sở hữu thay đổi đó.

### 2.1. Sơ đồ tổng thể

```mermaid
flowchart LR
    UI[Frontend React Vite] --> GW[API gateway]
    GW --> ID[Auth service]
    GW --> CAT[Catalog service]
    GW --> ORD[Order service / Saga orchestrator]
    GW --> PAY[Payment service]
    GW -.-> REC[Recommendation FastAPI - dự kiến]
    ID --> IDDB[(auth_db)]
    CAT --> CATDB[(catalog_db)]
    CAT --> ES[(Elasticsearch)]
    CAT -->|Upload ảnh, stream| CLOUD[Cloudinary]
    UI -->|Đọc ảnh HTTPS| CLOUD
    ORD --> ORDDB[(order_db)]
    PAY --> PAYDB[(payment_db)]
    REC -.-> RECDB[(recommendation_db - dự kiến)]
    CAT <--> K[Kafka]
    ORD <--> K
    PAY <--> K
    REC <-.-> K
    K --> NOT[Notification service]
    NOT --> NOTDB[(notification_db)]
    ID -->|HTTP nội bộ: gửi email reset| NOT
    NOT --> MAIL[SMTP / Email provider]
    PAY <--> PO[payOS]
    PO -->|Webhook HTTPS| GW
    GW --> REDIS[(Redis)]
    CAT --> REDIS
    REC -.-> REDIS
```

Mũi tên HTTP phục vụ request cần kết quả ngay. Kafka truyền Saga command/result và domain event cho các projection bất đồng bộ. Sơ đồ thể hiện quyền sở hữu; các database có thể cùng nằm trong một PostgreSQL container ở local.

## 3. Giao tiếp và API gateway

### 3.1. HTTP nội bộ và Kafka

**HTTP nội bộ** dùng cho đăng nhập, hồ sơ, catalog, upload/quản lý ảnh tại Catalog, quote, đọc giỏ/đơn, search và các truy vấn cần phản hồi trực tiếp. Đọc nhiều SKU dùng API batch. Mọi request nội bộ có timeout và request ID; retry mutation chỉ khi có idempotency key.

**Kafka** dùng cho giữ/giải phóng/xuất/nhận lại hàng trong Saga, tạo payment intent/link, kết quả payment, cập nhật chỉ mục và chuyển event đến notification/recommendation.

NestJS hỗ trợ cả event và request/reply qua Kafka. Thiết kế này dùng `emit()` / `@EventPattern()` với command/result topic cho Saga và domain-event topic cho các subscriber khác; HTTP dùng cho truy vấn đồng bộ. Cách này tránh phụ thuộc vào reply topic của từng request HTTP. [NestJS — Kafka](https://docs.nestjs.com/microservices/kafka).

### 3.2. Route công khai

Prefix API là `/api/v1`; bảng dưới lược bỏ prefix để dễ đọc.

| Route qua gateway | Service nhận |
|---|---|
| `/auth/*`, `/me`, `/me/addresses/*`, `/locations/*`, `/admin/customers/*` | auth |
| `/products/*`, `/catalog/*`, `/admin/products/*`, `/admin/variants/*`, `/admin/categories/*`, `/admin/inventory/*` | catalog |
| `/admin/images`, `/admin/images/*` | catalog; module ảnh nhận upload/tra cứu asset |
| `/cart/*`, `/checkout/*`, `/orders/*`, `/admin/orders/*`, `/admin/dashboard` | order |
| `/payments/payos/webhook` | payment; không yêu cầu đăng nhập, bắt buộc xác minh chữ ký tại payment |
| `/orders/:id/payments/payos` | order kiểm tra chủ đơn; orchestrator gửi EnsurePaymentLink với operationId khi cần tạo/lấy lại link, đọc kết quả từ payment projection |
| `/events`, `/recommendations` | Recommendation FastAPI ở giai đoạn sau; chưa route trong scaffold hiện tại |

Email được kích hoạt bởi service nội bộ/sự kiện, không có API công khai cho phép client tự chọn người nhận/template. Gửi lại payment link trả trạng thái đang xử lý nếu link chưa sẵn sàng; client đọc lại trạng thái của đơn.

### 3.3. Xác thực và phân quyền

- Auth sở hữu session/refresh token và trạng thái ACTIVE/LOCKED. Gateway gọi introspection nội bộ cho request cần đăng nhập để việc logout/khóa/đổi mật khẩu có hiệu lực với token cũ.
- Gateway xóa header danh tính do client tự gửi, rồi chuyển context được ký hoặc service credential được kiểm chứng. Service đích vẫn kiểm tra role và quyền sở hữu tài nguyên.
- Endpoint nghiệp vụ backend không được frontend gọi trực tiếp; browser dùng Gateway. Compose publish các backend trên mọi interface của host để developer test trực tiếp bằng Postman/curl. Không dùng một header `X-User-Id` không xác thực làm bằng chứng danh tính.
- Quyền tạo checkout được kiểm tra lúc tiếp nhận. Khóa tài khoản sau khi checkout đã được tiếp nhận không tự hủy nghiệp vụ đang chạy, tương tự quy tắc không tự hủy đơn cũ.

## 4. Saga orchestration tại Order

Order chứa orchestrator cho các operation checkout, chuẩn bị thanh toán, hủy, giao và nhận lại hàng. Orchestrator lưu trạng thái/step/version/operationId, gửi command qua outbox và xử lý result để tiến tiếp hoặc bù. Catalog và Payment chỉ thực thi phần nghiệp vụ mình sở hữu, trả result và phát domain event sau commit. [Saga orchestration](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html).

Mỗi transaction chỉ ghi database của một service. Tiến trình trong PostgreSQL là nguồn để tiếp tục sau restart; orchestrator không dựa vào biến bộ nhớ hoặc Redis để quyết định đã hoàn tất. Auth, Catalog, Payment, Notification và Recommendation giữ ownership dữ liệu riêng.

### 4.1. Tạo đơn và chuẩn bị thanh toán

`checkout_attempts` lưu tiến trình CreateOrder và kết quả cho UI; `order_operations` lưu tiến trình PreparePayment, CancelOrder, ShipOrder, CompleteDelivery và ReceiveReturn. Hai bảng chứa saga type, current step, status, version, operationId, expected result, số lần thử và mốc retry/deadline theo nhu cầu. Trạng thái kỹ thuật tách khỏi trạng thái nghiệp vụ PENDING/CONFIRMED/SHIPPING/DELIVERED/CANCELLED.

```mermaid
sequenceDiagram
    participant U as Frontend
    participant O as Order / Orchestrator
    participant K as Kafka
    participant C as Catalog / Inventory
    participant P as Payment
    U->>O: POST /orders + Idempotency-Key
    O->>O: Lưu checkout attempt + outbox
    O-->>U: 202 + checkoutId
    O->>K: ReserveInventory
    K->>C: ReserveInventory
    C->>C: Transaction toàn bộ SKU + reservation + outbox
    C->>K: InventoryReserved / InventoryRejected
    K->>O: Kết quả reserve
    alt InventoryReserved
        O->>O: Lưu PENDING + snapshot + giỏ + CreateOrder SUCCEEDED
        O->>K: CreatePaymentIntent + OrderPlaced
        K->>P: CreatePaymentIntent
        P->>P: Tạo intent COD hoặc link payOS
        P->>K: PaymentIntentCreated / PaymentLinkCreated / PaymentLinkFailed
        K->>O: Kết quả PreparePayment
    else InventoryRejected
        O->>O: CreateOrder FAILED, mở khóa dòng giỏ
    end
    U->>O: GET /checkout/attempts/:id
    O-->>U: Saga status + orderId khi có
```

Các bước:

1. Order kiểm tra auth, cart version và địa chỉ qua Auth; chụp dữ liệu cần cho đơn. Trong transaction Order, tạo checkout attempt, khóa sửa các dòng giỏ chọn mua và ghi ReserveInventory vào outbox với checkoutId/operationId cố định.
2. Catalog nhận command, kiểm tra giá/version, trạng thái bán và available. Transaction catalog_db giữ toàn bộ SKU hoặc không dòng nào, ghi reservation/snapshot và outbox result. Snapshot gồm tên/mã SKU, giá, ảnh đã chọn và options theo dạng mã → `{label, value}` từ cấu hình danh mục tại thời điểm reserve; Order lưu nguyên snapshot đã xác nhận. Retry cùng operationId không reserve thêm hoặc dựng lại snapshot từ catalog đã đổi.
3. Orchestrator nhận InventoryReserved, lưu đơn PENDING, snapshot/giá từ Catalog, expiresAt, lịch sử, xóa đúng dòng giỏ đã khóa và hoàn tất CreateOrder trong transaction order_db. Đồng thời lưu operation PreparePayment, command CreatePaymentIntent và domain event OrderPlaced vào outbox.
4. Payment nhận CreatePaymentIntent sau khi order đã tồn tại. COD tạo intent UNPAID; payOS lưu intent/provider order code rồi tạo link ngoài transaction DB. Kết quả được trả qua payment.results, orchestrator cập nhật operation và payment projection/link.
5. Domain event sau commit phục vụ Recommendation; Notification nhận NotificationRequested trên topic email riêng. Email/search/tracking không tham gia quyết định đơn đã được tạo thành công.

CreateOrder SUCCEEDED nghĩa là đơn đã được lưu, không đồng nghĩa payOS đã PAID hoặc link đã sẵn sàng. Lỗi tạo link giữ đơn UNPAID và cho thử lại cùng intent; PreparePayment có trạng thái chờ/retry/thất bại riêng, không tự bù reservation hoặc hủy đơn vì provider tạm lỗi.

### 4.2. Compensation và recovery

- Catalog từ chối trước khi giữ hàng: orchestrator đánh CreateOrder FAILED, mở khóa và giữ giỏ để sửa.
- Catalog đã giữ hàng nhưng Order lỗi database tạm thời: lưu/nhận lại result và tiếp tục commit theo operationId cũ; không tự giải phóng do timeout.
- Nếu có lý do nghiệp vụ chắc chắn để từ chối sau reserve và chưa tạo đơn, Order lưu quyết định COMPENSATING cùng ReleaseInventory trong outbox. Catalog release một lần, trả InventoryReleased; Order nhận result rồi mới kết thúc FAILED. Quyết định bù và tạo OrderPlaced loại trừ nhau bằng khóa/version trong Order.
- Result đến muộn/lặp được đối chiếu sagaId, operationId, step/version và trạng thái terminal. Participant giữ trạng thái đóng để command reserve/create đến muộn không mở lại reservation/intent.
- Worker của Order đọc saga đang chờ, query kết quả participant hoặc gửi lại cùng command/operationId, rồi tiến bước tiếp theo theo state machine. Worker tại participant phục hồi transaction local/outbox của mình.
- Reservation không tự release chỉ vì timeout; timeout là kết quả chưa biết. Reconciler kiểm tra Order/Payment trước khi kết luận được bù, tránh giải phóng hàng của đơn đã trả tiền.

Nếu khách chọn lưu địa chỉ mới, Order gửi API Auth với khóa chống lặp sau khi tạo đơn; lỗi lưu sổ địa chỉ retry độc lập và không đổi snapshot giao hàng. Chỉ các bước ảnh hưởng tính hợp lệ của đơn/tồn/payment nằm trong Saga tương ứng.

### 4.3. Trạng thái checkout và UI

| Trạng thái | Ý nghĩa |
|---|---|
| PROCESSING | Orchestrator đang reserve hoặc hoàn tất lưu đơn |
| COMPENSATING | Đã quyết định thất bại, đang chờ result giải phóng hàng |
| SUCCEEDED | CreateOrder hoàn tất; có orderId |
| FAILED | Bị từ chối hoặc các bước bù đã được xác nhận |
| REVIEW_REQUIRED | Kết quả chưa thể tự kết luận an toàn; cần đối soát |

POST /orders trả 202 + checkoutId. GET /checkout/attempts/:id chỉ cho chủ yêu cầu đọc; UI polling với backoff. Hết thời gian chờ UI vẫn giữ key/checkoutId để đọc tiếp. API đơn trả trạng thái chuẩn bị payment/link riêng; frontend không tự tạo đơn mới vì chờ link lâu.

### 4.4. Orchestration vòng đời đơn

| Nghiệp vụ | Các bước orchestrator và participant |
|---|---|
| Webhook payOS | Payment xác minh/commit payment transaction và PaymentConfirmed outbox → Order cập nhật projection, phát OrderPaymentConfirmed theo dữ liệu đơn; không ghi purchase lần hai |
| Hủy/24 giờ hết hạn | Order khóa operation, gửi CloseUnpaidPaymentIntent → chờ PaymentIntentClosed đúng reason CANCELLATION → gửi ReleaseInventory → chờ InventoryReleased → hoàn tất CANCELLED |
| Chuyển giao | Order kiểm tra CONFIRMED và payment nếu payOS, gửi CommitInventory → Catalog xuất on_hand/reserved một lần → InventoryCommitted → Order hoàn tất SHIPPING |
| Giao và thu COD | Order ghi xác nhận Admin, gửi RecordCodCollected → Payment ghi thu một lần và trả CodCollected → Order hoàn tất DELIVERED/PAID; PaymentConfirmed lặp không ghi giao dịch lại |
| Giao payOS đã PAID | Order chuyển DELIVERED bằng transaction local, giữ payment timestamp/transaction gốc |
| Nhận hàng về sau giao thất bại, chưa trả | Order ghi xác nhận nhận hàng, gửi CloseUnpaidPaymentIntent với reason RETURN → PaymentIntentClosed → gửi ReturnInventory → Catalog nhập lại một lần, trả InventoryReturned → Order hoàn tất CANCELLED |

Catalog xử lý command từ Order và không tự release/return khi nhìn thấy payment event. Orchestrator chỉ gửi bước stock sau result đóng payment hợp lệ. PaymentCancellationRejected làm operation hủy thất bại và giữ trạng thái đơn/tồn trước đó; UNKNOWN/provider lỗi giữ operation chờ đối soát. Order không dùng payment projection trễ để tự quyết định release.

Các operation dùng khóa/version trên Order để không nhận hủy và giao đồng thời. Payment serialize theo intent và chặn tạo/thu lại intent đã đóng. Stock command có orderId/reservationId/operationId và ý nghĩa bất biến; retry không lặp ledger. Khi participant đã commit mà Order chưa phản ánh, orchestrator tiếp tục từ result bền vững.

payOS là hệ thống ngoài, không có transaction chung với PostgreSQL. Tiền đến muộn sau khi đơn kết thúc được Payment lưu bằng chứng và đánh REVIEW_REQUIRED; không tự mở lại đơn hoặc giả refund. Hoàn tiền vẫn ngoài phạm vi. [payOS — API](https://payos.vn/docs/api/).

## 5. Thiết kế dữ liệu sau khi tách service

`DATABASE_DESIGN.md` là baseline của mô hình một database trước quyết định microservices. Các cột nghiệp vụ vẫn hữu ích, nhưng các FK, transaction và tổng số 29 bảng trong baseline không phải schema triển khai phân tán.

| Service | Bảng nghiệp vụ từ baseline | Bổ sung hoặc điều chỉnh |
|---|---|---|
| Auth | users, auth_sessions, password_reset_tokens, location_datasets, provinces, wards, user_addresses | Audit auth; gửi yêu cầu reset-email idempotent qua HTTP, cho khách yêu cầu lại nếu chưa tạo được job |
| Catalog | categories, brands metadata, products, product_variants, product_images, image_assets, catalog_datasets, retailrocket_category_mappings, inventory_movements | Upload/idempotency và worker phục hồi ảnh; inventory_reservations/reservation_items; search version; audit catalog |
| Order | carts, cart_items, orders, order_items, order_status_history, order_notes, idempotency_requests | checkout_attempts và order_operations lưu Saga type/step/status/version, result và retry/deadline; payment projection; audit order |
| Payment | Các trường thanh toán trước đây nằm trên orders | payment_intents, payment_transactions, provider_webhook_receipts; UQ provider order code/transaction reference; operation dedupe |
| Notification | email_outbox | notification_jobs: recipient, template, retry, delivery status; không FK sang user/order database |
| Recommendation | visitors, tracking_sessions, interaction_events, recommendation_requests, recommendation_items | Catalog projection tối thiểu cho gợi ý; không lưu contact/địa chỉ trong event/export |

Mỗi service có phát/nhận message nghiệp vụ bổ sung `outbox_messages` và `inbox_messages` theo nhu cầu. Đây là infrastructure của service, không có một outbox database chung cho toàn hệ thống.

### 5.1. Stock và payment là nguồn sự thật ở đâu?

- Catalog: on_hand/reserved, reservation và inventory ledger là nguồn sự thật tồn kho. Đối soát reserved bằng reservation_items còn HELD trong catalog_db, không JOIN bảng orders.
- Payment: intent/transaction là nguồn sự thật thanh toán. Các trường payment trên Order là projection; thao tác quan trọng hỏi trạng thái authoritative khi cần.
- Order: nguồn sự thật nội dung đơn, snapshot và vòng đời đơn. Cart lưu PostgreSQL để tồn tại qua logout/restart; Redis có thể cache.
- Recommendation: event hành vi phục vụ nghiên cứu là bản ghi tiêu thụ từ sự kiện đã commit. Event `transaction` được tạo một lần theo dòng đơn từ kết quả thanh toán, dùng ID ổn định để chống lặp.

Recommendation cập nhật catalog projection từ payload công khai có version hoặc gọi API batch nội bộ của Catalog khi nhận event; không đọc catalog_db trực tiếp. Order phát event giao dịch theo dòng sau khi áp dụng kết quả Payment, giữ paidAt gốc thay vì thời gian consumer nhận message.

Catalog đánh dấu SKU đã được dùng trong reservation/đơn được chấp nhận để không đổi product_id/options; không xóa dấu khi release và không cần đọc trực tiếp order_items ở database khác.

Catalog sở hữu `categories.parent_id/attribute_config`, `products.attributes/variant_option_keys`, `product_variants.options/options_key` và ảnh chung/ảnh SKU. Cấu hình thuộc tính nằm trong form Category, không có service/module thuộc tính riêng; không kế thừa cấu hình cha trong bản đầu. Sửa cây có khóa cấp cây để chặn chu trình đồng thời; sửa cấu hình/đổi danh mục Product phải giữ Product/SKU đang bán hợp lệ. SKU có giá/tồn riêng; sản phẩm không biến thể có một SKU options `{}`. Các cột/ràng buộc chi tiết tại [Database mục 4](DATABASE_DESIGN.md#catalog); quy tắc này áp dụng cho catalog_db hiện tại, độc lập các FK/transaction xuyên miền của baseline.

Các khóa chống lặp bắt buộc ở miền nghiệp vụ: checkout attempt có UQ `(user_id, idempotency_key)` kèm request hash; orders có checkoutId duy nhất; reservation có checkoutId duy nhất và các dòng SKU duy nhất; stock operation có operationId duy nhất theo loại/dòng; payment intent có orderId duy nhất, provider order code và transaction reference có UQ phù hợp. Inbox chống message lặp, còn các khóa này chống cùng thao tác nghiệp vụ được gửi bằng messageId khác. Command/result đến muộn không được mở lại reservation/intent đã đóng; handler kiểm tra trạng thái/version hoặc ghi trạng thái đóng để chặn thao tác cũ.

Provider call nằm ngoài transaction database: Payment lưu intent/provider order code ổn định trước khi gọi payOS. Nếu timeout hoặc dừng sau khi provider tạo link, retry tra kết quả bằng cùng provider order code rồi phục hồi dữ liệu local; không cấp code mới và tạo thêm link như một thanh toán mới khi kết quả cũ chưa rõ.

## 6. Kafka và độ tin cậy message

### 6.1. Topic Saga và domain event

| Topic | Message chính | Producer → Consumer |
|---|---|---|
| `nexora.catalog.commands.v1` | ReserveInventory, ReleaseInventory, CommitInventory, ReturnInventory | Order orchestrator → Catalog |
| `nexora.catalog.results.v1` | InventoryReserved/Rejected/Released/Committed/Returned | Catalog → Order orchestrator |
| `nexora.payment.commands.v1` | CreatePaymentIntent, EnsurePaymentLink, CloseUnpaidPaymentIntent, RecordCodCollected | Order orchestrator → Payment |
| `nexora.payment.results.v1` | PaymentIntentCreated, PaymentLinkCreated/Failed, PaymentIntentClosed, PaymentCancellationRejected, CodCollected | Payment → Order orchestrator |
| `nexora.payment.events.v1` | PaymentConfirmed từ webhook hoặc thu COD đã commit | Payment → Order |
| `nexora.order.events.v1` | OrderPlaced, OrderCancelled, OrderShipped, OrderDelivered, OrderPaymentConfirmed | Order → Recommendation và các projection nghiệp vụ |
| `nexora.catalog.events.v1` | ProductSearchChanged, metadata công khai có version | Catalog → Catalog indexer, Recommendation |
| `nexora.notification.events.v1` | NotificationRequested với dữ liệu email tối thiểu | Service nguồn → Notification; topic riêng hạn quyền/retention |

Key của checkout trước khi có đơn là checkoutId; sau khi có đơn là orderId. correlationId/sagaId nối command/result về tiến trình. Event catalog dùng productId. Không có thứ tự toàn cục giữa các topic; orchestrator và participant kiểm tra operationId/step/version.

Command/result điều khiển các bước Saga; domain event phục vụ subscriber sau commit. Payment tạo intent theo CreatePaymentIntent, không tự tạo từ OrderPlaced. Catalog thay đổi reservation theo command tương ứng, không tự thay tồn theo payment event. Mỗi request tạo/lấy lại link đi qua kiểm tra quyền Order rồi EnsurePaymentLink với operationId bền vững.

Ví dụ envelope dùng chung:

```json
{
  "messageId": "uuid",
  "type": "inventory.reserved.v1",
  "schemaVersion": 1,
  "producer": "catalog-service",
  "occurredAt": "2026-10-16T10:00:00Z",
  "correlationId": "checkout-id",
  "sagaId": "checkout-id",
  "operationId": "reserve-operation-id",
  "causationId": "reserve-command-message-id",
  "aggregateId": "checkout-id",
  "aggregateVersion": 1,
  "payload": { "reservationId": "101", "checkoutId": "checkout-id" }
}
```

Message/correlation/saga/operation ID có thể UUID; entity PK PostgreSQL vẫn có thể bigint identity, serialize thành chuỗi. Contract mới bổ sung field tương thích hoặc tăng version; không dùng shared ORM entity làm payload.

### 6.2. Outbox, inbox, ordering và retry

1. Service ghi dữ liệu nghiệp vụ và outbox trong **cùng transaction local**. Relay trong service phát message sau commit và đánh dấu đã publish. Relay có thể publish lặp khi dừng giữa chừng. [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html).
2. Consumer dùng UQ `(consumer_name, message_id)` trong inbox. Cập nhật nghiệp vụ, inbox và outbox kết quả cùng transaction. Chỉ commit offset Kafka khi xử lý đã bền vững; khi publish DLQ phải chờ broker ack hoặc lưu ý định DLQ bền vững trước khi ack message gốc.
3. Kafka giữ thứ tự trong từng partition, không giữ thứ tự toàn bộ topic hay giữa các topic. Saga vẫn kiểm tra operation/version; key giống nhau ở hai topic không tạo thứ tự xuyên topic. [Apache Kafka — design](https://kafka.apache.org/41/design/design/).
4. Mỗi logical subscriber có consumer group riêng, ví dụ `order-saga`, `catalog-command-handlers`, `payment-command-handlers`, `catalog-search-indexer`, `notification-email`, `recommendation-projection`. Replica cùng subscriber chia sẻ group. Nếu notification và recommendation dùng chung group, mỗi bên chỉ nhận một phần message.
5. Retry lỗi tạm thời với backoff và giới hạn, DLQ chứa metadata tra cứu. Order recovery worker kiểm tra Saga treo/thiếu result; participant recovery worker xử lý outbox/local operation chưa hoàn tất. Re-drive dùng lại message/operation ID để không áp dụng nghiệp vụ hai lần.

Mục tiêu là giao message ít nhất một lần, kèm idempotency ở nghiệp vụ. Không tuyên bố Kafka bảo đảm đúng một lần cho cả PostgreSQL, email và payOS.

Domain/tracking topic không chứa email, địa chỉ, token hoặc provider credential. Notification nhận request gửi thư qua topic riêng được giới hạn quyền/retention; Order tạo request này từ snapshot riêng, dùng cùng business event ID để dedupe. Không đưa payload email vào event export cho AI.

## 7. Elasticsearch, Redis và email

### 7.1. Elasticsearch trong Catalog

Catalog ghi PostgreSQL và outbox `ProductSearchChanged` trong transaction; indexer tiêu thụ rồi đọc trạng thái hiện tại từ catalog_db và upsert/delete index. Elasticsearch là projection tìm kiếm có độ trễ, có thể rebuild từ PostgreSQL. [Elastic — near real-time search](https://www.elastic.co/docs/manage-data/data-store/near-real-time-search).

- Một document/Product; lưu category_id và category_ancestor_ids để lọc cả danh mục con. SKU là trường `nested`, chứa options dạng `flattened` với mã ổn định và giá trị đã normalize_label; giá/tồn là trường số riêng. Tất cả điều kiện options + giá + còn hàng nằm trong cùng nested query. OR giữa giá trị cùng mã, AND giữa các mã. Không tạo dynamic field mapping riêng cho từng thuộc tính. [Elastic — nested](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/nested), [Elastic — flattened](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/flattened).
- Bản đầu chỉ lọc exact value trên options; không dùng flattened để so khoảng số theo dung lượng/kích cỡ, chưa lọc products.attributes. Facet lấy từ dữ liệu Catalog trong phạm vi danh mục; nhãn/ý nghĩa mã phải nhất quán trong phạm vi gộp. Mã mơ hồ bị ẩn và API từ chối lọc mã đó, yêu cầu chọn danh mục cụ thể hơn. PostgreSQL fallback dùng cùng chuẩn hóa và một EXISTS cho toàn bộ điều kiện SKU.
- Dùng analyzer chuẩn hóa lowercase/bỏ dấu theo yêu cầu tìm tên; tên synthetic tiếng Anh vẫn tìm được. Không thêm plugin ngôn ngữ ngoài khi chưa cần.
- Thay đổi nội dung/SKU/stock làm tăng product search version trong Catalog. Indexer không để event/version cũ ghi đè document mới; reindex dùng index mới và đổi alias.
- Đổi cây danh mục làm cập nhật ancestor projection cho Product thuộc nhánh ảnh hưởng; đổi cấu hình nhãn làm cập nhật payload hiển thị/facet. Catalog ghi outbox yêu cầu rebuild nhánh theo batch, tăng version từng Product bị ảnh hưởng; không chỉ cập nhật document của danh mục cha. Khi index đang trễ, Catalog đối chiếu phạm vi danh mục hiện hành trước trả kết quả; kết quả có thể thiếu tạm thời, không trộn phạm vi cũ. Bộ lọc/checkout không đọc cấu hình cũ từ cache làm nguồn quyết định.
- Giá và tồn trên kết quả tìm kiếm chỉ phục vụ hiển thị. Catalog kiểm tra lại PostgreSQL ở thêm giỏ/quote/reserve. Kết quả ES cần hydrate/kiểm tra Product đang công khai trước trả để sản phẩm vừa ngừng bán không lộ do index trễ.
- ES lỗi: Catalog fallback tìm/lọc PostgreSQL cho catalog 500 sản phẩm, giữ checkout hoạt động. Có lệnh rebuild index, không reset database để sửa chỉ mục.

### 7.2. Redis

| Nơi dùng | Công dụng |
|---|---|
| Gateway/Auth | Counter rate limit đăng nhập, yêu cầu reset và API |
| Catalog | Cache category, product public và query phổ biến với TTL ngắn |
| Recommendation | Cache kết quả gợi ý theo user/session và thống kê phổ biến có thể tái tạo |

Một Redis container local, key có prefix môi trường/service, ví dụ `local:catalog:product:101`. Cache có TTL và invalidation sau commit. Giỏ, reset token, stock, Saga và payment vẫn lưu PostgreSQL. Consumer dedupe và idempotency nghiệp vụ cũng nằm PostgreSQL.

Redis lỗi thì các cache có thể bỏ qua; với rate limit luồng nhạy cảm, dùng chính sách fallback có giới hạn hoặc trả lỗi tạm thời được cấu hình rõ. Không dùng Redis lock làm cơ chế duy nhất chống bán vượt tồn. Catalog khóa/cập nhật stock trong PostgreSQL.

### 7.3. Email và khôi phục mật khẩu

Auth sinh token reset, lưu hash và hạn dùng; Notification chịu trách nhiệm gửi. Với token rõ, dùng HTTP nội bộ tới Notification để gửi/lưu job, payload nhạy cảm được mã hóa khi lưu và xóa khi gửi xong/hết hạn. Token không đi trong domain/tracking topic hoặc log. Auth chỉ trả phản hồi chung cho email có/không có tài khoản; lỗi gửi cho phép yêu cầu lại.

Email đơn dùng NotificationRequested trên topic email riêng có recipient và template data tối thiểu; Notification tạo job có UQ `(source_event_id, template_key, recipient)` rồi worker gửi với retry. Nếu provider hỗ trợ idempotency key thì dùng job ID. Nếu provider không hỗ trợ, dừng sau gửi nhưng trước lưu SENT có thể gây gửi lại; dedupe local không chứng minh email được phát đúng một lần tuyệt đối.

Local có thể dùng Mailpit để xem thư; kiểm tra gửi email thật cần cấu hình SMTP/API thực. AWS có thể dùng SES qua cùng adapter.

Yêu cầu reset có requestId để Notification dedupe HTTP retry; khi kết quả gửi chưa rõ, Auth tra/retry cùng requestId. Job reset quá hạn không gửi tiếp. Phát hành token mới vô hiệu hóa token cũ; token rõ chỉ được giữ trong job đã mã hóa cho tới khi gửi hoặc hết hạn, còn Auth chỉ lưu hash.

<a id="image-upload"></a>
### 7.4. Upload ảnh trong Catalog

`catalog-service` sở hữu toàn bộ chức năng ảnh: validation, Cloudinary adapter, metadata asset, liên kết Product/SKU và worker phục hồi upload. Metadata nằm trong `catalog_db`; credential Cloudinary chỉ được cấp cho Catalog. Frontend đọc URL HTTPS của CDN; Nexora không lưu file gốc trong filesystem, volume hoặc database.

```mermaid
flowchart LR
    A[Admin frontend] -->|POST /admin/images| G[API gateway]
    G --> CAT[Catalog: module ảnh]
    CAT -->|Upload stream| CDN[Cloudinary]
    CAT --> DB[(catalog_db: image_assets, product_images)]
    A -->|Đọc ảnh HTTPS| CDN
```

1. Admin gửi multipart `file` và `Idempotency-Key` qua Gateway. Catalog kiểm tra quyền, nội dung JPEG/PNG/WebP và giới hạn 5 MiB; không tin extension/MIME hoặc URL/trạng thái do client khai.
2. Catalog ghi `image_assets` PENDING với fingerprint, requester scope, key và `public_id` do server sinh rồi kết thúc transaction.
3. Adapter upload stream/buffer giới hạn tới Cloudinary ngoài transaction DB, dùng `resource_type=image`, `type=upload`, `overwrite=false`.
4. Chỉ chuyển READY khi provider xác nhận và metadata `asset_id`, `public_id`, version, `secure_url`, format, bytes, width/height được commit hợp lệ. API trả `imageAssetId` dạng chuỗi cùng trạng thái và metadata.
5. Khi gắn ảnh Product/SKU, Catalog kiểm tra asset READY trực tiếp trong `catalog_db` và ghi liên kết trong transaction local. Client không được tự khai provider, URL hoặc READY. Bảng `product_images.image_asset_id` có FK nội bộ tới `image_assets`.

Cùng requester/key và fingerprint trả kết quả đã lưu hoặc PENDING; khác fingerprint trả `409`. Timeout chưa rõ kết quả giữ PENDING; worker có lease đối soát `public_id` trước khi upload lại. Nếu không còn bytes sau restart thì client gửi lại cùng key sau đối soát. Không giữ khóa DB khi gọi provider. Chi tiết API tại [SRS](SRS.md#image-api), metadata tại [Database](DATABASE_DESIGN.md).

Một asset có thể được dùng bởi nhiều Product/SKU. Product ACTIVE cần ảnh chung READY làm đại diện; ảnh SKU tùy chọn và fallback ảnh chung. Thay ảnh tạo asset mới; gỡ liên kết không xóa hoặc ghi đè asset lịch sử. Order/reservation giữ snapshot ID, provider, key, version và URL; không có FK xuyên database.

Job seed gọi module ảnh trong Catalog hoặc API nội bộ Catalog đã xác thực, dùng cùng validation/idempotency. Upload và kiểm tra CDN hoàn tất trước transaction import catalog. Ảnh source trong CSV chỉ là provenance, không hotlink làm URL hiển thị chính. CDN lỗi có fallback UI. Không chuyển byte ảnh qua Kafka và không đưa upload vào Saga checkout.

Cloudinary là provider bên ngoài. CI dùng test double cho adapter; nghiệm thu upload thật cần credential và kết nối mạng. Backup Nexora giữ metadata/URL; phục hồi bytes ảnh phụ thuộc chính sách lưu trữ của provider. Tham khảo [Cloudinary Node upload](https://cloudinary.com/documentation/node_image_and_video_upload).

## 8. Cấu trúc repository

Repository hiện gồm frontend, Gateway và năm dịch vụ NestJS. Mỗi ứng dụng có `package.json`, `package-lock.json` và Dockerfile riêng; Compose nằm ở root để chạy PostgreSQL và kết hợp các ứng dụng khi cần. Nghiệp vụ, migration và CI là các bước tiếp theo.

```text
nexora/
├── frontend/                 # React + Vite
├── api-gateway/              # NestJS: public API và health
├── auth-service/             # NestJS: tài khoản, hồ sơ, địa chỉ
├── catalog-service/          # NestJS: catalog, ảnh, tồn kho, search
├── order-service/            # NestJS: giỏ, đơn, Saga
├── payment-service/          # NestJS: COD/payOS
├── notification-service/     # NestJS: email
├── docker/postgres/          # init năm DB/user; migration miền làm sau
├── docs/
├── docker-compose.yml        # PostgreSQL và các ứng dụng
├── .env.example
├── .nvmrc
└── .prettierrc               # cấu hình format chung
```

Mỗi thư mục frontend/backend còn có `package.json`, `package-lock.json`,
`.dockerignore` và `Dockerfile` riêng. Cấu hình TypeScript/lint cũng nằm cạnh
source code của ứng dụng đó.

Recommendation sẽ được phát triển sau bằng Python/FastAPI, cổng nội bộ dự kiến 8000. Hiện chưa có thư mục mã nguồn, package npm, Docker image/container hoặc database cho dịch vụ này. Khi triển khai sẽ dùng cấu hình dependency, migration và Dockerfile Python riêng; giao tiếp qua HTTP/event schema, không import package NestJS. Các phần tracking/gợi ý bên dưới là hợp đồng thiết kế tương lai.

`packages/contracts` và `packages/platform` là hướng mở rộng khi cần hợp đồng/tiện ích dùng chung cho Node. Hợp đồng với FastAPI phải ở dạng độc lập ngôn ngữ như OpenAPI/JSON Schema; không chia sẻ ORM entity, repository hoặc nghiệp vụ giữa service. Frontend không kéo thư viện NestJS backend vào browser bundle.

### 8.1. Ví dụ bên trong một Nest service

```text
order-service/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   ├── modules/
│   │   ├── cart/
│   │   │   ├── cart.module.ts
│   │   │   ├── cart.controller.ts
│   │   │   ├── cart.service.ts
│   │   │   ├── cart.repository.ts
│   │   │   └── dto/
│   │   ├── checkout/
│   │   ├── orders/
│   │   └── dashboard/
│   ├── sagas/
│   │   ├── create-order.saga.ts
│   │   ├── prepare-payment.saga.ts
│   │   ├── cancel-order.saga.ts
│   │   ├── ship-order.saga.ts
│   │   └── complete-delivery.saga.ts
│   ├── workers/
│   │   ├── outbox-relay.worker.ts
│   │   └── saga-recovery.worker.ts
│   ├── messaging/                    # consumer handlers, outbox relay
│   ├── clients/                      # Auth HTTP client, Catalog quote client
│   └── health/
├── database/
│   ├── migrations/
│   └── seed.ts
├── test/
├── package.json
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
└── Dockerfile
```

Tổ chức theo module nghiệp vụ, controller mỏng, service xử lý nghiệp vụ, repository làm việc với database. Saga provider trong Order lưu tiến trình, xử lý result và gửi command qua outbox. Catalog/Payment có command handler thực thi transaction local; các subscriber khác xử lý domain event. Có thể thêm lớp domain/application khi độ phức tạp thực tế cần, chưa cần tạo nhiều lớp rỗng cho mỗi module CRUD.

### 8.2. Chạy và build từng ứng dụng

Không cần npm workspaces. Mỗi thư mục ứng dụng Node có `package.json` và
`package-lock.json` riêng, nên cài dependency hoặc chạy script ngay trong thư mục
đó. Ví dụ, vào `auth-service`, chạy `npm install` lần đầu rồi
`npm run start:dev`. Với frontend, vào `frontend` rồi chạy `npm install` và
`npm run dev`. Node.js 24 và npm 11 được ghi trong `.nvmrc` và trường `engines`
của từng ứng dụng.

TypeScript, ESLint và Vitest (backend) hoặc Vite (frontend) được cấu hình trong
từng ứng dụng. Prettier có cấu hình chung ở root nhưng package Prettier được cài
riêng trong từng ứng dụng. Không chia sẻ source code giữa các service; tích hợp qua HTTP
hoặc message contract. Recommendation sau này là ứng dụng Python/FastAPI riêng
với công cụ và môi trường Python.

Mỗi ứng dụng cũng có Dockerfile riêng. Compose tại root build từng image với
context là thư mục ứng dụng đó, vì vậy dependency của ứng dụng này không được cài
vào image của ứng dụng khác.

## 9. Docker Compose local

Tất cả container kết nối qua bridge network `nexora`; các service có thể tìm nhau bằng tên service trong Compose.


Compose hiện tại định nghĩa frontend, Gateway, năm service NestJS và PostgreSQL; lệnh `docker compose up` khởi động tất cả. Để chỉ chạy PostgreSQL khi phát triển ứng dụng trên host, dùng `docker compose up -d --wait postgres`. Mỗi image build từ Dockerfile và lockfile trong thư mục ứng dụng tương ứng. PostgreSQL có năm database/user riêng và named volume bền vững. Compose truyền `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` và `DB_PASSWORD` riêng cho mỗi backend; ứng dụng chưa đọc các biến này do chưa có adapter database. Kafka, Redis, Elasticsearch, công cụ quan sát, migration/seed và Recommendation FastAPI sẽ bổ sung sau; các phần thiết kế tương ứng không đồng nghĩa đã có container hoặc adapter.

```powershell
docker compose up -d --build --wait --wait-timeout 240
# Chỉ chạy database khi phát triển ứng dụng trên host:
docker compose up -d --wait postgres
```

Frontend, Gateway, từng backend và PostgreSQL đều có cổng host riêng, publish trên mọi interface; cổng được cố định trong Compose. Trong Docker, Nest apps đều nghe cổng container 3000 và Gateway tiếp cận backend qua DNS Compose; mỗi backend cũng được publish ra cổng local riêng để test trực tiếp. Healthcheck PostgreSQL chờ TCP sẵn sàng sau init; service phụ thuộc chờ `service_healthy`. `/health` của ứng dụng hiện kiểm tra tiến trình HTTP; readiness database sẽ đi cùng adapter. [Docker startup order](https://docs.docker.com/compose/how-tos/startup-order/).

Compose target runtime cho Gateway và năm backend NestJS: các container chạy JavaScript đã build, không dùng Nest watch và không mount source. Sau khi sửa backend, build lại service bằng `docker compose up -d --build <service>`. Frontend vẫn chạy Vite watch với source mount. `docker compose down` giữ volume; `down -v` xóa dữ liệu. Init chỉ chạy khi volume trống, không tự migrate hay đổi mật khẩu role cũ. Cấu hình tại [docker-compose.yml](../docker-compose.yml).

Khi triển khai provider, chỉ Payment nhận payOS keys, Notification nhận email credential và Catalog nhận Cloudinary credential. Frontend chỉ nhận public URL. Cấu hình ảnh dự kiến tại Catalog gồm `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `IMAGE_PUBLIC_ID_PREFIX`, `IMAGE_MAX_FILE_BYTES=5242880`, `IMAGE_UPLOAD_TIMEOUT_MS=30000`, `IMAGE_MAX_CONCURRENT_UPLOADS=4`. Các biến này chưa cần cho scaffold hiện tại; không giả lập READY khi thiếu cấu hình upload.

Khi bổ sung Kafka, dùng listener nội bộ `kafka:9092` và listener host riêng khi cần. Kafka/Elasticsearch/Redis có healthcheck và volume theo nhu cầu; topic init là job một lần. Adapter cần reconnect/backoff khi dependency restart. Heap/resource limits sẽ được cấu hình cùng bước triển khai hạ tầng đó.

### 9.1. Quan sát và phục hồi

Mỗi service có liveness/readiness và log JSON chứa requestId, correlationId, messageId, orderId khi có. Theo dõi outbox chưa phát, consumer lag, Saga PROCESSING/COMPENSATING quá lâu, DLQ và email FAILED. Secret/contact/token không xuất hiện trong log. Redis/ES lỗi được ghi là degraded khi đã có fallback, không làm mất khả năng phục vụ nghiệp vụ PostgreSQL còn hoạt động.

Worker phục hồi chạy định kỳ và khi khởi động, lấy lease/khóa tiến trình tại database của service để nhiều replica không chạy cùng bước đồng thời. Order orchestrator phục hồi từ Saga row, gửi lại command cùng operationId hoặc tiến bước sau khi xác minh result; participant worker phục hồi transaction/outbox local. Không lưu trạng thái Saga chỉ trong bộ nhớ.

## 10. CI/CD

Workflow `.github/workflows/ci.yml` dùng matrix cố định cho sáu backend NestJS
và frontend. Khi push vào `main` hoặc tạo pull request hướng tới `main`, CI chạy
đủ bảy ứng dụng. Mỗi job chạy trong thư mục ứng dụng và dùng Node theo `.nvmrc`.

Các bước gồm `npm ci`, lint, typecheck, `npm test --if-present`, build và build
Docker image. Backend dùng target `runtime`; frontend dùng target `development`
và bỏ qua test vì chưa có script test. Workflow chưa chạy integration giữa các
service, migration/seed, provider thật hoặc deploy.

Gateway dùng `http-proxy-middleware`, cấu hình trong `api-gateway/src/auth-proxy.ts`
và đăng ký tại `main.ts`, để chuyển tiếp `/api/v1/auth` cùng route con đến `AUTH_SERVICE_URL`. Proxy
giữ method, path/query, body, header xác thực/cookie, status, content type và
cookie response; bỏ header identity client có thể giả mạo và hop-by-hop headers.
Không retry hoặc follow redirect. Lỗi upstream trả 502, timeout cấu hình qua
`AUTH_SERVICE_TIMEOUT_MS` trả 504. Auth chỉ có `/health`; API đăng nhập/nghiệp vụ
chưa được triển khai.

### 10.1. CI thực hiện trước, CD thêm khi lên AWS

| Workflow | Kích hoạt | Nội dung |
|---|---|---|
| `.github/workflows/ci.yml` | Push vào `main` hoặc PR hướng tới `main` | Matrix cố định chạy đủ bảy ứng dụng: npm ci, lint, typecheck, test nếu có script, build và build Docker image |
| Integration job | Thay đổi checkout/payment/catalog/messaging hoặc contracts | Compose môi trường CI riêng, migrate/seed, kiểm tra Saga, duplicate message, recovery, webhook và upload/gắn ảnh qua Catalog; dùng provider test double ở CI |
| `publish-images.yml` | Merge nhánh chính/tag khi cần có registry | Build runtime image từng ứng dụng, tag bằng Git SHA, push registry/ECR |
| `deploy-aws.yml` | Khi chuẩn bị AWS; manual/environment gate hoặc release | Lấy đúng image SHA đã qua CI, migrate tương thích, deploy, smoke/health check, rollback image nếu lỗi |

Workflow chưa chạy kiểm tra integration giữa các service; unit test riêng từng service không thay thế integration.

Pipeline không gọi payment thật để tạo giao dịch tiền. Nghiệm thu payOS thật có cấu hình và ca riêng. Email test dùng Mailpit/provider test adapter.

### 10.2. Lộ trình AWS

**Giai đoạn đầu để demo:** EC2 chạy Docker Compose bằng runtime image từ ECR, có HTTPS endpoint cho gateway/webhook, persistent storage và backup. CI/CD cập nhật image SHA qua deploy job; không dùng dev hot reload/bind mount source trên EC2. Cách này gần môi trường local nhưng có giới hạn một host, chưa có HA.

**Giai đoạn tiếp theo nếu cần vận hành độc lập từng service:**

| Thành phần | Đích đề xuất |
|---|---|
| Container ứng dụng | ECS, lựa chọn Fargate/EC2 theo nhu cầu và ngân sách |
| Container registry | ECR |
| PostgreSQL | RDS PostgreSQL; ban đầu có thể một instance, tách DB/user theo service |
| Kafka | [Amazon MSK](https://docs.aws.amazon.com/msk/latest/developerguide/what-is-msk.html) khi cần managed Kafka |
| Redis | [ElastiCache cho Redis OSS/Valkey](https://aws.amazon.com/elasticache/faqs/) sau khi chọn engine/version tương thích |
| Elasticsearch | [Elastic Cloud trên AWS](https://www.elastic.co/docs/reference/cloud/cloud-hosted/regions) nếu giữ Elasticsearch; hoặc tự vận hành Elasticsearch |
| Frontend và ảnh | Frontend có thể S3 + CloudFront; ảnh tiếp tục dùng Cloudinary qua module Catalog |
| Email | SES hoặc nhà cung cấp SMTP/API đã chọn |
| Secrets/logs | Secrets Manager hoặc Parameter Store, CloudWatch |

Amazon OpenSearch là lựa chọn thay thế cần đánh giá client/API, mapping và tính năng tương thích; không đổi tên Elasticsearch thành OpenSearch rồi coi là cùng cấu hình. Managed Kafka/search/database là lựa chọn giai đoạn sau, cần dự toán chi phí trước khi bật cho đồ án.

GitHub Actions có thể build/push ECR và cập nhật ECS task definition. Khi làm CD dùng AWS OIDC để cấp credential ngắn hạn. [GitHub — deploy ECS](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/amazon-elastic-container-service), [GitHub — OIDC với AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [AWS — build/push ECR](https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/build-and-push-docker-images-to-amazon-ecr-using-github-actions-and-terraform.html).

Migration chạy job một lần và tương thích với cả image cũ/mới trong thời gian rollout. Rollback image không tự rollback dữ liệu/migration.

## 11. Thứ tự triển khai

Repository đã có Git, các ứng dụng Node độc lập, Docker/Compose và PostgreSQL. Frontend, Gateway và năm service NestJS là scaffold; nghiệp vụ và pipeline còn triển khai sau. Recommendation FastAPI chưa khởi tạo.

1. Duy trì Docker/Compose và PostgreSQL hiện tại; bổ sung migrations theo service. Kafka, Redis, Elasticsearch triển khai ở bước riêng khi cần.
2. Hoàn thành Auth + Gateway: auth, ownership, địa chỉ, đổi/reset mật khẩu qua Notification.
3. Catalog: triển khai module ảnh/Cloudinary trong catalog_db, upload idempotent, Product/SKU, import, inventory/reservation và projection Elasticsearch.
4. Order: giỏ yêu cầu đăng nhập, quote, Saga orchestrator cho checkout COD, retry/recovery và các operation hủy/giao/nhận lại.
5. Payment: COD intent/collection, payOS link/webhook, đối soát và xử lý cạnh tranh hủy/thanh toán.
6. Notification triển khai email; Recommendation sẽ được phát triển bằng Python/FastAPI sau, với tracking/event consumer, gợi ý và export không PII.
7. CI: build và integration của các luồng trên. Sau khi demo local ổn định mới triển khai CD AWS.

Các ca kiến trúc cần kiểm chứng khi triển khai: hai checkout tranh SKU cuối; duplicate command/result/event/webhook; consumer dừng trước/sau commit; Order dừng sau reserve; Kafka gián đoạn; hủy cạnh tranh với payment; ES/Redis/email lỗi; Cloudinary timeout, upload lặp/restart và giữ asset lịch sử; restart Compose vẫn giữ đơn/tồn/tiến trình. Tài liệu này mới đặc tả các ca, chưa xác nhận đã có code hoặc đã chạy kiểm thử.

## 12. Lịch sử thiết kế

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.1 | 16/10/2026 | Phương án choreography trước đây; auth-service/auth_db; provider ảnh/CDN |
| 1.2 | 16/10/2026 | Chốt orchestration tại Order, command/result qua Kafka và tiến trình bền vững; giữ Auth và ?nh CDN |
| 1.3 | 16/10/2026 | Làm rõ ảnh/CDN là dịch vụ ngoài; Nexora chuyển tiếp upload qua stream/buffer và chỉ lưu metadata/URL, không giữ file gốc riêng |
| 1.4 | 16/10/2026 | Catalog đa ngành: cây danh mục/cấu hình thuộc tính, JSONB Product/SKU, snapshot options qua Saga, ảnh chung/ảnh SKU; Elasticsearch nested SKU + flattened options và projection danh mục con |
| 1.5 | 17/10/2026 | Bổ sung đặc tả upload Cloudinary, retry và bảo toàn ảnh lịch sử |
| 1.6 | 17/10/2026 | Hợp nhất Git và npm workspaces/lockfile tại root; gom cấu hình chung, bỏ README mẫu; phân biệt scaffold hiện có với hạ tầng/service còn phải triển khai |
| 1.8 | 20/10/2026 | Bỏ npm workspaces; mỗi ứng dụng Node có package, lockfile và Dockerfile riêng; cập nhật hướng dẫn chạy cho người mới |
| 1.9 | 20/10/2026 | Gán cổng local riêng cho từng ứng dụng để truy cập/test trực tiếp; giữ cổng container 3000 dùng chung cho NestJS |
