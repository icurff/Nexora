# Task triển khai Nexora

| Thông tin     | Giá trị                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Phiên bản     | 3.7 |
| Cập nhật      | 01/11/2026 |
| Kiến trúc     | Một frontend React/Vite, một backend NestJS modular monolith, PostgreSQL local trong Docker; Supabase Storage |
| Nguồn yêu cầu | [BRD](BRD.md), [SRS](SRS.md), [Database design](DATABASE_DESIGN.md), [Architecture](Folder-ARCHITECTURE.md) |

Danh sách là kế hoạch tham khảo, không bắt buộc triển khai theo số thứ tự. Giữ mã 001–079 và KT-01–08 để truy vết; nội dung được điều chỉnh theo monolith. Auth, Catalog, Order, Payment, Notification, Tracking và Recommendation trong task là module của `backend`, không phải ứng dụng hoặc database riêng. Task ghi Frontend bao gồm giao diện trong `frontend`. Chỉ tạo module khi triển khai chức năng thật.

Các task 003, 036 và 037 được giữ số để truy vết nhưng không thuộc phạm vi monolith hiện tại. Không dùng chúng làm điều kiện tiên quyết cho bản web. Tracking/export và gợi ý rule-based thuộc backend ở task 063–067; chỉ nghiên cứu/model serving Python/FastAPI ở task 073–077 là giai đoạn AI sau. AWS 078–079 là tùy chọn sau local.

<a id="current-status"></a>

## Hiện trạng và cách đọc

- **Có mã:** đã tìm thấy code/cấu hình tương ứng; vẫn phải kiểm tra đầy đủ điều kiện bàn giao. Không có nghĩa đã nghiệm thu với DB/provider/trình duyệt thật.
- **Một phần:** đã có một phần nền tảng, còn thiếu các tiêu chí ghi trong task.
- **Chưa:** chưa có phần triển khai tương ứng trong code hiện tại.
- **Ngoài phạm vi:** không triển khai theo kiến trúc đã chốt; chỉ mở lại khi có yêu cầu mới.
- **Tùy chọn:** giai đoạn tương lai, không chặn nghiệm thu bản web local.

Code hiện có: `backend/src/auth`, CatalogModule quản lý Category, Product/SKU, public catalog, media và inventory; OrderModule có cart, checkout COD, snapshot đơn, idempotency, xác nhận/hủy Admin và worker hết hạn. Frontend checkout COD, danh sách/chi tiết đơn Customer và xử lý đơn Admin đã nối API. Schema đã được đồng bộ vào PostgreSQL local; checkout và browser chưa kiểm chứng tích hợp. Prisma Migrate và các file migration không thuộc workflow. Upload media qua Admin API end-to-end chưa kiểm chứng. PayOS, giao hàng, Tracking và Recommendation chưa triển khai; Notification chưa có email job/worker. Checkout dùng địa chỉ đã lưu và không có quote riêng. Lịch sử biến động tồn kho đã bị loại khỏi schema/API/UI; `onHand`/`reserved` hiện tại vẫn được duy trì.

Giới hạn hiện tại: Gmail SMTP cần `GMAIL_USER` và App Password; gửi thật và tương tác UI trên trình duyệt chưa được kiểm chứng. Email reset gửi trực tiếp sau commit; provider lỗi thì khách yêu cầu lại, không có worker tự retry. API reset hiện chưa giới hạn tần suất; dự kiến triển khai cùng Redis. AuthProvider lưu access token trong localStorage, chưa đạt mục tiêu bộ nhớ frontend của NFR-02; Origin/CSRF, rate limit toàn ứng dụng, request ID và hợp đồng lỗi thống nhất chưa hoàn chỉnh. Chưa có test database/provider hoặc bộ test trình duyệt đầy đủ; test:e2e chưa có config và frontend chưa có test script. Cấu hình Docker/CI tồn tại không chứng minh đã chạy nghiệm thu container hoặc pipeline từ xa.

Trong snapshot này, `docs/data` và `docs/task` đang trống. Task 019, 031–033 và nghiên cứu cần đầu vào thật; không tự tạo dataset hoặc reseed để đánh dấu hoàn thành. Chi tiết artifact cần chuẩn bị ở SRS mục 10.2 và Database mục 11.

## 1. Nền tảng dự án

| STT | Task                                                                       | Hiện trạng    | Điều kiện bàn giao                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | [Platform] Maintain the Frontend and Modular Backend Structure             | Có mã         | Hai thư mục ứng dụng frontend/backend với package/lockfile/Dockerfile riêng; một NestJS AppModule import AuthModule/DatabaseModule; gọi provider nội bộ, không gateway hoặc scaffold service riêng.                                                                                                 |
| 002 | [Database] Configure Local PostgreSQL and Prisma ORM                       | Có mã         | Compose chạy PostgreSQL local với named volume; Prisma schema là source of truth; `npm run db:push` chỉ chạy thủ công với DB local. Không chạy migration hoặc trỏ lệnh đồng bộ schema tới database remote/dùng chung. |
| 003 | [Infrastructure] Retire the Separate Messaging and Search Stack            | Ngoài phạm vi | Ngoài phạm vi hiện tại: không provision Kafka, Redis hoặc Elasticsearch. PostgreSQL xử lý dữ liệu/search; provider và job local thay giao tiếp phân tán. Chỉ mở lại bằng quyết định phạm vi mới.                                                                                                    |
| 004 | [DevOps] Run Frontend, Backend, and Local PostgreSQL Containers            | Có mã         | Compose chạy ba service frontend/backend/PostgreSQL; PostgreSQL có named volume. Supabase Storage, Auth secrets và Gmail SMTP được cấu hình riêng. Không healthcheck/service_healthy. Kiểm tra startup/restart không dùng thao tác xóa dữ liệu. |
| 005 | [Platform] Standardize API Contracts, Security, Configuration, and Logging | Một phần      | OpenAPI/schema, validation và lỗi/request ID thống nhất; cấu hình thiếu báo rõ, log không lộ secret. Hoàn thiện Origin/CSRF cho mutation dựa cookie, giới hạn đăng nhập/refresh và đưa access token về bộ nhớ frontend theo NFR-02/NFR-11.                                                          |
| 006 | [Backend] Configure Direct API Routes and Protected Module Endpoints       | Một phần      | Frontend gọi backend /api/v1; không /health hoặc healthcheck. Module dùng Auth guards/ownership; upload/webhook trực tiếp, không introspection/service token hoặc HTTP seed route.                                                                                                                  |
| 007 | [Backend] Implement Transactional Idempotency and Local Job Processing     | Chưa          | Idempotency scope actor/operation/key + payload hash; kết quả ghi cùng transaction dữ liệu chính. Nhiều module dùng cùng Prisma.TransactionClient; email_outbox/job local có dedupe/retry/backoff/khóa nhận việc, không inbox/broker/DLQ giữa module.                                                          |
| 008 | [CI] Verify the Frontend and Backend Applications                          | Có mã         | CI dùng matrix frontend/backend và lockfile riêng; npm ci, lint, typecheck, test nếu có, build và Docker build. Báo riêng kết quả local, pipeline từ xa và phần chưa có test; không coi npm test --if-present là UI test.                                                                           |
| 009 | [Frontend] Extend Routing, Layouts, and Shared UI Components               | Một phần      | Kế thừa router/API client/form Auth; bổ sung layout cửa hàng/Admin, bảng/phân trang và loading/error; định dạng VND/Asia/Ho_Chi_Minh; không coi layout Auth hiện có là toàn bộ storefront/Admin.                                                                                                    |

## 2. Tài khoản và phân quyền

| STT | Task                                                                  | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 010 | [Auth] Create Account and Session Schemas, Migrations, and Demo Seeds | Có mã      | Prisma repositories; bcrypt với mật khẩu mới tối thiểu 6 ký tự, không kiểm tra 72 byte; email chuẩn hóa unique; hash refresh token; seed Customer/Admin không ghi đè dữ liệu cũ.                                                                                                                                       |
| 011 | [Auth/Frontend] Implement Customer Registration API and UI            | Có mã      | Tạo Customer hợp lệ; từ chối email trùng và dữ liệu sai; hiển thị lỗi từng trường.                                                                                                                                              |
| 012 | [Auth/Frontend] Implement Login, Token Refresh, and Logout            | Một phần   | AuthModule trực tiếp xử lý login/session/refresh/logout; refresh xoay vòng và thu hồi phiên đúng, token cũ bị chặn; UI xóa ngữ cảnh khi logout. Hoàn thiện lưu access token trong bộ nhớ theo NFR-02 thay localStorage hiện có. |
| 013 | [Auth/Frontend] Implement Password Changes and Session Revocation     | Có mã      | Kiểm tra mật khẩu cũ; thành công thu hồi mọi phiên và yêu cầu đăng nhập lại.                                                                                                                                                    |
| 014 | [Auth] Enforce Customer and Admin Role-Based Access                   | Có mã      | AuthGuard xác thực phiên trước RolesGuard; CUSTOMER/ADMIN, 401 khi chưa xác thực, 403 khi sai role; bỏ qua header actor/role giả. Nghiệp vụ mới kiểm tra ownership; Origin/CSRF và rate limit theo task 005.                    |

## 3. Email, hồ sơ và địa chỉ

| STT | Task                                                                    | Hiện trạng | Điều kiện bàn giao                                                                                                                                                      |
| --- | ----------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 015 | [Notification] Implement Email Delivery Jobs and Retry Workers          | Chưa       | Có job, SMTP/Mailpit, worker retry và dedupe; tra cứu được trạng thái gửi/thất bại.                                                                                     |
| 016 | [Auth/Notification] Implement Password Reset APIs and Email Integration | Có mã, chưa kiểm chứng Gmail thật | API trả phản hồi chung; token SHA-256 dùng một lần, hạn 30 phút; token mới vô hiệu token cũ; reset thu hồi mọi phiên; gửi trực tiếp qua Gmail SMTP sau commit. Chưa có email job/worker/retry; thuộc task 015. |
| 017 | [Frontend] Build Authentication and Commerce UI Pages                    | Có UI theo mockup; chưa kiểm chứng trình duyệt | Các route Auth và commerce theo mockup có màn hình responsive. Auth và Admin Category gọi API backend; `/admin` yêu cầu role ADMIN. Product/SKU, giỏ/checkout/đơn hàng và các mục Admin khác vẫn dùng fixture/state cục bộ. |
| 018 | [Auth/Frontend] Implement Profile Management API and UI                 | Chưa       | Chỉ sửa tên/điện thoại; email chỉ đọc; không đổi role/password qua API hồ sơ.                                                                                           |
| 019 | [Auth] Import Administrative Divisions and Implement Lookup APIs        | Ngoài phạm vi hiện tại | Frontend lấy JSON tiếng Việt trực tiếp từ GitHub; không tạo bảng địa giới hoặc API lookup backend. |
| 020 | [Auth/Frontend] Implement Address Book API and UI                       | Đã triển khai; DB local đã đồng bộ; trình duyệt chưa kiểm chứng | CRUD đúng chủ, một địa chỉ mặc định, JSON tỉnh/xã online chỉ ở frontend, tên địa giới lưu dạng text; checkout chọn địa chỉ đã lưu nhưng chưa thể đặt đơn. |

## 4. Ảnh và catalog quản trị

| STT | Task                                                                    | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 021 | [Catalog] Create Image Assets and a Supabase Storage Adapter            | Đã triển khai một phần | Metadata asset, adapter REST Supabase, secret chỉ backend, object path bất biến; bucket public phải được tạo/cấu hình riêng và chưa được xác minh. |
| 022 | [Catalog] Implement Supabase Media Upload API                           | Đã triển khai một phần | Admin chọn nhiều ảnh JPEG/PNG/WebP ≤5 MiB hoặc video MP4/WebM/MOV ≤50 MB; backend upload path mới với `upsert:false`, lưu metadata sau phản hồi thành công. Không xác minh bytes, SHA-256, đọc lại object hoặc READY. Cần kiểm chứng Admin API thật. |
| 023 | [Catalog] Implement Upload Idempotency and Failure Recovery             | Không thuộc scope hiện tại | Upload mỗi lần tạo path mới; không có idempotency hoặc đối soát retry. Lỗi giữa upload Storage và ghi metadata có thể để lại object mồ côi. |
| 024 | [Catalog] Create Catalog Schema and Source Data Mappings                | Chưa       | Có category, Product, SKU, image links và provenance; ID nguồn tách ID vận hành; brand chỉ là metadata seed.                                                                                                                                                                          |
| 025 | [Catalog/Frontend] Implement Category Management API and UI             | Đã triển khai phần Category | Category CRUD qua Admin API và giao diện cây + form; chỉ quản lý phân loại/cây, không cấu hình SKU; xác thực tên/slug, cha hợp lệ và chu trình; không xóa vật lý. Không xử lý ghi đồng thời cây. |
| 026 | [Catalog/Frontend] Implement Product Management API and UI | Đã triển khai một phần | Admin API/UI tìm tên không phân biệt hoa/dấu, lọc danh mục con/trạng thái, phân trang URL; tạo ACTIVE nguyên tử cùng cấu hình SKU riêng, tồn và ảnh liên kết; sửa Product và ngừng/mở bán; Storage project thật chưa kiểm chứng. |
| 027 | [Catalog/Frontend] Implement SKU Management API and UI                  | Đã triển khai một phần | Mã/options cố định sau tạo; sửa giá; không có trạng thái SKU riêng; xóa mềm khi không còn tồn/đang giữ hàng và Product ACTIVE vẫn còn SKU. Quản trị tồn thuộc task 029–030. |
| 028 | [Catalog] Implement Product Media Links and Sales Status Management | Đã triển khai một phần | Liên kết ảnh/video sau upload thành công; ảnh đại diện/sort/gỡ và kiểm tra Product ACTIVE; UI có upload nhiều tệp, không nhập ID asset; luồng Admin/API thật chưa xác minh end-to-end. |

## 5. Tồn kho và dữ liệu demo

| STT | Task                                                            | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                  |
| --- | --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 029 | [Catalog] Create Inventory Fields and Stock Management       | Đã triển khai một phần | Prisma có Inventory theo SKU, ProductInventory, version và key idempotency Admin. Không lưu lịch sử biến động tồn. Chưa đồng bộ schema đơn hàng vào database local. |
| 030 | [Catalog/Frontend] Implement Inventory Management API and UI    | Đã triển khai code; kiểm chứng DB còn chờ | Admin API/UI xem tồn, nhập, điều chỉnh, kiểm kê có version, tìm/lọc/phân trang và lịch sử; mỗi thao tác nguyên tử, lặp key không tạo biến động hai lần. Chưa xác minh PostgreSQL đồng thời hoặc trình duyệt end-to-end. |
| 031 | [Catalog] Prepare and Validate Seed Data Artifacts              | Chưa       | Có ba CSV, manifest/version/checksum/quota; chặn sai schema, trùng ID, thiếu tham chiếu và dữ liệu không hợp lệ.                                                                                    |
| 032 | [Catalog] Implement Placeholder Image Upload and Catalog Import | Chưa       | Upload ảnh qua Catalog trước; import nguyên tử 500 Product/SKU mặc định, 23 danh mục, 1.664 mapping và tồn đúng nguồn.                                                                              |
| 033 | [Catalog] Verify Seed Idempotency and Data Reconciliation       | Chưa       | Đúng manifest/quota, CDN đọc được; không nhân SKU/tồn hoặc ghi đè sửa đổi Admin; dữ liệu nguồn không tạo giao dịch LIVE.                                                                            |

## 6. Catalog công khai và tìm kiếm

| STT | Task                                                               | Hiện trạng    | Điều kiện bàn giao                                                                                                                                                                        |
| --- | ------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 034 | [Catalog] Implement Public Catalog and Product/SKU Query Providers | Một phần       | Có danh sách phân trang và detail công khai cho Product ACTIVE với SKU/giá/tồn/ảnh; tìm kiếm, lọc, sort và provider chia sẻ với Order còn thiếu. |
| 035 | [Catalog] Implement Product Search, Filters, and Facets            | Chưa          | Tìm chuỗi con không phân biệt hoa/dấu; các điều kiện khớp cùng SKU; gồm danh mục con; chặn facet mơ hồ.                                                                                   |
| 036 | [Catalog] Defer External Search Index Integration                  | Ngoài phạm vi | Ngoài phạm vi hiện tại; tìm kiếm PostgreSQL theo task 035 và TC-52. Không có index/projection/consumer cần dựng. Nếu sau này cần Elasticsearch, phải thống nhất yêu cầu và đồng bộ riêng. |
| 037 | [Catalog] Defer External Cache Integration                         | Ngoài phạm vi | Ngoài phạm vi hiện tại; đọc từ PostgreSQL, chưa cần Redis/TTL/invalidation. Chỉ bổ sung cache khi có yêu cầu đo được và không lấy cache làm nguồn quyết định tồn/payment.                 |
| 038 | [Frontend] Build the Home Page and Product Listing                 | Một phần       | `/products` dùng API và phân trang; Home vẫn là nội dung demo, tìm/lọc/sort chưa có. |
| 039 | [Frontend] Build Product Details, SKU Selection, and Image Gallery | Một phần       | Detail dùng API, chọn options/SKU và media theo variant; cần kiểm chứng browser với tổ hợp SKU/media thực tế. |

## 7. Giỏ hàng và checkout COD

| STT | Task                                                    | Hiện trạng | Điều kiện bàn giao                                                                                                                                                 |
| --- | ------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 040 | [Order] Create Cart Schema and Implement Cart APIs      | Một phần    | Một giỏ/Customer; API thêm/cộng/sửa/xóa kiểm tra quyền và tồn cơ bản; chưa có idempotency, event, transaction nghiệp vụ hoặc bảo đảm đồng thời. |
| 041 | [Frontend] Build the Cart Page and Login Flow           | Đã triển khai một phần | Giỏ Customer gọi API, chọn dòng/sửa quantity/xóa và chuyển các dòng chọn sang checkout; browser/mobile chưa kiểm chứng. |
| 042 | [Order] Implement Direct Checkout Validation | Đã triển khai một phần | POST /orders kiểm tra lại giá/số lượng/địa chỉ, tự tính COD và từ chối payload đã đổi; không có quote riêng. Chưa kiểm chứng PostgreSQL/browser. |

## 8. Payment và provider tồn kho trong backend

| STT | Task                                                                  | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 043 | [Payment/Order] Add Payment Fields and Implement COD Processing       | Chưa       | Dùng trạng thái/phương thức/paidAt/reference trên orders theo Database mục 6, chưa cần bảng payment_intents riêng. Thu COD cùng transaction DELIVERED/PAID và event từng dòng đúng một lần; không phụ thuộc payOS.             |
| 044 | [Payment] Implement payOS Payment Link Creation, Lookup, and Retry    | Chưa       | Lưu code ổn định trước gọi provider; đúng tiền/hạn; timeout tra kết quả cũ, không tạo link mới khi chưa rõ.                                                                                                                    |
| 045 | [Payment] Verify payOS Webhooks and Commit Order Payment Results      | Chưa       | Xác minh chữ ký/mã đơn/amount/phương thức; khóa đơn, kiểm tra trạng thái mới nhất và ghi PAID/paidAt/reference/business event nguyên tử trong DB chung. Webhook lặp không ghi thêm tiền/event; phản hồi thành công sau commit. |
| 046 | [Payment/Order] Reconcile Cancellation and Late Provider Results      | Chưa       | Payment/hủy dùng cùng khóa đơn và version trong DB; không hủy đơn đã PAID. Provider đóng link/đối soát gọi ngoài khóa DB; kết quả không rõ hoặc tiền đến đơn đã hủy lưu dấu vết để đối soát, không tự refund/mở lại đơn.       |
| 047 | [Catalog] Implement Transaction-Aware Inventory Reservation Providers | Chưa       | Provider Catalog nhận Prisma.TransactionClient của checkout, khóa SKU đúng thứ tự, kiểm tra giá/version/available và dựng snapshot; giữ tất cả hoặc rollback. Không commit reservation độc lập trước đơn hoặc gửi command/result.         |
| 048 | [Catalog/Order] Implement Atomic Reservation Release Providers  | Đã triển khai một phần | Provider Catalog giữ/giải phóng reservation cho SKU và Product không SKU trong transaction Order; chưa có xuất giao/hoàn hàng. Đối soát reservation dùng order_items. |

## 9. Checkout và tạo đơn

| STT | Task                                                                     | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 049 | [Order] Create Order Schemas and Accept Direct Checkout Requests         | Đã triển khai; schema đã đồng bộ local | Prisma có orders/items/history/events/idempotency; cùng key/body trả đơn cũ, payload khác báo xung đột. Chưa kiểm chứng luồng checkout tích hợp. |
| 050 | [Order] Commit COD Checkout Atomically      | Đã triển khai; DB/browser chưa kiểm chứng       | Một transaction kiểm tra user/session/giỏ/giá/địa chỉ; tạo PENDING COD, snapshot, tăng reserved, event, xóa đúng dòng mua và lưu idempotency. Không dùng quote hoặc payOS trong đợt này. |
| 051 | [Order] Verify Checkout Rollback, Retry, and Restart Recovery            | Chưa       | Lỗi trước commit rollback toàn bộ đơn/tồn/giỏ/event/địa chỉ/idempotency; timeout sau commit gửi lại cùng key lấy đơn cũ. Không Saga/bù phân tán hoặc khóa giỏ qua nhiều request; recovery worker chỉ xử lý job/provider theo trạng thái bền vững.                 |
| 052 | [Order/Payment] Implement Owned Order Lookup and Payment Link Retry APIs | Chưa       | Chỉ chủ đơn đọc được đơn/link và retry payOS cho chính đơn UNPAID. Mất response checkout thì gửi lại cùng key/payload, không tạo đơn mới hoặc API polling tiến trình Saga.                                                                                        |
| 053 | [Frontend] Build COD Checkout Page                                        | Đã triển khai; browser chưa kiểm chứng | Chọn dòng, địa chỉ, ghi chú và COD; đối chiếu giá server; cùng key/payload khi retry và kiểm tra kết quả sau reload. PayOS chưa thuộc đợt này. |

## 10. Vòng đời đơn hàng

| STT | Task                                                                    | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 054 | [Order/Frontend] Implement Customer Order List and Details              | Đã triển khai; browser chưa kiểm chứng | API và UI danh sách/chi tiết đúng chủ, snapshot và lịch sử trạng thái; Customer có thể hủy PENDING UNPAID. |
| 055 | [Order] Implement Order Confirmation, Cancellation, and Expiration      | Đã triển khai; DB/browser chưa kiểm chứng       | Customer hủy PENDING; Admin xác nhận PENDING hoặc hủy PENDING/CONFIRMED trước giao có lý do. PENDING UNPAID hết hạn sau 24 giờ; tồn/history/idempotency cập nhật cùng transaction và worker quét bù khi chạy lại. |
| 056 | [Order] Implement Shipment Dispatch and Delivery Completion             | Chưa       | PayOS phải PAID trước giao; xuất tồn một lần; COD xác nhận thu rồi DELIVERED/PAID; payOS không ghi giao dịch lần hai.                                                                                                          |
| 057 | [Order] Handle Failed Deliveries, Redelivery, and Returned Goods        | Chưa       | Thất bại có lý do; giao lại không xuất/tính ship thêm; chỉ đơn UNPAID nhận đủ nguyên vẹn mới nhập tồn một lần và hủy.                                                                                                          |
| 058 | [Order/Payment] Prevent Concurrent Order Lifecycle Conflicts            | Chưa       | Khóa theo thứ tự chung và version; cancel/ship/webhook/expire chỉ một kết quả hợp lệ. Không release đơn đã PAID; request/webhook lặp không làm sai tồn/payment; tiền đến muộn lưu đối soát, không mở lại đơn.                  |
| 059 | [Order/Frontend] Build Admin Order Management and Customer Cancellation | Đã triển khai một phần | Admin lọc/xem đơn, xác nhận PENDING hoặc hủy PENDING/CONFIRMED với lý do; giao hàng và thu COD chưa có. |

## 11. Quản trị và email đơn hàng

| STT | Task                                                                | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 060 | [Auth/Frontend] Implement Customer Management and Account Locking   | Chưa       | Tìm/chi tiết/khóa/mở có lý do; khóa chặn phiên cũ, mở không hồi sinh phiên; không tự hủy đơn hoặc đổi role/reset thay khách.                                                                                                                      |
| 061 | [Order/Frontend] Implement Admin Dashboard API and UI               | Chưa       | Đơn theo createdAt/trạng thái/mốc hủy, thất bại đếm đơn distinct; tiền theo paidAt tách hàng/ship; tồn thấp theo available; đúng ngày Việt Nam.                                                                                                   |
| 062 | [Notification] Implement Order Emails and Delivery Retry Operations | Chưa       | Template tạo đơn/trạng thái/payment; ghi email_outbox/job cùng transaction nghiệp vụ, worker gửi sau commit có dedupe/retry/backoff. Lỗi provider không rollback đơn; tra cứu job lỗi, ghi hạn chế gửi lặp khi provider không hỗ trợ idempotency. |

## 12. Tracking và gợi ý theo quy tắc — module backend của bản web

| STT | Task                                                                            | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 063 | [Tracking/Frontend] Implement Tracking Schema, Identity, and View/Search Events | Chưa       | Module Tracking trong backend; server gắn user/visitor/session, session hành vi hết sau 30 phút, logout tách context; UI ghi đúng lúc, không nhận business event giả. Không phụ thuộc Python/FastAPI.                                        |
| 064 | [Tracking/Order/Payment] Record Atomic Cart, Order, and Payment Events          | Chưa       | Ghi add/remove/order_created cùng transaction nghiệp vụ; transaction đúng một lần/dòng sau payment, Customer và paidAt gốc. Unique event key chống lặp; dùng cùng Prisma.TransactionClient, không Kafka consumer hoặc inbox.                            |
| 065 | [Recommendation/Frontend] Implement Rule-Based Recommendations and UI           | Chưa       | Module Recommendation trong backend dùng provider/DB nội bộ; Home theo view visitor 7 ngày, fallback sản phẩm mới; detail/cart theo danh mục, loại item không bán được. Lỗi/rỗng không chặn mua; nguồn rule_based, không gọi kết quả là GNN. |
| 066 | [Recommendation/Frontend] Track Recommendation Impressions and Clicks           | Chưa       | Lưu request ID/source/version/vị trí; đối chiếu event; impression ≥50% liên tục ≥1 giây; retry không ghi lặp.                                                                                                                                |
| 067 | [Tracking] Export Behavior Data and Isolate Source Datasets                     | Chưa       | CLI/job export từ DB chung có version/khoảng UTC/ID nguồn/checksum và event ID; không PII/notes/query tự do. Seed/replay/RetailRocket không tăng LIVE; Python model tương lai nhận artifact qua contract.                                    |

## 13. Kiểm thử và bàn giao bản web

| STT | Task                                                                         | Hiện trạng | Điều kiện bàn giao                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 068 | [QA] Test Authorization, Concurrency, and Idempotency                        | Chưa       | Không vượt quyền/lộ secret; tranh SKU cuối chỉ một đơn giữ; request/webhook/job lặp không nhân đơn/tồn/tiền/event. Kiểm tra provider giữa module dùng cùng transaction và không gọi mạng khi giữ khóa.                              |
| 069 | [QA] Test Supabase, Provider, and Job Recovery                               | Chưa       | Lỗi DB/SSL/quyền trước/sau commit, backend restart, Storage timeout, email worker và backup/restore DB cùng object bytes. Không mất/nhân dữ liệu, không test trên project làm việc; PostgreSQL search theo TC-52.                   |
| 070 | [QA] Validate End-to-End Integration and Responsive UI                       | Chưa       | Provider thật có bằng chứng riêng; UI 390px/1366px dùng được; TC-01…TC-54 đạt; ghi độ trễ/cấu hình máy.                                                                                                                             |
| 071 | [CI] Add Isolated PostgreSQL Integration Tests                                | Chưa       | Suite dùng database local test riêng, kiểm chứng schema đồng bộ, quyền và tích hợp; Storage bucket test riêng và provider test doubles phân biệt rõ. Không dùng database có dữ liệu cần giữ hoặc tạo giao dịch tiền thật. |
| 072 | [Documentation/Operations] Document Local PostgreSQL and Demo Flows           | Một phần   | Architecture hướng dẫn DATABASE_URL local, seed/start, backup/restore DB và Storage riêng. Cần xác minh project/bucket Storage thật; không hướng dẫn migration hoặc kiểm tra /health. |

## 14. Nghiên cứu và tích hợp AI — sau bản web

| STT | Task                                                                    | Hiện trạng | Điều kiện bàn giao                                                                                           |
| --- | ----------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 073 | [Research] Prepare Datasets and Define the Evaluation Protocol          | Chưa       | Có clean data/mapping, temporal split, graph user–item và trọng số; không dùng thông tin tương lai.          |
| 074 | [Research] Train LightGCN and Evaluate Baseline Models                  | Chưa       | Cùng protocol Precision@K/Recall@K/NDCG@K; lưu model, cấu hình và kết quả so sánh tái lập được.              |
| 075 | [Research] Evaluate Session Adaptation, Cold Start, and Explanations    | Chưa       | Có thí nghiệm theo thứ tự thời gian, fallback user/item mới và lý do có bằng chứng.                          |
| 076 | [Recommendation/Frontend] Integrate Model Serving APIs with the Website | Chưa       | Mapping/version/timeout rõ; lỗi model fallback rule-based; chỉ trả catalog đang bán, UI thể hiện đúng nguồn. |
| 077 | [Research] Write the Experimental Evaluation Report                     | Chưa       | Tách kết quả tập nghiên cứu/catalog demo; nêu độ trễ, chất lượng và giới hạn thực tế.                        |

## 15. AWS — tùy chọn sau local

| STT | Task                                                                 | Hiện trạng | Điều kiện bàn giao                                                                                |
| --- | -------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| 078 | [AWS] Provision Deployment Infrastructure and Publish Runtime Images | Tùy chọn   | Có môi trường/chi phí/domain/secret/storage; image Git SHA đã qua CI.                             |
| 079 | [AWS/CI] Implement Deployment, Smoke Tests, and Rollback             | Tùy chọn   | Deploy/migrate/smoke/rollback image hoạt động; webhook HTTPS, restart và restore được kiểm chứng. |

## 16. Yêu cầu kỹ thuật bổ sung đề xuất

Các mục dưới cụ thể hóa thiết kế đã ghi trong SRS/Database/Architecture, không mở rộng nghiệp vụ. Nếu khác nội dung task cũ, áp dụng bản monolith hiện hành; không tự hạ yêu cầu để khớp code chưa hoàn thiện.

| Mã    | Bổ sung                                                                                                                                                                                                                                                     | Task áp dụng                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| KT-01 | Chuẩn hóa lỗi code, message, fieldErrors? và requestId theo task 005; UI đọc mã lỗi ổn định. Hiện ValidationPipe và HTTP errors chưa phải hợp đồng lỗi hoàn chỉnh.                                                                                          | 005, 009                    |
| KT-02 | Scope actor/operation/key và hash payload chuẩn hóa; tra kết quả cũ trước khi đọc lại giá/giỏ/địa chỉ. Ghi kết quả cùng transaction; rollback không để lại kết quả thành công. Chưa tự xóa idempotency record trong demo. | 007, 023, 040, 049–051 |
| KT-03 | Không có quote checkout riêng. Backend đối chiếu giá/số lượng vừa xem, tự tính tiền và kiểm tra tồn trong transaction đặt đơn. | 042, 049–051 |
| KT-04 | Event addtocart/removefromcart lưu delta quantity, cartId/Product/SKU, actor do server xác định và event key ổn định, không PII. Writer dùng cùng Prisma.TransactionClient với giỏ; không tạo topic/event bus phân tán.                                                | 007, 040, 064               |
| KT-05 | POST /orders trả đơn sau commit; retry chưa rõ kết quả dùng cùng idempotency key/payload. UI giữ key cho cùng ý định khi reload, không giữ token/PII trong dữ liệu retry; state/payment link đọc theo quyền chủ đơn, không operationId/checkoutId phân tán. | 049–053, 055–059            |
| KT-06 | Test tìm chuỗi con, hoa/dấu/đ, điều kiện khớp cùng SKU và cây danh mục trên PostgreSQL theo TC-52. Escape %/_ trong LIKE, index/query phù hợp; ES/Redis không là điều kiện nghiệm thu.                                                                      | 035, 068–071                |
| KT-07 | Timeout/retry/worker interval/upload concurrency cấu hình ở backend. Không gọi provider khi giữ transaction/row lock; timeout payOS/upload chưa rõ phải đối soát trước retry, hết retry không tự coi thất bại chắc chắn.                                    | 004–007, 023, 044, 046, 051 |
| KT-08 | Export có manifest schema version, khoảng UTC [from,to), số dòng/checksum/mốc nhận; giữ event ID để dedupe và có xuất bù event đến trễ. Không PII; không thay đổi dataset nghiên cứu để khớp demo.                                                          | 067, 073                    |

## 17. Truy vết và phụ thuộc

| Nhóm task    | Yêu cầu/kiểm chứng chính                                                             | Phụ thuộc thực tế                                                                       |
| ------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 001–009      | FR-OPS; NFR-01–06, NFR-11–12, NFR-15; TC-39, TC-51–52                                | Hai ứng dụng/DB chung; 003/036/037 không là blocker                                     |
| 010–020, 060 | FR-AUTH, FR-ADDR, FR-LOC; TC-01–07, TC-31–32, TC-49                                  | Schema Auth và migration token reset; Gmail SMTP cho reset, email job/worker thuộc task 015; địa chỉ cần snapshot địa giới |
| 021–039      | FR-CAT, FR-ADM-01–03, FR-INV, FR-DATA; TC-08–09, TC-26–30, TC-37, TC-42–45, TC-52–54 | Supabase Storage, artifact/manifest thật; tồn không phụ thuộc Redis/search index        |
| 040–053      | FR-CART, FR-CHK, FR-PAY; TC-10–18, TC-46–48, TC-51                                   | Provider Auth/Catalog/Order/Payment cùng backend, cùng transaction; payOS ngoài khóa DB |
| 054–062      | FR-ORD, FR-INV, FR-ADM, FR-EMAIL; TC-19–25, TC-29–32, TC-46–50                       | Schema đơn/kho và email_outbox local; khóa đơn bảo vệ payment/lifecycle                 |
| 063–067      | FR-TRK, FR-REC; TC-33–36, TC-38, TC-40                                               | Event nghiệp vụ cùng transaction, rule-based trong backend; không chờ model             |
| 068–072      | Toàn bộ NFR và TC-01–54                                                              | DB test riêng, provider test doubles và bằng chứng provider thật riêng                  |
| 073–077      | Phạm vi nghiên cứu/model trong Research scope                                        | Dataset/temporal split/model artifact và contract mapping, sau bản web                  |
| 078–079      | Triển khai tùy chọn, không thuộc nghiệm thu local                                    | Bản local đã ổn định và quyết định triển khai riêng                                     |

Các nhóm trên là gợi ý phụ thuộc, không phải thứ tự bắt buộc hoặc xác nhận task đã xong. Khi cập nhật task phải đối chiếu FR/UC/TC và code, giữ rõ kết quả có mock với bằng chứng tích hợp thật. Không xóa mã task khi bỏ hạ tầng; ghi lý do ngoài phạm vi để các tham chiếu cũ vẫn truy vết được.

## 18. Phiên bản kế hoạch hiện tại

| Phiên bản | Ngày       | Nội dung                                                                                                   |
| --------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| 2.3       | 27/10/2026 | Đồng bộ env root/backend và Docker hiện hành, bỏ cấu hình/provider đã thay thế; giữ 79 mã task và 8 mục KT |
| 2.4       | 29/10/2026 | Đồng bộ task 004 với cấu hình thực tế sau khi bỏ biến API key/Storage chưa được sử dụng |
| 2.5 | 29/10/2026 | Đồng bộ Prisma repositories, migration baseline và mật khẩu tối thiểu 6 ký tự; giữ bcrypt |
| 2.6 | 29/10/2026 | Task 016 có API khôi phục mật khẩu và gửi Resend trực tiếp; email jobs/workers vẫn chờ task 015 |
| 2.7 | 29/10/2026 | Hoàn thiện UI reset mật khẩu task 017 và trang `/admin` kiểm tra role qua API Admin-only |
| 2.8 | 29/10/2026 | Chuyển provider gửi email reset từ Resend sang Gmail SMTP; App Password cấu hình riêng cho backend |
| 2.9 | 29/10/2026 | Bỏ Asset Lookup API khỏi task 022; nhận mã ảnh/URL qua upload, thử lại cùng key/file khi chưa rõ kết quả |
| 3.0 | 30/10/2026 | Triển khai Category Management task 025; chưa triển khai Product/SKU hoặc xử lý ghi đồng thời cây |
| 3.1 | 30/10/2026 | Bổ sung migration chuẩn hóa khoảng trắng Unicode cho name_key Category |
| 3.2 | 01/11/2026 | Bỏ Attributes riêng của Product; thông tin chung dùng mô tả. Thiết kế lúc đó đặt optionConfig ở Category; thay đổi sau chuyển cấu hình này sang từng Product. |
| 3.3 | 01/11/2026 | Bỏ DRAFT; tạo Product ACTIVE ngay với nội dung/ảnh đầy đủ; SKU có thể được bổ sung sau; triển khai và nghiệm thu 026–028 cùng đợt, có phụ thuộc Storage và tồn kho. |
| 3.4 | 01/11/2026 | Bổ sung Catalog Product/SKU API và UI; SKU không có trạng thái bán riêng, giá sửa được, options cố định, xóa mềm. |
| 3.7 | 01/11/2026 | Chuyển cấu hình lựa chọn SKU sang từng Product; Category chỉ dùng để phân loại. |
| 3.8 | 01/11/2026 | Bổ sung chọn nhiều ảnh/video trong form Product; bỏ nhập ID asset thủ công. |
