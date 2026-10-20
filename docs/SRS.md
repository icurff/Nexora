# SRS — Nexora

**Software Requirements Specification / Đặc tả yêu cầu phần mềm**

| Thông tin | Giá trị |
|---|---|
| Phiên bản | 1.11 |
| Ngày lập | 09/10/2026 |
| Cập nhật | 17/10/2026 |
| Trạng thái | Draft — sẵn sàng rà soát trước triển khai |
| Tài liệu nghiệp vụ | [BRD](BRD.md) |
| Thiết kế dữ liệu | [Database baseline](DATABASE_DESIGN.md); ownership phân tán theo [Architecture](Folder-ARCHITECTURE.md) |
| Kiến trúc | [Microservices, Saga và monorepo](Folder-ARCHITECTURE.md) |
| Phạm vi | Ecommerce đa ngành local, catalog synthetic/placeholder, COD, payOS, email khôi phục mật khẩu/thông báo, tracking và gợi ý theo quy tắc |
| Ngoài phạm vi AI | Training, benchmark và tích hợp dịch vụ model thật |

## Mục lục

1. [Giới thiệu và thuật ngữ](#introduction)
2. [Tác nhân, quyền và môi trường](#actors)
3. [Yêu cầu chức năng](#functional)
4. [Đặc tả use case](#use-cases)
5. [Trạng thái và quy tắc xử lý](#states)
6. [Dữ liệu và màn hình](#data-ui)
7. [Yêu cầu phi chức năng](#non-functional)
8. [API và giao diện tích hợp](#interfaces)
9. [Kiểm thử và truy vết](#verification)
10. [Giới hạn và điều kiện bàn giao](#delivery)

<a id="introduction"></a>
## 1. Giới thiệu và thuật ngữ

### 1.1. Mục đích

Tài liệu mô tả hành vi quan sát được, dữ liệu nhập, quyền, luồng lỗi và tiêu chí hoàn thành của Nexora. Các yêu cầu là mục tiêu cần triển khai, không phải danh sách chức năng đã có trong code.

Các quyết định nghiệp vụ tại [BRD, mục 7](BRD.md#rules) được tham chiếu bằng BR-xx. SRS không thay thế tài liệu thiết kế database, mã nguồn hoặc hợp đồng JSON chi tiết. API ở mục 8 là hợp đồng chức năng tóm tắt để định hướng triển khai.

### 1.2. Quy ước

| Tiền tố | Ý nghĩa |
|---|---|
| BREQ | Yêu cầu nghiệp vụ trong BRD |
| FR | Yêu cầu chức năng phải triển khai |
| UC | Use case và luồng thao tác |
| BR | Quy tắc nghiệp vụ trong BRD |
| NFR | Yêu cầu phi chức năng |
| TC | Kịch bản nghiệm thu/kiểm thử |

Tất cả FR trong tài liệu là bắt buộc cho phiên bản hiện tại. Nội dung tương lai và ngoài phạm vi được ghi rõ, không phải tiêu chí bắt buộc.

### 1.3. Thuật ngữ

| Thuật ngữ | Định nghĩa |
|---|---|
| Product | Mẫu sản phẩm hiển thị trên catalog; có thể gắn một item RetailRocket |
| SKU / ProductVariant | Tổ hợp lựa chọn cụ thể của Product; có giá và tồn riêng, mã SKU tự sinh; không có lựa chọn thì một SKU mặc định |
| Attributes | Thông số chung của Product theo cấu hình danh mục, ví dụ chất liệu hoặc hệ điều hành; không phân biệt SKU |
| Options | Các lựa chọn phân biệt SKU, ví dụ màu/cỡ/dung lượng; object mã → chuỗi, khách chọn từ giá trị có sẵn |
| Attribute config | Cấu hình mã/nhãn/kiểu thông số và mã/nhãn lựa chọn tại Category, không phải module quản trị thuộc tính riêng |
| On hand | Số lượng đang nằm trong kho logic |
| Reserved | Số lượng trong kho đã giữ cho đơn chưa xuất giao |
| Available | On hand − Reserved; lượng có thể tiếp tục bán |
| Snapshot | Bản chụp thông tin tại lúc đặt hàng, không đổi theo dữ liệu hiện tại |
| COD | Khách trả tiền khi nhận hàng; Admin xác nhận đã giao và thu tiền |
| payOS | Cổng thanh toán trực tuyến; backend tạo liên kết thanh toán và xác minh kết quả qua webhook |
| Cart | Giỏ hàng thuộc một tài khoản Customer đã đăng nhập |
| Tracking session | Phiên hành vi, độc lập với phiên đăng nhập |
| Idempotency | Gửi lại cùng thao tác không phát sinh thêm hiệu ứng nghiệp vụ |
| Rule-based recommendation | Gợi ý dựa trên quy tắc của website, chưa dùng model GNN |
| source_item_id | itemid gốc RetailRocket trong CSV; ánh xạ sang retailrocket_item_id trong database |
| product_id / category_id trong CSV | ID của artifact seed, không phải khóa chính tự tăng trong database |
| interactions / users trong CSV | Tổng event và số visitor khác nhau trên cả ba hành vi của từng item nguồn; không phải thống kê LIVE |
| Root category | Nhóm gốc trong cây RetailRocket; 23 root có item tương tác được chọn cho catalog |

<a id="actors"></a>
## 2. Tác nhân, quyền và môi trường

### 2.1. Ma trận quyền

| Chức năng | Guest | Customer hoạt động | Admin |
|---|---|---|---|
| Xem catalog, tìm kiếm, gợi ý | Có | Có | Có |
| Xem/sửa giỏ và checkout | Không; đăng nhập được yêu cầu | Có, dữ liệu của mình | Không trong phạm vi vai trò Admin |
| Hồ sơ, địa chỉ, đơn cá nhân | Không | Có, dữ liệu của mình | Không dùng quyền admin để giả danh khách |
| Hủy đơn cá nhân | Không | Chỉ PENDING UNPAID | Theo quyền quản trị đơn |
| Quản lý catalog, ảnh, tồn | Không | Không | Có |
| Xử lý mọi đơn, dashboard | Không | Không | Có |
| Khóa/mở Customer | Không | Không | Có |

Tài khoản bị khóa bị từ chối các thao tác yêu cầu xác thực, kể cả khi token cũ chưa hết hạn. Không tự hủy đơn khi khóa. Việc duyệt trang công khai vẫn được phép như Guest. Bản demo cung cấp tài khoản Customer và Admin riêng để kiểm tra hai vai trò.

### 2.2. Môi trường

- ReactJS/TypeScript cho web, NestJS cho backend, PostgreSQL cho dữ liệu; Docker Compose phục vụ local.
- Giao diện tiếng Việt, giá số nguyên VND; thời gian lưu theo UTC và hiển thị theo Asia/Ho_Chi_Minh.
- API đi qua gateway local, ảnh đọc trực tiếp từ CDN; upload qua Catalog và đọc ảnh phụ thuộc Cloudinary; email phụ thuộc cấu hình nhà cung cấp, không phụ thuộc dịch vụ AI hoặc hãng vận chuyển.
- Có snapshot địa giới local và module ảnh Catalog/Cloudinary đã cấu hình; dữ liệu nguồn cần được chuẩn bị trước lần chạy đầy đủ.
- Nghiệm thu trên trình duyệt desktop và viewport điện thoại; không xây ứng dụng mobile native.

<a id="functional"></a>
## 3. Yêu cầu chức năng

Hiện tại hệ thống gồm API gateway và năm service NestJS: Auth, Catalog, Order, Payment, Notification, mỗi service có database riêng. Catalog sở hữu cả module ảnh/Cloudinary. Recommendation sẽ làm sau bằng Python/FastAPI, không có scaffold/container/database hiện tại. Kafka, Elasticsearch và Redis là hạ tầng thiết kế cho bước sau. Order là Saga orchestrator; HTTP cho truy vấn đồng bộ và Kafka dự kiến truyền command/result/event. Docker Compose local là môi trường chính. Xem [Architecture](Folder-ARCHITECTURE.md).

Trong tài liệu này, transaction nguyên tử chỉ áp dụng trong một service. Nghiệp vụ xuyên service hoàn thành qua Saga có retry/compensation; trạng thái đang xử lý được lưu bền vững và không được hiển thị thành công sớm. Các use case mô tả trạng thái nghiệp vụ đích; Order orchestrator xác minh result đã commit từ Catalog/Payment trước khi tiến bước hoặc hoàn tất operation; domain event phục vụ subscriber sau commit.

### 3.1. Tài khoản và địa chỉ

| Mã | Yêu cầu |
|---|---|
| FR-AUTH-01 | Đăng ký Customer bằng họ tên, email, mật khẩu và xác nhận; kiểm tra email trùng sau chuẩn hóa; không xác minh email |
| FR-AUTH-02 | Đăng nhập bằng email/mật khẩu; sai thông tin báo lỗi chung; tài khoản khóa bị từ chối; hỗ trợ nhiều phiên |
| FR-AUTH-03 | Đăng xuất kết thúc phiên hiện tại và xóa ngữ cảnh tài khoản trên giao diện; giỏ vẫn được lưu theo tài khoản trên server |
| FR-AUTH-04 | Đổi mật khẩu phải kiểm tra mật khẩu hiện tại; thành công thu hồi mọi phiên và yêu cầu đăng nhập lại |
| FR-AUTH-05 | Xem/sửa họ tên và điện thoại hồ sơ; email chỉ đọc; không đổi mật khẩu qua API sửa hồ sơ |
| FR-AUTH-06 | Guest yêu cầu khôi phục mật khẩu bằng email; phản hồi không tiết lộ email có tài khoản hay không; gửi liên kết một lần có hạn dùng qua email |
| FR-AUTH-07 | Customer đặt mật khẩu mới bằng token reset hợp lệ; token hết hạn/đã dùng bị từ chối; thành công thu hồi mọi phiên |
| FR-ADDR-01 | Xem/thêm/sửa/xóa địa chỉ của mình; chọn tỉnh và đơn vị cấp xã hợp lệ thuộc tỉnh |
| FR-ADDR-02 | Quản lý tối đa một địa chỉ mặc định; địa chỉ đầu tiên mặc định; xóa mặc định thì chọn địa chỉ còn lại được tạo sớm nhất |
| FR-ADDR-03 | Địa chỉ nhập tại checkout chỉ lưu vào sổ nếu khách chọn; mặc định không chọn; không tự sửa hồ sơ |

### 3.2. Catalog, biến thể và gợi ý

| Mã | Yêu cầu |
|---|---|
| FR-CAT-01 | Trang chủ có lối vào danh mục, sản phẩm mới và nhóm sản phẩm được quan tâm; không yêu cầu module quản lý banner |
| FR-CAT-02 | Tìm tên sản phẩm, phân trang, lọc danh mục gồm các danh mục con/lựa chọn SKU/giá/còn hàng; sắp xếp mới nhất hoặc giá tăng/giảm; trạng thái lọc phản ánh trên URL; chưa lọc thông số chung Product hoặc khoảng số theo lựa chọn |
| FR-CAT-03 | Trang chi tiết hiển thị nội dung, thông số, ảnh chung/ảnh SKU; tự chọn SKU duy nhất, nhiều biến thể cho chọn các thuộc tính theo mọi thứ tự; chỉ Customer đã đăng nhập mới thêm SKU hợp lệ vào giỏ; Guest được yêu cầu đăng nhập và quay lại sản phẩm sau đăng nhập |
| FR-CAT-04 | Hết hàng vẫn hiển thị có nhãn; nháp/ngừng bán không xuất hiện công khai; SKU không còn bán không được đặt mới |
| FR-REC-01 | Hiển thị gợi ý theo quy tắc, có nguồn rule_based và request ID; loại sản phẩm ngừng bán/hết hàng; không tuyên bố kết quả là GNN |

### 3.3. Giỏ và checkout

| Mã | Yêu cầu |
|---|---|
| FR-CART-01 | Tạo hoặc đọc giỏ theo Customer đã đăng nhập; mỗi Customer có tối đa một giỏ; Guest không có giỏ |
| FR-CART-02 | Chỉ Customer đang hoạt động mới thêm SKU/số lượng; cùng SKU cộng số lượng, SKU khác tạo dòng; kiểm tra trạng thái bán và available; thêm giỏ không giữ hàng |
| FR-CART-03 | Customer sửa số lượng hoặc xóa dòng; không đổi lựa chọn SKU trong giỏ; chọn các dòng checkout và tính tạm tính theo phần chọn |
| FR-CART-04 | Guest gọi API giỏ hoặc chọn thêm giỏ phải được yêu cầu đăng nhập; sau đăng nhập tiếp tục về trang sản phẩm/thao tác dự định; không có cơ chế giỏ Guest hoặc hợp nhất giỏ |
| FR-CART-05 | Hiển thị giá hiện tại, cảnh báo thay đổi giá/hết hàng/ngừng bán; giữ dòng không mua được nhưng không cho chọn checkout |
| FR-CHK-01 | Checkout yêu cầu Customer hoạt động, có dòng được chọn và địa chỉ; cho chọn COD hoặc payOS, hiển thị tiền hàng + phí 30.000đ + tổng phải trả |
| FR-CHK-02 | Khi đặt, đối chiếu trạng thái giỏ và giá mà khách vừa xem, kiểm tra tất cả SKU/tồn/địa chỉ; thay đổi hoặc dòng lỗi phải yêu cầu kiểm tra lại, chưa tạo đơn |
| FR-CHK-03 | Saga orchestration tại Order: ReserveInventory → result Catalog → lưu đơn/snapshot/lịch sử/giỏ/outbox và khởi tạo PreparePayment; request trả checkoutId để theo dõi. Gửi lại cùng key trả cùng tiến trình/đơn; chỉ xóa dòng đã mua; payOS link được tạo cho đơn đã tồn tại |
| FR-PAY-01 | Backend tạo payment link payOS cho đúng mã đơn, số tiền và thời hạn đơn; lưu mã liên kết và URL thanh toán; không tạo link do client tự gửi số tiền |
| FR-PAY-02 | Chỉ cập nhật PAID khi webhook payOS có chữ ký hợp lệ, đúng mã đơn và đúng số tiền; xử lý webhook lặp không ghi nhận thanh toán/event trùng |
| FR-PAY-03 | Trang return/cancel của trình duyệt chỉ hiển thị trạng thái; frontend tải lại đơn từ backend, không tự xác nhận thanh toán |
| FR-PAY-04 | Link thanh toán lỗi/hủy vẫn giữ đơn UNPAID; PENDING UNPAID hết hạn sau 24 giờ; không hủy hoặc hoàn tiền cho đơn PAID trong phạm vi này |

### 3.4. Đơn, tồn và quản trị

| Mã | Yêu cầu |
|---|---|
| FR-ORD-01 | Customer xem danh sách/chi tiết đơn của mình, các dòng snapshot, tổng tiền, hạn xác nhận, trạng thái thanh toán và lịch sử công khai |
| FR-ORD-02 | Customer chỉ hủy PENDING UNPAID của mình; hủy giải phóng reserved một lần; không sửa đơn hoặc tự khôi phục giỏ |
| FR-ORD-03 | Hệ thống hết hạn PENDING UNPAID sau 24 giờ; chặn xác nhận sau hạn, xử lý bù khi backend hoạt động lại; PENDING PAID không tự hết hạn |
| FR-ORD-04 | Admin xác nhận hoặc hủy đơn chưa thanh toán trước giao; hủy có lý do; thao tác bị ràng buộc bởi trạng thái và thanh toán hiện tại |
| FR-ORD-05 | Admin chuyển CONFIRMED sang SHIPPING; xuất on hand và kết thúc reservation của đơn đúng một lần |
| FR-ORD-06 | Admin xác nhận giao thành công; đơn COD phải xác nhận thu tiền và cập nhật DELIVERED/PAID; đơn payOS đã PAID được cập nhật DELIVERED; ghi transaction theo dòng đơn đúng một lần |
| FR-ORD-07 | Admin ghi giao thất bại có lý do; được giao lại không xuất kho thêm. Chỉ đơn UNPAID mới được nhận hàng về để hủy/nhập lại tồn một lần |
| FR-INV-01 | Catalog theo dõi on hand/reserved/available từng SKU, không cho âm hoặc bán vượt available; reservation gắn checkout và tham chiếu đơn khi tạo thành công |
| FR-INV-02 | Admin nhập/điều chỉnh tồn có lý do và lịch sử; không làm on hand thấp hơn reserved; không sửa số reserved bằng thao tác kiểm kê |
| FR-ADM-01 | Admin tạo/sửa/nháp/mở bán/ngừng bán Product, thông số và lựa chọn SKU theo cấu hình danh mục; chống trùng tổ hợp; dữ liệu dùng trong reservation/đơn được bảo toàn; không xóa dây chuyền đơn |
| FR-ADM-02 | Admin quản lý Category cha–con và attribute_config trong cùng form; chặn chu trình và thay đổi làm dữ liệu đang bán sai cấu hình. Brand chỉ là metadata seed, không có CRUD/API quản trị Brand; không có module/bảng thuộc tính riêng |
| FR-ADM-03 | Module ảnh trong Catalog kiểm tra/upload JPEG/PNG/WebP qua stream/buffer giới hạn lên Cloudinary, lưu image_assets và trạng thái trong catalog_db; liên kết asset READY vào Product/SKU bằng transaction local; không giữ file gốc hoặc xóa vật lý ảnh lịch sử |
| FR-ADM-04 | Admin tìm/lọc đơn, xem chi tiết, thêm ghi chú nội bộ và xem lịch sử; không lưu hãng vận chuyển/mã vận đơn |
| FR-ADM-05 | Admin tìm Customer, xem thông tin nghiệp vụ cần thiết, khóa/mở có lý do; không xem mật khẩu hoặc reset mật khẩu giúp khách |
| FR-ADM-06 | Dashboard phân biệt đơn tạo theo createdAt, đơn đang chờ, kết quả hủy/thất bại và tiền đã thu theo paidAt; tiền hàng/phí ship tách riêng |

### 3.5. Tracking, dữ liệu và local

| Mã | Yêu cầu |
|---|---|
| FR-TRK-01 | Frontend gửi view, search, recommendation_impression/click; server bổ sung receivedAt và xác định visitor/session/user |
| FR-TRK-02 | Service sở hữu ghi business outbox cùng transaction dữ liệu chính; Recommendation tiêu thụ Kafka để lưu addtocart, removefromcart, order_created, transaction idempotent; không cần transaction xuyên database |
| FR-TRK-03 | Chống event trùng bằng event ID; liên kết phiên hiện tại khi đăng nhập, tách ngữ cảnh khi đăng xuất; không sửa lại danh tính lịch sử của tài khoản khác |
| FR-DATA-01 | Seed 500 item trên 23 danh mục từ ba CSV theo manifest cố định, ID nguồn riêng, mapping category nguồn tách danh mục web; seed lại an toàn |
| FR-DATA-02 | Chuẩn bị xuất dữ liệu hành vi có version để phía AI dùng sau; giữ event type, thời gian, item, định danh nội bộ; không xuất dữ liệu liên hệ/giao hàng |
| FR-DATA-03 | Kiểm tra category mới nhất mỗi item, quota theo root và ba schema CSV theo mục 8.3; chặn import khi trùng khóa, thiếu tham chiếu, sai quota hoặc checksum |
| FR-DATA-04 | Chuyển một dòng CSV thành một Product và một SKU mặc định; lưu ID/mã nguồn và thống kê lịch sử riêng, upload placeholder qua module ảnh Catalog lên Cloudinary và gắn nhãn dữ liệu minh họa |
| FR-EMAIL-01 | Tạo thông báo email xác nhận đơn và thông báo khi trạng thái đơn/thanh toán thay đổi; gửi bất đồng bộ, chống gửi trùng theo sự kiện và thử gửi lại lỗi tạm thời |
| FR-EMAIL-02 | Email lỗi/không sẵn sàng không rollback hoặc chặn nghiệp vụ đơn; lưu trạng thái gửi để vận hành nhận biết và xử lý lại |
| FR-LOC-01 | Phục vụ địa giới từ snapshot local có nguồn/ngày phiên bản; kiểm tra quan hệ tỉnh–đơn vị cấp xã, giữ tên/mã tại lúc đặt trong snapshot đơn |
| FR-OPS-01 | Có cấu hình mẫu, migration, seed và hướng dẫn local; dữ liệu/ảnh bền vững khi khởi động lại; không tự reset dữ liệu khi start |

<a id="use-cases"></a>
## 4. Đặc tả use case

Các bước ghi dữ liệu trong từng service phải nguyên tử; Order orchestrator phối hợp hiệu ứng xuyên service bằng command/result Kafka và phục hồi tiến trình Saga; participant phục hồi transaction local/outbox của mình. Khi yêu cầu bị từ chối, UI giữ thông tin có thể tái sử dụng để khách sửa, không thông báo thành công giả. Lỗi xác thực không tự gửi lại lệnh đặt hàng dưới một danh tính mới.

### UC-01 — Đăng ký Customer

- **Tác nhân/kích hoạt:** Guest chọn Đăng ký. **Trước:** chưa đăng nhập.
- **Dữ liệu:** họ tên, email, mật khẩu, xác nhận mật khẩu.
- **Luồng chính:** nhập form → kiểm tra hợp lệ → chuẩn hóa email và kiểm tra trùng → tạo Customer hoạt động → chuyển trang đăng nhập, điền sẵn email.
- **Ngoại lệ:** email trùng, định dạng sai, mật khẩu không đạt/không khớp: báo tại trường, không tạo tài khoản. Hai đăng ký đồng thời cùng email chỉ tạo một tài khoản.
- **Sau:** không có email xác minh, không tự cấp quyền Admin. **Nghiệm thu:** TC-01.

### UC-02 — Đăng nhập và quay lại trang trước

- **Tác nhân/kích hoạt:** Guest gửi form đăng nhập. **Trước:** có tài khoản.
- **Dữ liệu:** email, mật khẩu, đích quay lại nội bộ hợp lệ.
- **Luồng chính:** kiểm tra thông tin/trạng thái → tạo phiên mới không hủy phiên khác → quay lại trang được yêu cầu. Nếu đăng nhập để thêm giỏ, trở lại sản phẩm để khách xác nhận thêm SKU.
- **Ngoại lệ:** sai thông tin báo chung; khóa báo tài khoản bị khóa; đích quay lại không thuộc ứng dụng bị bỏ qua.
- **Sau:** Customer sử dụng giỏ tài khoản; không chấp nhận user ID tự khai từ client. **Nghiệm thu:** TC-02, TC-10.

### UC-03 — Đăng xuất hoặc phiên không còn hợp lệ

- **Tác nhân/kích hoạt:** người dùng chọn logout hoặc không thể gia hạn phiên.
- **Trước/dữ liệu:** phiên hiện tại, không yêu cầu nhập lại mật khẩu.
- **Luồng chính:** thu hồi phiên khi logout → xóa token/cache dữ liệu tài khoản → đưa giao diện về trạng thái Guest. Giỏ tài khoản và đơn vẫn nằm trên server.
- **Ngoại lệ:** phiên đã hết hạn vẫn đưa UI về trạng thái Guest; không hiển thị giỏ tài khoản khi chưa xác thực. Tài khoản bị khóa bị từ chối dù phiên cũ còn thời hạn.
- **Sau:** không ảnh hưởng phiên khác nếu chỉ logout. **Nghiệm thu:** TC-03.

### UC-04 — Đổi mật khẩu

- **Tác nhân:** Customer hoặc Admin đang hoạt động. **Kích hoạt:** chọn Đổi mật khẩu.
- **Dữ liệu:** mật khẩu hiện tại, mật khẩu mới và xác nhận.
- **Luồng chính:** xác minh mật khẩu hiện tại → kiểm tra mật khẩu mới → cập nhật hash → thu hồi tất cả phiên → yêu cầu đăng nhập lại.
- **Ngoại lệ:** mật khẩu hiện tại sai, mới không hợp lệ/không khớp: không đổi, không thu hồi dở dang.
- **Sau:** chỉ mật khẩu mới dùng được; luồng khôi phục qua email được mô tả ở UC-04A/UC-04B. **Nghiệm thu:** TC-04.

### UC-04A — Yêu cầu khôi phục mật khẩu

- **Tác nhân:** Guest. **Dữ liệu:** email đã chuẩn hóa.
- **Luồng chính:** nhập email → hệ thống trả phản hồi chung không tiết lộ tài khoản tồn tại → nếu có tài khoản phù hợp, tạo token ngẫu nhiên dùng một lần, chỉ lưu hash, có hạn 30 phút và gửi liên kết khôi phục tới email.
- **Ngoại lệ:** giới hạn tần suất yêu cầu; lỗi nhà cung cấp không lộ thông tin tài khoản và cho phép khách yêu cầu lại. Không gửi mật khẩu qua email.
- **Sau:** không thay đổi mật khẩu cho tới khi token được dùng thành công. **Nghiệm thu:** TC-49.

### UC-04B — Đặt mật khẩu mới bằng liên kết

- **Tác nhân:** người giữ liên kết hợp lệ. **Dữ liệu:** token, mật khẩu mới và xác nhận.
- **Luồng chính:** kiểm tra hash token, hạn dùng và trạng thái chưa sử dụng → cập nhật hash mật khẩu, đánh dấu token đã dùng, thu hồi mọi phiên đăng nhập trong cùng giao dịch.
- **Ngoại lệ:** token sai/hết hạn/đã dùng hoặc mật khẩu không đạt: không đổi mật khẩu; cho phép yêu cầu liên kết mới.
- **Sau:** người dùng đăng nhập lại bằng mật khẩu mới. **Nghiệm thu:** TC-49.

### UC-05 — Quản lý hồ sơ

- **Tác nhân:** Customer hoạt động. **Trước:** đã đăng nhập.
- **Dữ liệu:** họ tên và điện thoại tùy chọn; email chỉ đọc.
- **Luồng chính:** mở hồ sơ → sửa trường cho phép → kiểm tra → lưu và hiển thị lại.
- **Ngoại lệ:** email/role/status gửi thêm không được cập nhật; không được sửa hồ sơ người khác.
- **Sau:** thay đổi không sửa thông tin người nhận trong đơn/sổ địa chỉ. **Nghiệm thu:** TC-05.

### UC-06 — Quản lý sổ địa chỉ

- **Tác nhân:** Customer. **Dữ liệu:** người nhận, điện thoại, tỉnh, đơn vị cấp xã, địa chỉ chi tiết, mặc định.
- **Luồng chính:** thêm/sửa → tải lựa chọn địa giới local → đổi tỉnh thì bỏ lựa chọn cấp xã cũ → kiểm tra quan hệ → lưu; hoặc chọn mặc định/xóa địa chỉ của mình.
- **Ngoại lệ:** địa giới không tồn tại/không thuộc tỉnh, trường thiếu hoặc địa chỉ không thuộc tài khoản: từ chối. Khi địa giới đã ngừng dùng, yêu cầu chọn lại trước checkout mới; không tự đổi đơn cũ.
- **Sau:** tối đa một mặc định; địa chỉ đầu tiên mặc định; xóa mặc định chọn địa chỉ còn lại được tạo sớm nhất. **Nghiệm thu:** TC-06, TC-07.

### UC-07 — Duyệt, tìm kiếm và lọc

- **Tác nhân:** mọi người truy cập. **Kích hoạt:** mở trang chủ/catalog hoặc gửi tìm kiếm.
- **Dữ liệu:** từ khóa tên, danh mục, các cặp mã/giá trị lựa chọn SKU, giá, còn hàng, thứ tự và trang.
- **Luồng chính:** nhập/chọn điều kiện → server tìm Product công khai và SKU khớp → trả trang kết quả → URL giữ trạng thái để quay lại/chia sẻ.
- **Ngoại lệ:** không có kết quả hiển thị trạng thái rỗng và cách bỏ lọc; tham số sai báo/đưa về giá trị hợp lệ, không lỗi toàn trang.
- **Sau:** không ghi search cho mỗi ký tự; một lần thực hiện tìm kiếm là một hành vi. **Nghiệm thu:** TC-08.

### UC-08 — Xem sản phẩm và chọn SKU

- **Tác nhân:** mọi người truy cập. **Trước:** Product đang bán.
- **Dữ liệu:** lựa chọn theo tập mã của Product và số lượng, ví dụ color/size hoặc color/storage.
- **Luồng chính:** tải chi tiết/thông số → hiển thị ảnh/giá ban đầu → tự chọn nếu chỉ có một SKU đang bán; nếu nhiều SKU, chọn các giá trị theo bất kỳ thứ tự → cập nhật các tổ hợp phù hợp, ảnh và giá → khi đủ lựa chọn xác định SKU. SKU seed options rỗng không yêu cầu chọn nhãn; ảnh placeholder kèm thông báo dữ liệu minh họa.
- **Ngoại lệ:** tổ hợp không tồn tại bị vô hiệu hóa; hết hàng có nhãn và chặn mua; đổi lựa chọn khiến lựa chọn cũ vô hiệu thì bỏ lựa chọn cũ. Link tới nháp/ngừng bán trả trạng thái không còn khả dụng, không lộ nội dung nháp.
- **Sau:** xem chưa giữ hàng; chỉ ghi view khi chi tiết tải thành công. **Nghiệm thu:** TC-09, TC-45.

### UC-09 — Thêm giỏ

- **Tác nhân:** Customer đã đăng nhập. **Trước:** đã chọn SKU và số lượng nguyên dương; Guest được yêu cầu đăng nhập trước khi thêm.
- **Luồng chính:** xác định giỏ tài khoản → kiểm tra SKU đang bán và lượng cộng dồn không vượt available → thêm dòng hoặc cộng số lượng → ghi addtocart với lượng tăng → trả giỏ mới.
- **Ngoại lệ:** không đủ hàng trả lượng tối đa để điều chỉnh, không âm thầm thêm lượng khác; request gửi lại cùng định danh thao tác không cộng hai lần.
- **Sau:** không đổi tồn/reserved. **Nghiệm thu:** TC-10.

### UC-10 — Sửa số lượng hoặc xóa dòng giỏ

- **Tác nhân:** chủ giỏ. **Dữ liệu:** dòng giỏ và số lượng mới hoặc lệnh xóa.
- **Luồng chính:** kiểm tra quyền → tăng thì kiểm tra available; giảm/xóa thì chấp nhận với dòng hiện có → cập nhật giỏ → ghi event theo chênh lệch.
- **Ngoại lệ:** không đổi lựa chọn SKU bằng sửa dòng; muốn đổi biến thể phải chọn SKU khác ở chi tiết sản phẩm. Số lượng 0 không thay lệnh xóa; tăng vượt tồn bị từ chối. Dòng hết hàng/ngừng bán vẫn được xóa hoặc giảm dù không được tăng.
- **Sau:** ghi addtocart khi tăng, removefromcart khi giảm/xóa; không có event khi số lượng không đổi. **Nghiệm thu:** TC-11.

### UC-11 — Chọn dòng và xem giỏ

- **Tác nhân:** chủ giỏ. **Luồng:** tải giá/trạng thái hiện tại → hiện dòng lỗi nhưng không cho chọn mua → chọn/bỏ chọn dòng → tính tạm tính phần chọn → sang checkout.
- **Ngoại lệ:** giỏ rỗng hoặc không chọn dòng hợp lệ thì nút checkout không khả dụng. Giá thay đổi có thông báo; không giữ giá cũ.
- **Sau:** không xóa các dòng chưa chọn. **Nghiệm thu:** TC-11, TC-14.

### UC-12 — Yêu cầu đăng nhập khi thao tác với giỏ

- **Tác nhân:** Guest mở trang giỏ hoặc chọn thêm sản phẩm.
- **Luồng:** hệ thống không tạo/đọc giỏ Guest → yêu cầu đăng nhập → sau đăng nhập thành công, quay lại sản phẩm/thao tác dự định → khách xác nhận thêm sản phẩm vào giỏ tài khoản.
- **Ngoại lệ:** đăng nhập thất bại thì không thay đổi giỏ; API giỏ từ Guest bị từ chối và không tạo dữ liệu giỏ.
- **Sau:** chỉ Customer đã xác thực đọc và sửa được giỏ. **Nghiệm thu:** TC-10, TC-14.

### UC-13 — Chuẩn bị checkout và địa chỉ

- **Tác nhân:** Customer hoạt động. **Trước:** có dòng giỏ chọn mua.
- **Dữ liệu:** các dòng chọn, địa chỉ đã lưu hoặc địa chỉ mới, ghi chú và tùy chọn lưu địa chỉ.
- **Luồng:** tải tóm tắt SKU/giá → chọn/nhập địa chỉ → kiểm tra địa giới → hiển thị tiền hàng, ship 30.000đ và tổng COD.
- **Ngoại lệ:** Guest được chuyển tới đăng nhập; sau đó trở lại để kiểm tra giỏ và tiếp tục checkout. Không có địa chỉ thì yêu cầu nhập; không tự sử dụng số điện thoại hồ sơ thay người nhận.
- **Sau:** chưa tạo đơn/giữ hàng. Checkbox lưu địa chỉ mặc định tắt; nếu bật thì lưu cùng lần đặt thành công, không lặp địa chỉ khi retry. **Nghiệm thu:** TC-13, TC-14.

### UC-14 — Xác nhận đặt COD hoặc payOS

- **Tác nhân:** Customer. **Trước:** đã xem tóm tắt, chọn COD hoặc payOS và có địa chỉ hợp lệ.
- **Dữ liệu:** lựa chọn checkout, phương thức thanh toán, thông tin địa chỉ/ghi chú và định danh thao tác chống lặp; client không quyết định tổng tiền.
- **Luồng:** Order lưu checkout attempt/Saga/outbox, gửi ReserveInventory và trả 202 + checkoutId → Catalog giữ toàn bộ SKU và trả InventoryReserved/Rejected → orchestrator lưu PENDING/snapshot/expiresAt/lịch sử/giỏ, phát OrderPlaced và gửi CreatePaymentIntent cho operation PreparePayment → Payment trả intent/link/result để Order cập nhật projection → UI theo dõi checkoutId/đơn. Lưu địa chỉ nếu chọn là thao tác idempotent riêng tại Auth.
- **Ngoại lệ:** giá/giỏ đổi hoặc một dòng hết hàng: không tạo order nghiệp vụ, giữ giỏ để xác nhận lại; lỗi trước commit local thì rollback tại service đó, orchestrator phục hồi effect đã commit hoặc lưu COMPENSATING rồi gửi ReleaseInventory; chỉ kết thúc FAILED sau InventoryReleased. Cùng khóa/cùng dữ liệu trả cùng tiến trình/đơn; khác dữ liệu bị từ chối. Timeout chưa biết kết quả không tự hủy/hoàn tồn. Tạo link lỗi giữ đơn UNPAID và có thể thử lại cho chính đơn.
- **Sau:** COD bắt đầu UNPAID; payOS chỉ chuyển PAID khi webhook được xác minh. **Nghiệm thu:** TC-15, TC-16, TC-17, TC-46.

### UC-14A — Xác nhận thanh toán payOS

- **Tác nhân:** payOS gửi webhook; hệ thống xử lý. **Dữ liệu:** mã đơn payOS, số tiền, mã tham chiếu giao dịch và chữ ký.
- **Luồng:** Payment xác minh chữ ký, đối chiếu order code/tổng tiền/phương thức → lưu payment transaction/PAID/paidAt và outbox trong payment_db → phản hồi webhook sau commit → Order phản ánh kết quả rồi phát event theo dòng cho Recommendation, chống lặp bằng định danh ổn định và giữ thời điểm thanh toán gốc.
- **Ngoại lệ:** chữ ký sai hoặc order code/số tiền không khớp thì không đánh dấu PAID. Webhook đã ghi nhận được trả thành công nhưng không tạo hiệu ứng lặp. Kết quả trả tiền hợp lệ đến sau khi đơn kết thúc vẫn lưu bằng chứng tại Payment và chuyển xử lý đối soát, không tự mở lại đơn.
- **Sau:** giao diện return/cancel luôn tải trạng thái từ API; không tin query string hoặc việc khách quay lại trang để kết luận đã thanh toán. **Nghiệm thu:** TC-47, TC-48.

### UC-14B — Gửi email thông báo đơn hàng

- **Tác nhân:** hệ thống. **Kích hoạt:** tạo đơn hoặc ghi nhận thay đổi trạng thái đơn/thanh toán.
- **Luồng:** service sở hữu ghi yêu cầu email vào outbox cùng transaction nghiệp vụ → Kafka chuyển NotificationRequested trên topic email riêng đến Notification → lưu job chống lặp theo event key → worker gửi email xác nhận/thay đổi trạng thái đơn → lưu trạng thái gửi. Payload email không đi vào tracking topic/export AI.
- **Ngoại lệ:** lỗi nhà cung cấp được retry có giới hạn/backoff; không rollback đơn, payment hay tồn kho. Tránh gửi lặp cùng event key; lỗi cuối cùng phải hiện trong trạng thái vận hành/log có mã tra cứu, không chứa secret.
- **Sau:** Customer vẫn xem được trạng thái mới nhất trong tài khoản; email là kênh bổ sung. **Nghiệm thu:** TC-50.

### UC-15 — Xem đơn của Customer

- **Tác nhân:** Customer sở hữu đơn. **Luồng:** xem danh sách mới nhất trước → lọc trạng thái → mở chi tiết snapshot, tổng tiền, phương thức/trạng thái thanh toán, hạn xác nhận và lịch sử công khai.
- **Ngoại lệ:** đơn không tồn tại hoặc không thuộc khách không được tiết lộ; không trả ghi chú nội bộ. Sản phẩm gốc ngừng bán không làm mất dòng snapshot.
- **Sau:** mở lại trang tải trạng thái mới; không yêu cầu push/WebSocket. **Nghiệm thu:** TC-18.

### UC-16 — Customer hủy đơn

- **Tác nhân:** Customer sở hữu đơn. **Trước:** PENDING, UNPAID và chưa được hệ thống kết thúc vì hết hạn.
- **Luồng:** chọn hủy → xác nhận → kiểm tra trạng thái/hạn lại → chuyển CANCELLED với lý do khách hủy → giải phóng reservation → ghi lịch sử.
- **Ngoại lệ:** đã thanh toán, xác nhận, hết hạn hoặc hủy thì thông báo trạng thái hiện tại, không hoàn lần nữa. Xung đột thanh toán/xác nhận/hủy chỉ chấp nhận chuyển trạng thái hợp lệ.
- **Sau:** không tự thêm lại giỏ, không mở lại đơn; thanh toán UNPAID. **Nghiệm thu:** TC-19.

### UC-17 — Tự hủy đơn hết hạn

- **Tác nhân:** hệ thống. **Điều kiện:** PENDING, UNPAID và thời gian server >= expiresAt.
- **Luồng:** tìm đơn quá hạn → xác minh trạng thái → CANCELLED với lý do hết hạn → giải phóng reservation → ghi người thực hiện là hệ thống.
- **Ngoại lệ:** đã xác nhận/hủy thì không tác động; tác vụ chạy lại không tạo hiệu ứng lặp; khởi động lại xử lý tồn đọng. API xác nhận kiểm tra hạn độc lập với lịch chạy tác vụ.
- **Sau:** đơn CONFIRMED không bị xử lý theo hạn này. **Nghiệm thu:** TC-20.

### UC-18 — Admin xác nhận hoặc hủy trước giao

- **Tác nhân:** Admin. **Dữ liệu:** đơn, thao tác; lý do bắt buộc khi hủy.
- **Luồng:** mở chi tiết → PENDING trước hạn có thể CONFIRMED; PENDING/CONFIRMED UNPAID có thể CANCELLED → hủy giải phóng reservation → ghi lịch sử.
- **Ngoại lệ:** PENDING UNPAID đã tới hạn được xử lý như hết hạn, không xác nhận; PENDING PAYOS đã PAID vẫn có thể xác nhận. Trạng thái mới không phù hợp thì từ chối, tải lại. Không hủy trực tiếp SHIPPING.
- **Sau:** xác nhận giữ nguyên reservation; đơn xác nhận không có hạn hủy tự động. **Nghiệm thu:** TC-21.

### UC-19 — Chuyển đơn đi giao

- **Tác nhân:** Admin. **Trước:** CONFIRMED, reservation còn đầy đủ; đơn payOS phải PAID trước khi chuyển SHIPPING, đơn COD vẫn UNPAID.
- **Luồng:** chọn chuyển giao → xác nhận thao tác → giảm on hand và reserved từng dòng → SHIPPING → ghi xuất kho và lịch sử.
- **Ngoại lệ:** thiếu reservation hoặc dữ liệu không nhất quán: từ chối, không xuất một phần; retry không xuất lại.
- **Sau:** toàn bộ đơn được giao cùng lần; không nhập hãng/mã vận đơn. **Nghiệm thu:** TC-22.

### UC-20 — Giao thành công và xác nhận thanh toán

- **Tác nhân:** Admin. **Trước:** SHIPPING.
- **Luồng:** xác nhận đã giao; với COD, xác nhận đã thu đủ tiền → cập nhật PAID/paidAt và ghi transaction; với payOS, kiểm tra PAID đã xác minh rồi cập nhật DELIVERED mà không ghi transaction lần nữa → ghi lịch sử.
- **Ngoại lệ:** COD chưa thu hoặc payOS chưa PAID không đủ điều kiện hoàn tất; không hỗ trợ thanh toán một phần. Retry không thêm transaction hoặc doanh thu lần nữa.
- **Sau:** tồn không thay đổi thêm; đơn kết thúc. **Nghiệm thu:** TC-23.

### UC-21 — Giao thất bại và giao lại

- **Tác nhân:** Admin. **Dữ liệu:** lý do thất bại.
- **Luồng:** từ SHIPPING ghi thất bại → DELIVERY_FAILED và lịch sử → nếu chọn giao lại thì trở lại SHIPPING. Đơn payOS đã PAID chỉ được giao lại; không được hủy hoặc nhận hàng về kho trong phạm vi hiện tại.
- **Ngoại lệ:** thiếu lý do bị từ chối; không áp dụng cho DELIVERED/CANCELLED; giao lại không xuất kho hoặc tính thêm phí ship.
- **Sau:** hàng vẫn chưa được coi là trở về kho; COD vẫn UNPAID, payOS giữ PAID và chỉ được giao lại. **Nghiệm thu:** TC-24.

### UC-22 — Nhận hàng giao thất bại về kho

- **Tác nhân:** Admin. **Trước:** DELIVERY_FAILED, chưa nhập lại hàng của đơn; chỉ áp dụng cho đơn UNPAID.
- **Luồng:** xác nhận đã nhận toàn bộ hàng nguyên vẹn → cộng on hand từng SKU → CANCELLED với lý do giao thất bại/đã nhận lại → ghi nhập kho và lịch sử.
- **Ngoại lệ:** chưa nhận đủ thì không hoàn tất; bản demo không có luồng nhận một phần/hàng hỏng. Gửi lại chỉ trả kết quả cũ.
- **Sau:** hoàn đủ lượng một lần, không có PAID/transaction. **Nghiệm thu:** TC-25.

### UC-23 — Quản trị Product và SKU

- **Tác nhân:** Admin. **Dữ liệu:** tên, mô tả, category, thông số chung, tập mã lựa chọn của Product, options từng SKU, ảnh, giá và tồn ban đầu; mã SKU do hệ thống sinh. Brand demo chỉ đọc, không được Admin tạo/sửa/chọn từ màn hình quản lý.
- **Luồng:** tạo nháp → thêm SKU/ảnh → kiểm tra đủ điều kiện → mở bán; sau đó sửa nội dung/giá, thêm SKU hoặc ngừng bán.
- **Ngoại lệ:** trùng mã SKU/tổ hợp options đã chuẩn hóa, mã/kiểu thuộc tính sai, giá sai hoặc thiếu dữ liệu mở bán bị từ chối. SKU đang bán cùng Product phải có cùng tập mã; không trộn options rỗng với options có giá trị. SKU đã có reservation/đơn được chấp nhận không đổi options. ID nguồn seed không sửa qua form thường.
- **Sau:** chỉ ảnh hưởng bán mới; không sửa snapshot hoặc giải phóng reservation của đơn cũ khi ngừng bán. Sản phẩm/SKU đã có giao dịch không bị xóa vật lý. **Nghiệm thu:** TC-26.

### UC-24 — Quản trị Category

- **Tác nhân:** Admin. **Luồng:** thêm/sửa nhãn, chọn cha tùy chọn, cấu hình attributes/options → kiểm tra tên trùng, chu trình và dữ liệu bị ảnh hưởng → lưu; ngừng dùng khi không muốn gán mới.
- **Ngoại lệ:** cha phải hợp lệ/đang dùng, không tự trỏ hoặc tạo chu trình. Cấu hình không kế thừa từ cha; sửa cấu hình/đổi danh mục Product bị chặn nếu làm dữ liệu đang bán không hợp lệ. Mã đã dùng không đổi ý nghĩa/kiểu/đơn vị tại chỗ; đổi ngữ nghĩa cần mã mới/chuyển dữ liệu chủ động. Không có quản trị Brand hoặc module thuộc tính riêng. Category đã được Product/Category con/mapping tham chiếu không xóa; ngừng dùng không tự ngừng bán sản phẩm cũ.
- **Sau:** lọc danh mục gồm các danh mục con; admin không gán mới vào danh mục có bản thân/tổ tiên ngừng dùng. Brand metadata seed không có thao tác quản trị. **Nghiệm thu:** TC-27.

### UC-25 — Quản trị ảnh

- **Tác nhân:** Admin. **Dữ liệu:** ảnh chung Product hoặc ảnh gắn một SKU cùng Product, lựa chọn ảnh đại diện chung.
- **Luồng:** Admin upload qua Gateway → module ảnh Catalog kiểm tra và upload Cloudinary → ghi image_assets READY trong catalog_db → giải phóng buffer → trả imageAssetId → Catalog kiểm tra asset READY và ghi product_images trong transaction local. Ảnh SKU ưu tiên trước ảnh chung; browser đọc CDN, backend không giữ file gốc.
- **Ngoại lệ:** định dạng/dung lượng sai bị từ chối; không nhận đường dẫn file tùy ý; lỗi upload không tạo tham chiếu hỏng. Gỡ liên kết ảnh đang dùng phải có ảnh thay thế hoặc trạng thái hợp lệ; không xóa vật lý asset Cloudinary trong bản đầu. Timeout chưa rõ kết quả giữ PENDING để đối soát, không trả READY; retry cùng key không sinh asset mới.
- **Sau:** không làm hỏng lịch sử đơn; ảnh snapshot được giữ, UI fallback khi CDN không sẵn sàng. **Nghiệm thu:** TC-28, TC-53, TC-54.

### UC-26 — Nhập và điều chỉnh tồn

- **Tác nhân:** Admin. **Dữ liệu:** SKU, số lượng nhập hoặc số thực tế kiểm kê, lý do.
- **Luồng:** xem on hand/reserved/available → nhập điều chỉnh → kiểm tra với reserved mới nhất → lưu và ghi giá trị trước/sau cùng người/thời gian/lý do.
- **Ngoại lệ:** on hand mới < reserved hoặc giá trị âm/không nguyên: từ chối, yêu cầu xử lý đơn liên quan; không sửa trực tiếp reserved hoặc available.
- **Sau:** việc kiểm kê không tạo hành vi mua hoặc event addtocart. **Nghiệm thu:** TC-29.

### UC-27 — Tra cứu đơn và ghi chú quản trị

- **Tác nhân:** Admin. **Dữ liệu:** mã đơn, trạng thái, khoảng ngày tạo hoặc ghi chú nội bộ.
- **Luồng:** lọc danh sách → xem snapshot, thông tin người nhận, lịch sử và hạn xác nhận → thêm ghi chú → dùng các hành động hợp lệ tại UC-18 đến UC-22.
- **Ngoại lệ:** không có kết quả hiển thị rỗng; ghi chú nội bộ không trả ở API Customer; không cho sửa trực tiếp nội dung đơn.
- **Sau:** ghi chú không thay đổi trạng thái hoặc tiền. **Nghiệm thu:** TC-30.

### UC-28 — Khóa và mở Customer

- **Tác nhân:** Admin. **Dữ liệu:** Customer và lý do khi khóa.
- **Luồng:** tìm theo tên/email → xem hồ sơ/trạng thái → khóa hoặc mở → ghi lịch sử quản trị; khóa vô hiệu hóa quyền sử dụng phiên tài khoản hiện có.
- **Ngoại lệ:** không áp dụng cho tài khoản Admin; không có đổi role/reset mật khẩu trong màn hình này.
- **Sau:** đơn đã có vẫn được xử lý; mở lại cho phép đăng nhập mới, không hồi sinh token/phiên đã thu hồi. **Nghiệm thu:** TC-31.

### UC-29 — Xem dashboard

- **Tác nhân:** Admin. **Dữ liệu:** khoảng ngày, mặc định hôm nay theo múi giờ hiển thị.
- **Luồng:** tính đơn mới theo createdAt, số đơn hiện chờ riêng, số kết quả hủy/thất bại và tiền thu theo paidAt → hiển thị tiền hàng/phí ship riêng, SKU sắp hết hàng.
- **Ngoại lệ:** khoảng ngày không hợp lệ bị từ chối; chưa có dữ liệu hiển thị 0, không giả lập số liệu. Giao thất bại đếm theo đơn có lần thất bại trong kỳ, không cộng nhiều lần retry thành nhiều đơn.
- **Sau:** không gọi tổng thu là lợi nhuận; ngưỡng sắp hết hàng là cấu hình. **Nghiệm thu:** TC-32.

### UC-30 — Ghi hành vi frontend và nhận diện phiên

- **Tác nhân:** Guest/Customer thông qua frontend. **Dữ liệu:** event ID/type/thời điểm, product/SKU khi phù hợp, ngữ cảnh gợi ý.
- **Luồng:** phát sinh hành vi đủ điều kiện → gửi backend → backend kiểm tra loại/trường, gắn nhận diện và receivedAt → lưu; retry dùng cùng event ID.
- **Ngoại lệ:** client không được ghi transaction/order_created hoặc tự chọn user của người khác; lỗi tracking không chặn trang. Khi session không hoạt động 30 phút, tạo tracking session mới; trạng thái đăng nhập và giỏ tài khoản không bị thay đổi.
- **Sau:** đăng nhập chỉ liên kết phiên Guest hiện tại một cách có kiểm soát; logout tách ngữ cảnh, không gán lại event cũ của tài khoản khác. **Nghiệm thu:** TC-33, TC-35.

### UC-31 — Ghi event nghiệp vụ

- **Tác nhân:** backend từ các luồng giỏ/đơn. **Trước:** nghiệp vụ được chấp nhận.
- **Luồng:** service sở hữu ghi business outbox với actor do server xác định cùng transaction dữ liệu chính → relay phát Kafka → Recommendation lưu event và inbox trong transaction của mình.
- **Ngoại lệ:** rollback thì không còn event thành công; retry không nhân đôi; seed và thao tác quản trị không giả làm hành vi mua của khách.
- **Sau:** order_created ở lúc đặt; transaction lúc xác nhận thu COD hoặc nhận webhook payOS thành công; mỗi dòng transaction có quantity và ID đơn/dòng. **Nghiệm thu:** TC-34.

### UC-32 — Hiển thị và tương tác gợi ý theo quy tắc

- **Tác nhân:** Guest/Customer. **Dữ liệu:** vị trí trang, sản phẩm hiện tại hoặc giỏ.
- **Luồng:** server chọn sản phẩm hợp lệ cùng danh mục hoặc được quan tâm → trả request ID và nguồn rule_based → frontend hiển thị nhãn đúng → ghi impression khi đủ điều kiện, click gắn request/vị trí.
- **Ngoại lệ:** không đủ ứng viên trả ít hơn; không có thì ẩn khối; lỗi gợi ý không chặn catalog/checkout. Không thêm sản phẩm hết hàng chỉ để đủ số lượng.
- **Sau:** không tuyên bố đã có model GNN hoặc dùng metadata synthetic làm bằng chứng ngữ nghĩa AI. **Nghiệm thu:** TC-36.

### UC-33 — Chuẩn bị dữ liệu demo, địa giới và chạy local

- **Tác nhân:** người phát triển, không phải endpoint công khai. **Đầu vào:** ba CSV từ notebook Build, manifest/version/checksum, placeholder đã upload CDN, snapshot địa giới và cấu hình local. Tái dựng CSV mới cần ba parquet clean.
- **Luồng:** kiểm tra artifact/schema/quota/tham chiếu → kiểm tra/upload ảnh CDN → migration → seed danh mục/mapping/Product/SKU có version → tạo tài khoản demo → chạy service → kiểm tra 500 Product, 23 danh mục, 500 SKU mặc định và địa giới → restart kiểm tra bền vững.
- **Ngoại lệ:** thiếu CSV/manifest/ảnh, trùng ID, sai checksum hoặc mapping thì dừng trước ghi catalog; lỗi ghi rollback cả lô. Seed lại không nhân đôi, tự reset hoặc ghi đè chỉnh sửa Admin. Placeholder đúng danh mục và truy cập được qua CDN là ảnh hợp lệ; CDN lỗi có fallback UI, không coi ảnh đã sẵn sàng khi upload chưa thành công.
- **Sau:** có hướng dẫn tái lập và export hành vi không chứa dữ liệu liên hệ. **Nghiệm thu:** TC-37, TC-38, TC-39, TC-42, TC-43, TC-44, TC-45.

<a id="states"></a>
## 5. Trạng thái và quy tắc xử lý

### 5.1. Trạng thái Product và SKU

| Đối tượng | Trạng thái/điều kiện | Hành vi |
|---|---|---|
| Product | DRAFT | Chỉ Admin xem/sửa; được phép thiếu nội dung đang chuẩn bị |
| Product | ACTIVE | Công khai khi đủ tên, category đang dùng, ảnh và ít nhất một SKU hợp lệ đang mở bán |
| Product | INACTIVE | Không xuất hiện catalog và không nhận thêm giỏ/đơn; đơn đã có vẫn xử lý |
| SKU | Đang bán, available > 0 | Có thể chọn mua trong giới hạn available |
| SKU | Đang bán, available = 0 | Hiển thị hết hàng; không thêm mới/checkout |
| SKU | Ngừng bán | Không nhận thêm mua mới; không tự hủy đơn đã giữ SKU này |

Hết hàng là điều kiện suy ra từ tồn, không phải một trạng thái phải sửa thủ công. Product ACTIVE có tất cả SKU hết hàng vẫn xuất hiện công khai với nhãn hết hàng. Không được chuyển Product sang ACTIVE nếu không còn SKU nào được phép bán.

### 5.2. Bảng chuyển trạng thái đơn

| Từ | Hành động | Ai được thực hiện | Điều kiện | Sang | Tác động tồn/thanh toán |
|---|---|---|---|---|---|
| Chưa có đơn | Đặt COD hoặc payOS | Customer | Mọi kiểm tra checkout hợp lệ | PENDING | Reserved +q; UNPAID; tạo payment link nếu payOS |
| PENDING/CONFIRMED | Webhook payOS thành công | Backend | Chữ ký hợp lệ; đúng mã đơn, số tiền và payment method; chưa PAID | Giữ nguyên order status | PAID; paidAt; transaction đúng một lần |
| PENDING | Xác nhận | Admin | UNPAID: thời gian server < expiresAt; PAYOS PAID: không hết hạn | CONFIRMED | Không đổi |
| PENDING | Hủy trước hạn | Chủ đơn/Admin | UNPAID; đơn chưa thay trạng thái; Admin có lý do | CANCELLED | Reserved −q |
| PENDING | Hết hạn | Hệ thống | UNPAID và thời gian server >= expiresAt | CANCELLED | Reserved −q; lý do EXPIRED |
| CONFIRMED | Hủy | Admin | UNPAID, có lý do, chưa giao | CANCELLED | Reserved −q |
| CONFIRMED | Chuyển giao | Admin | Reservation đầy đủ | SHIPPING | On hand −q, Reserved −q |
| SHIPPING | Giao và thu COD | Admin | Phương thức COD; xác nhận giao và thu tiền | DELIVERED | PAID; paidAt; transaction |
| SHIPPING | Giao thành công | Admin | Phương thức payOS; payment đã PAID | DELIVERED | Giữ PAID; không ghi transaction trùng |
| SHIPPING | Giao thất bại | Admin | Có lý do | DELIVERY_FAILED | Không hoàn tồn; trạng thái thanh toán không đổi |
| DELIVERY_FAILED | Giao lại | Admin | Chưa xác nhận hàng về | SHIPPING | Không xuất lần nữa |
| DELIVERY_FAILED | Đã nhận đủ hàng về | Admin | UNPAID; xác nhận hàng nguyên vẹn | CANCELLED | On hand +q, đúng một lần |

Không có các chuyển trạng thái khác. DELIVERED/CANCELLED kết thúc. PENDING/CONFIRMED đã PAID không được hủy trong phạm vi này; nếu giao thất bại thì chỉ hỗ trợ giao lại. SRS dùng một trạng thái CANCELLED kèm lý do để phân biệt khách hủy, Admin hủy, hết hạn hoặc hàng COD giao thất bại đã quay về.

### 5.3. Bất biến tồn và tính nguyên tử

- Mỗi SKU có onHand >= 0, reserved >= 0, reserved <= onHand; available được tính, không nhập trực tiếp.
- Catalog đối soát reserved bằng reservation_items còn HELD trong catalog_db; có thể gồm checkout đang tạo đơn và operation đang chờ hoàn tất. Reconciler đối chiếu với Order qua hợp đồng giao tiếp.
- Catalog giữ tất cả SKU của một checkout trong cùng transaction catalog_db; Order tạo đơn sau kết quả reserve thành công, không có transaction chung giữa service.
- Hủy/xuất giao/nhập trả được ghi nhận theo đơn/dòng và không thể chạy hiệu ứng lần thứ hai.
- Admin điều chỉnh onHand phải kiểm tra reserved tại lúc cập nhật, không chỉ giá trị lúc mở màn hình.
- Đơn PENDING UNPAID hết hạn nhưng chưa được tác vụ xử lý vẫn chưa giải phóng available; cần xử lý hủy để cập nhật nhất quán. Mọi API xác nhận đơn UNPAID kiểm tra expiresAt; PENDING PAYOS đã PAID không hết hạn.
- Hệ thống xử lý thao tác tranh chấp bằng operation/version và kiểm tra Payment trước hủy, không dựa vào projection trễ. Tiền đến muộn sau khi đơn đã kết thúc phải được Payment lưu để đối soát REVIEW_REQUIRED; không tự mở lại đơn hoặc refund. Không được âm tồn hay vừa hủy vừa giao.

### 5.4. Giỏ, giá và idempotency

- Giỏ dùng giá hiện tại của SKU; đơn dùng giá snapshot. Thay giá trong catalog không cập nhật đơn cũ.
- Checkout cần phát hiện thay đổi giỏ hoặc giá so với tóm tắt vừa xác nhận; dữ liệu đối chiếu do server kiểm soát, không tin giá client khai.
- Request lặp dùng cùng định danh thao tác và cùng dữ liệu trả kết quả cũ. Dùng lại định danh với dữ liệu khác bị từ chối.
- Áp dụng chống hiệu ứng lặp cho tạo đơn, cộng giỏ và các chuyển trạng thái có ảnh hưởng tồn/event.
- Khi không biết request trước đã thành công hay chưa, UI thử lại cùng định danh hoặc tra kết quả; không tự phát sinh đơn mới.
- Giá và quantity trong giỏ được đánh giá lại khi đọc giỏ và trước checkout; không giữ giá cũ.

### 5.5. Địa chỉ và snapshot

Đơn lưu tên người nhận, điện thoại, mã/tên tỉnh, mã/tên đơn vị cấp xã, địa chỉ chi tiết, tiền hàng, phí ship và từng dòng tên/mã SKU/giá/số lượng dưới các cột riêng. Riêng options_snapshot là JSONB chứa mã lựa chọn → `{label, value}` tại lúc Catalog reserve; SKU không có lựa chọn dùng `{}`. Order dùng snapshot đã được Catalog xác nhận, không nhận nhãn/giá tùy ý từ client. Thay đổi cấu hình thuộc tính, catalog hoặc sổ địa chỉ không làm đổi đơn cũ; không chụp toàn bộ Product vào một JSONB.

Địa chỉ đã lưu có mã địa giới không còn hoạt động phải được khách kiểm tra và cập nhật trước lần mua mới. Không tự thay địa giới trong các đơn đã đặt. Các mã địa giới và ID nguồn dataset được biểu diễn như định danh, không dùng tính toán số học hoặc làm mất số 0 đầu.

### 5.6. Chuẩn event và nguồn ghi

| Event | Nguồn tin cậy | Khi ghi | Ngữ cảnh |
|---|---|---|---|
| view | Frontend, server kiểm tra | Chi tiết tải thành công | Product; chọn lại lựa chọn SKU không tạo view mới |
| search | Frontend | Người dùng gửi từ khóa tìm kiếm | Query giới hạn độ dài; không ghi mỗi ký tự hoặc chỉ đổi bộ lọc |
| addtocart | Backend | Thêm/tăng số lượng thành công | Product, SKU, quantity tăng |
| removefromcart | Backend | Giảm/xóa thành công | Product, SKU, quantity giảm |
| order_created | Backend | Đơn mới được commit | Order và danh sách dòng qua liên kết order |
| transaction | Backend | COD: Admin xác nhận thu tiền khi giao; payOS: webhook thanh toán hợp lệ | Một event mỗi dòng đơn với quantity, Order/OrderItem/Product/SKU; chỉ ghi một lần tại thời điểm thanh toán |
| recommendation_impression | Frontend | Ít nhất 50% thẻ trong vùng nhìn liên tục >= 1 giây | request ID, Product, vị trí; một lần/thẻ/request trong cùng lần hiển thị |
| recommendation_click | Frontend | Chọn thẻ gợi ý | request ID, Product, vị trí, nguồn gợi ý |

Mọi event có event ID, loại, occurredAt, receivedAt và các định danh visitor/session/user phù hợp do server xác định. Trường không liên quan để trống; không ép search thành event gắn một item giả. Với transaction, user là Customer của đơn, visitor/session có thể để trống; Admin thao tác nằm trong lịch sử đơn. Có thể nối về order_created bằng order ID, không gán phiên Admin thành phiên mua hàng của khách. Backend không nhận transaction/order_created/addtocart giả từ endpoint tracking công khai; payOS chỉ được xác nhận bằng webhook có chữ ký hợp lệ.

Tracking session hết sau 30 phút không hoạt động. Event cũ không bị ghi đè user ID khi đăng nhập. Liên kết có kiểm soát chỉ áp dụng với phiên Guest hiện tại; logout tạo ngữ cảnh mới để không trộn hai tài khoản dùng chung trình duyệt.

Client retry giữ event ID; thao tác mới thực sự tạo ID mới. Không khử trùng toàn bộ các lần cùng một người xem cùng sản phẩm. Seed và replay phục vụ thử nghiệm phải được đánh dấu/tách khỏi dữ liệu website thật và dashboard hành vi.

### 5.7. Gợi ý và số liệu

- Trang chi tiết ưu tiên sản phẩm khác cùng danh mục; giỏ ưu tiên cùng danh mục với sản phẩm trong giỏ và loại các Product đã có trong giỏ; trang chủ dùng mức độ quan tâm trên website.
- Quy tắc tạm thời xếp theo số visitor có view khác nhau trong 7 ngày gần nhất; khi chưa có tín hiệu dùng Product mới nhất, hòa thì ID ổn định. Nếu dùng fallback mới nhất, nhãn khối phản ánh “Sản phẩm mới” thay vì khẳng định đang được quan tâm. Không dùng sự phổ biến RetailRocket để giả làm tương tác thực của website.
- Sản phẩm có ít nhất một SKU bán được mới đủ điều kiện gợi ý. Không đủ ứng viên trả ít hơn; không có thì ẩn khối.
- Backend tạo request ID và ghi nguồn rule_based, vị trí, danh sách có thứ tự và phiên bản quy tắc để đối chiếu impression/click. Không bắt buộc danh sách thay đổi sau mỗi thao tác.
- Đơn mới đếm theo createdAt trong khoảng chọn; tiền hàng/phí ship đã thu theo paidAt; đơn chờ là số hiện tại, nhãn không nhầm với số tạo trong kỳ.
- Hủy đếm theo thời điểm chuyển CANCELLED, có phân loại lý do. Giao thất bại đếm số đơn khác nhau có lần thất bại trong kỳ. Không dùng số lần thử giao lại làm số đơn.

<a id="data-ui"></a>
## 6. Dữ liệu và màn hình

### 6.1. Mô hình thông tin ở mức nghiệp vụ

| Nhóm | Nội dung cần lưu |
|---|---|
| User/Session | Danh tính, role, trạng thái, hash mật khẩu, phiên/thu hồi; không lưu mật khẩu rõ |
| Address/Location | Chủ địa chỉ, người nhận, thông tin địa giới local và phiên bản dữ liệu |
| Product | Nội dung synthetic, attributes, variant_option_keys, trạng thái, category, brand metadata chỉ đọc nếu có, ID nguồn, phiên bản seed và thống kê lịch sử |
| Category | Danh mục cha–con không chu trình; attribute_config cho thông số và lựa chọn SKU; cấu hình không kế thừa |
| Catalog dataset / Category mapping | Version/checksum, danh mục seed gắn root, mapping category RetailRocket về root và danh mục seed |
| Variant | Mã SKU tự sinh, options JSONB và khóa tổ hợp chuẩn hóa chống trùng; giá và tồn riêng; SKU mặc định options rỗng |
| Ảnh | Catalog sở hữu image_assets, Cloudinary adapter và product_images trong catalog_db; Order lưu snapshot asset/key/version/URL |
| Cart | Customer sở hữu giỏ, các dòng SKU/quantity và phiên bản thay đổi |
| Order/OrderItem | Mã đơn hiển thị, chủ đơn, trạng thái/thanh toán, snapshot, hạn, paidAt |
| Reservation/Inventory history | Catalog lưu reservation/chi tiết theo checkout, snapshot SKU và ledger; tổng reserved đối soát với reservation HELD, gồm checkout đang xử lý |
| Order history/Admin audit | Chuyển trạng thái và ghi chú nội bộ tách biệt; khóa/mở tài khoản, điều chỉnh tồn |
| Interaction/Recommendation | Event và ngữ cảnh, liên kết phiên, request gợi ý/danh sách thứ tự/nguồn |

Đây là mô hình thông tin, không áp đặt tên bảng vật lý hoặc câu lệnh SQL. Giữ địa chỉ, thông tin đơn và nội dung nguồn cần thiết ngay cả khi tài nguyên master thay đổi.

### 6.2. Trường nhập và kiểm tra

Các giới hạn độ dài/dung lượng dưới đây là **mặc định đặc tả để triển khai**, không phải tính năng nghiệp vụ được mở rộng. Nếu điều chỉnh, cập nhật tài liệu và kiểm thử tương ứng. Chuỗi văn bản được trim, ngoại trừ mật khẩu không được sửa tự động.

| Dữ liệu | Bắt buộc | Kiểm tra/phản hồi |
|---|---|---|
| Họ tên hồ sơ/người nhận | Có | 1–100 ký tự sau trim; cho phép Unicode và khoảng trắng |
| Email đăng ký/đăng nhập | Có | Tối đa 254 ký tự; định dạng email; trim và chuẩn hóa không phân biệt hoa/thường; không bỏ dấu chấm hoặc phần +tag |
| Mật khẩu | Có | Tối thiểu 8 ký tự; tối đa 72 byte UTF-8 để phù hợp bcrypt; không trim/cắt; kiểm tra trùng xác nhận |
| Điện thoại hồ sơ | Không | Nếu có, áp dụng quy tắc định dạng như điện thoại nhận hàng |
| Điện thoại nhận hàng | Có | Bỏ khoảng trắng/dấu gạch nối; chấp nhận dấu + ở đầu và 10–15 chữ số; chỉ kiểm tra định dạng, không xác minh sở hữu |
| Tỉnh/đơn vị cấp xã | Có khi giao hàng | Mã có trong snapshot và quan hệ cha–con hợp lệ; đơn vị còn hoạt động cho địa chỉ mua mới |
| Địa chỉ chi tiết | Có | 1–300 ký tự; cho phép số nhà, đường, căn hộ, thôn/tổ |
| Tên Product | Có khi mở bán | 1–200 ký tự; tên có thể trùng nhưng ID/slug phân biệt |
| Mô tả | Có khi mở bán | 1–5.000 ký tự văn bản; không thực thi HTML/script người nhập |
| Category | Có khi mở bán | Một giá trị; parent_id tùy chọn, không chu trình; không gán mới nếu danh mục/tổ tiên ngừng dùng |
| Brand | Không | Metadata seed chỉ đọc nếu có; Admin không tạo, sửa hoặc chọn Brand trong form quản trị |
| Cấu hình thuộc tính Category | Object, mặc định `{}` | Hai nhóm attributes/options theo mã ổn định `[a-z][a-z0-9_]{0,31}`; nhãn 1–100 ký tự; tối đa 30 thông số và 5 lựa chọn; không kế thừa từ cha |
| Attributes của Product | Object, mặc định `{}` | Mã thuộc nhóm attributes của danh mục; kiểu string/number/boolean theo cấu hình; string 1–200 ký tự, số hữu hạn, không null/object/array; tối đa 30 trường và 16 KiB UTF-8; đơn vị lấy từ cấu hình |
| Tập mã lựa chọn Product | Array, mặc định `[]` | Tối đa 5 mã khác nhau thuộc nhóm options của danh mục, không trùng mã đang dùng trong attributes; tất cả SKU đang bán có đúng tập mã này |
| Options của SKU | Object, mặc định `{}` | Mã → chuỗi 1–100 ký tự; trim/NFC/gộp khoảng trắng; so trùng không phân biệt hoa/thường nhưng giữ dấu; không tự đồng nhất Đen/Black hoặc đơn vị; khóa tổ hợp chuẩn hóa tối đa 1.500 byte; SKU không có lựa chọn dùng `{}` |
| Mã SKU | Hệ thống sinh | Tối đa 64 ký tự, ví dụ NX-SKU-000001; dùng sequence, duy nhất toàn catalog, bất biến từ lúc tạo và không tái sử dụng |
| Giá SKU | Có | Số nguyên VND > 0; không chấp nhận float/âm/NaN; server kiểm tra tổng tiền nằm trong miền lưu trữ chính xác |
| Số lượng giỏ | Có | Số nguyên > 0; không vượt available khi tăng/đặt; không đặt thêm giới hạn thương mại theo SKU ngoài tồn |
| Tồn ban đầu/kiểm kê | Có | Số nguyên >= 0 và on hand mới >= reserved |
| Ảnh upload | Có ít nhất một ảnh khi mở bán | JPEG/PNG/WebP, <= 5 MiB/file; kiểm tra nội dung ảnh, không chỉ phần mở rộng |
| Ghi chú khách/nội bộ | Không | Tối đa 1.000 ký tự; tách quyền xem |
| Lý do hủy Admin/giao thất bại/khóa/điều chỉnh tồn | Có | 1–500 ký tự; mã lý do hệ thống dùng cho tự hết hạn |
| Từ khóa tìm kiếm | Không | Tối đa 100 ký tự; rỗng tương đương duyệt catalog |

### 6.3. Tìm kiếm, phân trang và mặc định hiển thị

- Tìm theo chuỗi con trong tên Product, không phân biệt hoa/thường và dấu tiếng Việt; chưa có tìm gần đúng, sửa lỗi chính tả hoặc autocomplete.
- Catalog mặc định 24 Product/trang, mới nhất trước; thay bộ lọc đưa về trang đầu. Chọn nhiều giá trị áp dụng OR trong cùng mã lựa chọn, AND giữa các mã; tất cả lựa chọn/giá/còn hàng phải khớp cùng một SKU. So khớp giá trị theo cùng chuẩn hóa dùng chống trùng SKU.
- Chọn danh mục bao gồm sản phẩm gắn trực tiếp và thuộc mọi danh mục con. Bộ lọc lựa chọn lấy từ SKU đang bán của Product công khai trong phạm vi danh mục; nhãn lấy từ cấu hình, chỉ gộp cùng mã khi cùng ý nghĩa. Khi duyệt toàn cửa hàng chỉ hiện các mã được cấu hình nhất quán; mã riêng ngành chỉ hiện khi chọn danh mục phù hợp. Nếu cấu hình mã khác nhau trong phạm vi lọc, ẩn facet mơ hồ và API từ chối mã đó, yêu cầu chọn danh mục cụ thể hơn. Giữ lựa chọn hợp lệ hiện tại ngay cả khi kết quả rỗng để khách bỏ lọc. Chưa lọc attributes Product hoặc khoảng số/đổi đơn vị trên options.
- Product seed có attributes `{}`, variant_option_keys `[]` và một SKU options `{}`; UI tự chọn SKU, không hiện lựa chọn “Mặc định”. Ảnh seed là ảnh chung variant_id NULL. Nếu chuyển sang nhiều biến thể, ngừng bán SKU mặc định và tạo tồn riêng cho SKU mới qua nghiệp vụ kho, không nhân stock cũ.
- Catalog có thông báo “Dữ liệu sản phẩm minh họa”; tên/danh mục tiếng Anh của CSV được giữ nguyên. Ảnh placeholder không được diễn đạt như ảnh chụp hàng thật.
- Giá thẻ là giá thấp nhất của SKU đang mở bán khớp bộ lọc; có chênh lệch thì ghi “Từ”. Nếu bật còn hàng, chỉ tính SKU còn hàng. Không có bộ lọc thì xét các SKU đang mở bán.
- Danh sách đơn/quản trị mặc định 20 dòng/trang, mới nhất trước. Các API danh sách áp dụng giới hạn trang hợp lý phía server; không tải toàn bộ lịch sử một lần.
- Dashboard mặc định hôm nay; ngưỡng SKU sắp hết hàng mặc định available <= 5, phân biệt nhãn available = 0.
- Khi một danh sách rỗng phải hiển thị thông báo và hành động phù hợp, không dựng dữ liệu giả.

### 6.4. Danh sách màn hình

| Màn hình | Nội dung và hành động | Yêu cầu trạng thái |
|---|---|---|
| Trang chủ/catalog | Danh mục, tìm/lọc/sort, thẻ Product, gợi ý | Loading, rỗng, lỗi tải, hết hàng |
| Chi tiết Product | Ảnh chung/ảnh SKU, mô tả, thông số, chọn các lựa chọn SKU, quantity, thêm giỏ | Chưa chọn đủ, tổ hợp không có, hết hàng, không còn khả dụng |
| Đăng ký/đăng nhập/khôi phục mật khẩu | Form, lỗi theo trường, quay về trang hợp lệ, gửi lại email khôi phục | Đang gửi, email trùng, sai thông tin, tài khoản khóa, liên kết reset hết hạn/đã dùng |
| Hồ sơ/đổi mật khẩu | Các trường được phép; email chỉ đọc | Lưu thành công/thất bại, yêu cầu đăng nhập lại |
| Sổ địa chỉ | Danh sách, mặc định, thêm/sửa/xóa, dropdown địa giới | Chưa có địa chỉ, mã đã ngừng dùng, quan hệ không hợp lệ |
| Giỏ | SKU, ảnh, giá, quantity, chọn dòng, xóa, tạm tính | Chưa đăng nhập, giá đổi, thiếu hàng, ngừng bán, giỏ rỗng |
| Checkout | Dòng chọn, địa chỉ, phương thức COD/payOS, lưu địa chỉ tùy chọn, ghi chú, tổng phải trả | Chưa đăng nhập, giỏ/giá đổi, không đủ hàng, chưa biết kết quả gửi trước |
| Đặt thành công | Mã đơn, phương thức/trạng thái thanh toán, hạn xác nhận; URL thanh toán nếu payOS | Không hiển thị đã thanh toán trước khi backend xác minh webhook |
| Đơn Customer | Danh sách, chi tiết snapshot, lịch sử, hủy khi hợp lệ | Rỗng, không được xem, trạng thái đã thay đổi |
| Admin catalog | Form nháp/mở bán/ngừng bán, thông số Product, options SKU, ảnh, danh mục cha–con và cấu hình ngay trong danh mục | Thiếu dữ liệu mở bán, thuộc tính sai, trùng tổ hợp SKU, chu trình, tài nguyên đang được tham chiếu |
| Admin tồn | On hand/reserved/available, nhập/kiểm kê/lịch sử | Không đủ hàng chưa giữ, xung đột khi lưu |
| Admin đơn | Tìm/lọc, snapshot, thời hạn, ghi chú, nút theo trạng thái | Lý do bắt buộc, xác nhận tác động, trạng thái cũ bị từ chối |
| Admin Customer | Tìm tên/email, trạng thái, khóa/mở | Xác nhận khóa, không hỗ trợ reset mật khẩu thay khách hoặc đổi role |
| Email | Mẫu khôi phục mật khẩu/xác nhận đơn/thay đổi trạng thái; trạng thái gửi | Đang chờ, đã gửi, thử lại, gửi thất bại; không lộ token trong log |
| Dashboard | Số đơn và doanh thu theo định nghĩa, SKU sắp hết | Kỳ rỗng, khoảng ngày sai, không có quyền |

Form báo lỗi cụ thể và giữ dữ liệu phù hợp để sửa. Nút đang xử lý chống bấm lặp là biện pháp UI, không thay thế kiểm tra chống trùng ở backend. Các hành động hủy/xuất giao/xác nhận thu tiền/nhận hàng về/khóa tài khoản cần bước xác nhận rõ.

<a id="non-functional"></a>
## 7. Yêu cầu phi chức năng

| Mã | Yêu cầu | Cách kiểm chứng |
|---|---|---|
| NFR-01 | Xác thực và phân quyền tại backend; kiểm tra trạng thái khóa và quyền sở hữu; không chỉ ẩn nút UI | Gọi API bằng Guest/Customer/Admin và thay ID tài nguyên |
| NFR-02 | Mật khẩu băm bcrypt, không trả hash/token bí mật trong dữ liệu/log; access token bộ nhớ frontend, refresh token cookie HttpOnly xoay vòng và lưu bản băm | Kiểm tra response/storage, logout/đổi mật khẩu/refresh; từ chối replay phiên đã thu hồi |
| NFR-03 | Transaction local, business outbox/inbox và Saga bảo vệ đơn/tồn/giỏ/payment; tiến trình trung gian bền vững, phục hồi sau restart | Gây lỗi trước/sau commit, duplicate message và request xung đột; hoàn tất hoặc bù đúng, không mất tiến trình |
| NFR-04 | Dữ liệu và ảnh còn sau restart; không tự migrate phá hủy hoặc seed reset khi start | Restart container, so sánh đơn/tồn/ảnh, chạy seed lại |
| NFR-05 | Giao diện tiếng Việt dùng được ở desktop và viewport điện thoại, có nhãn form, keyboard focus và trạng thái lỗi rõ | Kiểm tra tối thiểu viewport 390px và 1366px, Chrome/Edge trên môi trường local |
| NFR-06 | Lỗi tracking frontend/gợi ý không chặn mua; service sở hữu ghi business outbox cùng dữ liệu chính, lỗi ghi outbox rollback local. Kafka/consumer tạm dừng giữ dữ liệu để phát/xử lý lại | Ngắt tracking/gợi ý/Kafka; lỗi ghi outbox và khôi phục consumer không làm mất hoặc nhân đôi nghiệp vụ |
| NFR-07 | COD không phụ thuộc payOS; luồng payOS cần credentials backend và kết nối provider; email cần cấu hình nhà cung cấp, không phụ thuộc AI hoặc dịch vụ vận chuyển | Kiểm tra COD khi payOS ngoài mạng; payOS và email với cấu hình provider hợp lệ |
| NFR-08 | Thời gian server là nguồn cho hạn đơn; lưu UTC, hiển thị Asia/Ho_Chi_Minh; có xử lý bù đơn hết hạn | Thay đồng hồ client; mô phỏng backend dừng qua hạn; kiểm tra mốc ngày dashboard |
| NFR-09 | Event/export không chứa token, mật khẩu, email, điện thoại hoặc địa chỉ nhận hàng; ghi chú nội bộ không lộ sang Customer | Kiểm tra event/export và response Customer |
| NFR-10 | Chỉ cam kết demo một người; vẫn có chống tranh chấp dữ liệu và trạng thái loading/error | Chạy hành trình một người; kiểm tra hai request tranh cùng SKU như kiểm thử toàn vẹn, không phải load test |
| NFR-11 | Cấu hình/secret ngoài source, validation server, kiểm tra origin/CSRF cho mutation dựa cookie; hạn chế thử đăng nhập lặp; upload ảnh có kiểm tra | Kiểm tra cấu hình và test yêu cầu không hợp lệ/origin sai/đăng nhập lặp/upload không phải ảnh |
| NFR-12 | Có request ID và log lỗi chẩn đoán không chứa dữ liệu bí mật; lịch sử nghiệp vụ có người/thời gian/lý do | Đối chiếu thao tác với log và lịch sử đơn/tồn |
| NFR-13 | payOS secret chỉ ở cấu hình backend; webhook xác minh chữ ký và chống replay/ghi nhận trùng | Secret không xuất hiện ở bundle frontend/log; giả chữ ký, amount/orderCode sai và webhook lặp không tạo PAID giả hoặc transaction trùng |
| NFR-14 | Auth chỉ lưu hash token reset một lần/hạn 30 phút; Notification mã hóa payload gửi token khi cần lưu job và xóa khi gửi xong/hết hạn; phản hồi không cho dò email; provider secret ngoài source/log | Kiểm tra token hết hạn/replay, phản hồi với email có/không có tài khoản và log/cấu hình |
| NFR-15 | Năm service NestJS có ownership riêng; Catalog sở hữu upload/metadata ảnh, Order điều phối Saga bền vững. Recommendation sẽ là Python/FastAPI độc lập ở giai đoạn sau. Kafka, ES/Redis và CI bổ sung sau Docker/PostgreSQL | Kiểm tra ownership, Compose/build; nghiệm thu Saga/recovery/search/cache khi các thành phần được triển khai |

Không đặt SLA production hoặc chỉ tiêu tải đồng thời. Khi nghiệm thu ghi lại cấu hình máy và các vấn đề phản hồi quan sát được; trang không được treo vô hạn mà thiếu thông báo lỗi/thử lại. Chu kỳ xử lý nền và timeout kỹ thuật được cấu hình trong thiết kế, trong khi việc chặn xác nhận sau expiresAt là yêu cầu bắt buộc độc lập.

<a id="interfaces"></a>
## 8. API và giao diện tích hợp

### 8.1. API tóm tắt

Prefix dự kiến `/api/v1`. Bảng dưới chỉ định thao tác và quyền; kiểu trường JSON, mã HTTP chi tiết và DTO thuộc tài liệu API/OpenAPI lúc triển khai. Các API luôn có kiểm tra server, không tin user/role/giá/stock từ client.

| Phương thức và đường dẫn | Chức năng | Quyền |
|---|---|---|
| POST /auth/register | Tạo Customer | Guest |
| POST /auth/login | Đăng nhập và thiết lập phiên | Guest |
| POST /auth/refresh | Gia hạn phiên theo refresh token hợp lệ | Chủ phiên |
| POST /auth/logout | Thu hồi phiên hiện tại | Chủ phiên; xử lý được phiên đã hết |
| POST /auth/change-password | Đổi mật khẩu, thu hồi mọi phiên | Customer/Admin hoạt động |
| POST /auth/password-reset-requests | Yêu cầu email khôi phục; phản hồi chung | Công khai, giới hạn tần suất |
| POST /auth/password-resets | Đặt mật khẩu mới bằng token một lần | Công khai, token hợp lệ |
| GET, PATCH /me | Xem/sửa trường hồ sơ cho phép | Chủ tài khoản |
| GET, POST /me/addresses | Xem/thêm địa chỉ | Customer |
| PATCH, DELETE /me/addresses/:id | Sửa/xóa địa chỉ | Chủ địa chỉ |
| PUT /me/addresses/:id/default | Đặt mặc định | Chủ địa chỉ |
| GET /products, /products/:id | Catalog và chi tiết | Công khai, chỉ dữ liệu được phép bán/hiển thị |
| GET /catalog/options | Cây danh mục và facet mã/nhãn/giá trị options theo categoryId/ngữ cảnh lọc; không có tùy chọn/API quản trị Brand | Công khai |
| GET /locations/provinces | Tỉnh/thành từ snapshot | Công khai |
| GET /locations/provinces/:code/wards | Các đơn vị cấp xã trực thuộc | Công khai |
| GET /cart | Đọc giỏ | Customer hoạt động |
| POST /cart/items | Thêm/cộng SKU | Customer hoạt động |
| PATCH, DELETE /cart/items/:id | Sửa quantity/xóa | Customer hoạt động |
| POST /checkout/quote | Kiểm tra lựa chọn và lập tóm tắt hiện tại | Customer hoạt động |
| POST /orders | Tiếp nhận Saga COD/payOS, trả 202 + checkoutId; cùng key trả cùng tiến trình/đơn | Customer hoạt động |
| GET /checkout/attempts/:id | Đọc PROCESSING/COMPENSATING/SUCCEEDED/FAILED/REVIEW_REQUIRED và orderId khi có | Customer, chỉ tiến trình của mình |
| POST /orders/:id/payments/payos | Tạo lại hoặc lấy liên kết payOS cho chính đơn UNPAID | Chủ đơn; Customer hoạt động |
| POST /payments/payos/webhook | Nhận kết quả payOS; xác minh chữ ký và xử lý idempotent | Public endpoint; chỉ chấp nhận payload có chữ ký hợp lệ |
| GET /payments/payos/return, /cancel | Chuyển khách về giao diện để tải trạng thái đơn | Công khai; không cập nhật trạng thái thanh toán |
| GET /orders, /orders/:id | Danh sách/chi tiết đơn cá nhân | Customer, chỉ đơn của mình |
| POST /orders/:id/cancel | Customer hủy PENDING UNPAID | Chủ đơn |
| GET, POST /admin/products | Tra cứu/tạo Product | Admin |
| GET, PATCH /admin/products/:id | Chi tiết/sửa nội dung, trạng thái hợp lệ | Admin |
| POST /admin/products/:id/variants | Thêm SKU | Admin |
| PATCH /admin/variants/:id | Sửa trường SKU được phép, không cập nhật tồn trực tiếp | Admin |
| GET, POST, PATCH /admin/categories | Quản lý Category cha–con và attribute_config; không có API /admin/brands hoặc module thuộc tính riêng | Admin |
| POST /admin/images | Catalog upload Cloudinary; multipart file + Idempotency-Key, trả imageAssetId/status/metadata | Admin |
| GET /admin/images/:id | Catalog trả trạng thái upload/metadata | Admin |
| POST /admin/products/:id/images | Catalog gắn imageAssetId READY vào Product/SKU | Admin |
| PATCH, DELETE /admin/products/:id/images/:imageId | Catalog sửa thứ tự/alt text/ảnh đại diện hoặc gỡ liên kết; không xóa asset Cloudinary | Admin |
| GET /admin/inventory, /admin/inventory/:skuId/history | Tồn và lịch sử | Admin |
| POST /admin/inventory/:skuId/adjustments | Nhập/kiểm kê có lý do | Admin |
| GET /admin/orders, /admin/orders/:id | Tra cứu đơn quản trị | Admin |
| POST /admin/orders/:id/confirm, /cancel, /ship | Hành động đơn trước/đến giao; các hậu tố thuộc cùng :id | Admin, kiểm tra trạng thái |
| POST /admin/orders/:id/deliver, /delivery-fail, /retry-delivery, /receive-return | Kết quả giao, giao lại và nhận hàng về | Admin, kiểm tra trạng thái |
| POST /admin/orders/:id/notes | Thêm ghi chú nội bộ | Admin |
| GET /admin/customers, /admin/customers/:id | Tra cứu Customer | Admin |
| POST /admin/customers/:id/lock, /unlock | Khóa/mở | Admin, chỉ Customer |
| GET /admin/dashboard | Số liệu theo định nghĩa | Admin |
| POST /events | Nhận event frontend theo danh sách cho phép | Guest/Customer; server gắn danh tính |
| POST /recommendations | Gợi ý theo quy tắc, lấy ngữ cảnh được phép | Guest/Customer |

POST /auth/password-reset-requests nhận email và trả phản hồi chung; POST /auth/password-resets xác nhận token cùng mật khẩu mới. Các endpoint này công khai, được giới hạn tần suất và không tiết lộ tài khoản tồn tại. Không có endpoint wishlist, đổi email, mua lại, reset mật khẩu do Admin thực hiện thay khách, cổng thanh toán ngoài payOS, refund hoặc sửa nội dung đơn. Không có endpoint công khai để sửa ánh xạ dataset hoặc gửi event transaction.

<a id="image-api"></a>
#### 8.1.1. Hợp đồng API ảnh của Catalog

Các route dưới đây là đặc tả mục tiêu và có prefix `/api/v1` khi qua Gateway. Catalog sở hữu upload, metadata, trạng thái và liên kết ảnh trong cùng `catalog_db`.

| Method / route | Đích | Đầu vào / kết quả |
|---|---|---|
| `POST /admin/images` | Catalog | Admin; multipart `file` + `Idempotency-Key`; 201 khi READY mới, 200 khi trả READY cũ, 202 khi PENDING |
| `GET /admin/images/:id` | Catalog | Admin; trạng thái upload và metadata hoặc mã lỗi an toàn |
| `POST /admin/products/:id/images` | Catalog | Admin; `imageAssetId`, `variantId?`, `altText?`, `sortOrder?`, `isPrimary?`; kiểm tra READY trực tiếp trong catalog_db |
| `PATCH /admin/products/:id/images/:imageId` | Catalog | Sửa thứ tự/alt text/ảnh đại diện; thay asset bằng liên kết mới |
| `DELETE /admin/products/:id/images/:imageId` | Catalog | Chỉ gỡ liên kết nếu Product vẫn hợp lệ; giữ asset lịch sử |
| `POST /internal/catalog/images/uploads` | Catalog | Job seed đã xác thực; cùng validation/idempotency như upload Admin, không công khai |

Lỗi: 400 thiếu key/file hoặc ảnh hỏng; 401/403 chưa xác thực/sai quyền; 404 asset không tồn tại; 409 cùng key khác payload hoặc asset chưa READY; 413 quá 5 MiB; 415 sai định dạng; 429 quá giới hạn; 502/503/504 lỗi provider/timeout. Không nhận URL/provider/READY do client tự khai. Timeout chưa rõ giữ PENDING và đối soát public_id trước khi upload lại. Gateway có trần multipart hữu hạn và timeout đủ cho upload; Catalog vẫn kiểm tra giới hạn riêng. Khi đã có operation, lỗi trả `imageAssetId` để tra cứu nếu có thể.

### 8.2. Hành vi lỗi ở mức nghiệp vụ

| Nhóm lỗi | Phản hồi yêu cầu |
|---|---|
| Dữ liệu nhập sai | Chỉ rõ trường cần sửa, không cập nhật một phần |
| Chưa đăng nhập/phiên không hợp lệ | Yêu cầu đăng nhập; không tự đặt hàng sau khi đổi danh tính |
| Không có quyền/tài nguyên không thuộc mình | Không tiết lộ dữ liệu của người khác |
| Thiếu hàng/SKU không còn bán | Chỉ rõ dòng và lượng tối đa hợp lệ nếu có; chưa tạo đơn |
| Giá/giỏ thay đổi | Trả dữ liệu mới để khách kiểm tra và xác nhận lại |
| Trạng thái đơn cũ hoặc đã hết hạn | Trả trạng thái hiện tại; không lặp hiệu ứng tồn |
| Trùng thao tác | Cùng dữ liệu trả kết quả cũ; khác dữ liệu báo xung đột |
| Mất kết nối/chưa biết kết quả | Cho thử lại/tra cứu cùng thao tác, không mặc định tạo mới |
| Lỗi nội bộ | Thông báo dễ hiểu kèm mã tra cứu; không trả stack trace/secret |

<a id="catalog-preprocessing"></a>
### 8.3. Seed và điểm tích hợp tương lai

- Manifest 500 sản phẩm đóng băng ba CSV, version, SHA-256 từng file, định danh/checksum đầu vào clean, phiên bản notebook, seed ngẫu nhiên 42, quota từng root và danh sách ID đã chọn. Đây là artifact bổ sung cần chuẩn bị khi bàn giao; notebook hiện chỉ xuất ba CSV.
- Seed lại chỉ bổ sung phần thiếu theo ID ổn định, không nhân đôi hoặc ghi đè chỉnh sửa Admin. Reset là thao tác chủ động riêng, không chạy khi start.
- Snapshot địa giới có mã, tên, quan hệ và ngày/nguồn; cập nhật là thao tác chủ động, không đổi snapshot đơn cũ.
- Recommendation sẽ được xây bằng Python/FastAPI ở giai đoạn sau. Các yêu cầu rule_based, tracking/export và tích hợp model trong tài liệu là thiết kế tương lai; chưa có service, database hay contract Python được triển khai. Web không phụ thuộc Recommendation để mua hàng.
- Export hành vi ở mức công cụ nội bộ, không cần màn hình Admin: có phiên bản, mốc thời gian, event ID/type, item RetailRocket nếu có, SKU nội bộ và định danh khách/phiên. Loại dữ liệu liên hệ, địa chỉ, token, ghi chú và query tự do khỏi bản xuất mặc định.
- Phía AI quyết định hỗ trợ user/item mới và catalog ứng viên khi tích hợp; không tự gán Customer mới vào visitor lịch sử RetailRocket.

#### 8.3.1. Quy trình chuẩn bị catalog theo notebook

1. Đọc `events_clean.parquet`, `category_tree_clean.parquet`, `item_properties_clean.parquet`. Hai notebook bắt đầu từ dữ liệu clean, không đặc tả cách làm sạch raw.
2. Lọc property = categoryid, chuyển value sang số với lỗi thành null, sắp timestamp tăng, giữ dòng cuối mỗi itemid rồi bỏ category null. Đây là category mới nhất của snapshot; không phải phép join theo thời điểm event, cũng không phải “category hợp lệ cuối cùng” nếu dòng mới nhất bị lỗi.
3. Group event theo itemid: interactions = số dòng của cả view/addtocart/transaction; users = số visitorid khác nhau của item. Ghép category với đúng một dòng mỗi item; số dòng không được tăng. Loại item thiếu category khỏi tập chọn demo.
4. Duyệt parent đến root rồi ghép vào item. Kiểm tra cây không có chu trình, parent mồ côi hoặc category trùng; vòng visited trong notebook chỉ tránh lặp vô hạn, chưa thay thế validation. Đủ category/root cho toàn bộ item ứng viên.
5. Với mỗi root, quota ban đầu = min(5, item_count). Phân phần còn lại theo sqrt(total_interactions), lấy floor và chặn bởi capacity. Phần dư phân mỗi lượt một item cho các root còn capacity theo total_interactions giảm dần; lặp tới tổng 500. Không phân theo số visitor xem hay kích thước root đơn thuần.
6. Trong mỗi root, xếp interactions giảm dần rồi users giảm dần, lấy đúng quota. Notebook chưa thêm itemid làm khóa hòa; seed phải đọc artifact đã đóng băng. Khi tái xuất phiên bản mới cần quy định tie-break ổn định (itemid tăng cho item, root_categoryid tăng cho root, thứ tự nguồn cố định cho property cùng timestamp) và ghi thay đổi version; không tuyên bố đây là hành vi đã có của notebook. Nếu tổng capacity không đủ 500 hoặc tổng quota tối thiểu vượt 500 thì báo cấu hình không hợp lệ, không lặp vô hạn hoặc tự cắt bớt dữ liệu.
7. Gán product_id = 1..500 theo thứ tự kết quả; category_id = 1..23 theo root_categoryid tăng. Tạo metadata rồi xuất ba CSV. Thay thứ tự/chọn lại có thể đổi ID và giá trị random; không dùng seed 42 một mình làm bảo đảm tái lập.

`total_users` ở bảng phân bố root là tổng users từng item, có thể đếm một visitor nhiều lần; không diễn giải là số user duy nhất của root. Trong EDA, merge mọi bản ghi category lịch sử làm 2.755.641 event thành 5.899.105 dòng; không dùng kết quả đó làm quota, funnel hay ground truth category. Tỷ lệ addtocart/view và transaction/view trong EDA là tỷ lệ số event, không phải tỷ lệ chuyển đổi theo user/session đã nối hành trình.

#### 8.3.2. Hợp đồng ba CSV

| File | Cột theo đúng thứ tự xuất | Kết quả snapshot |
|---|---|---|
| products_demo.csv | product_id, source_item_id, sku, name, brand, category_id, category_name, price, stock, image_url, description, is_active, interactions, users | 500 × 14 |
| categories_demo.csv | category_id, root_categoryid, category_name | 23 × 3 |
| category_mapping.csv | categoryid, root_categoryid, category_id, category_name | 1.664 × 4 |

- Product có product_id, source_item_id và sku duy nhất, không null/rỗng; category_id phải có trong categories_demo và category_name phải khớp. Product CSV **không có categoryid gốc ở cấp item hoặc root_categoryid**: root suy từ categories_demo; không suy đoán leaf category từ tên hiển thị.
- categories_demo có category_id và root_categoryid duy nhất. category_mapping có categoryid duy nhất; cặp category_id/root_categoryid và tên phải khớp categories_demo. 1.664 dòng là toàn bộ category thuộc 23 root được giữ qua inner join, không chỉ 1.086 category có item tương tác và không phải toàn bộ 1.669 category của cây.
- Parse ID nguyên không mất chính xác; ID nguồn lưu chuỗi thập phân chuẩn, không giữ hậu tố `.0` do pandas chuyển kiểu. Không ép ID CSV vào khóa chính identity trong DB. is_active chỉ nhận boolean hợp lệ, không dùng truthiness của chuỗi.
- price là số nguyên VND dương, stock là số nguyên 0..100 trong snapshot seed. interactions/users là số nguyên dương, users <= interactions; chúng không tạo event hoặc giao dịch LIVE. Các miền synthetic này chỉ kiểm tra seed, không giới hạn giá/tồn Admin trong vận hành.
- Seed 42 chọn trong sáu brand Nexora, Aurevia, Velmora, Orlena, Novaris, Elvora; giá sinh 50.000..3.000.000 VND rồi làm tròn xuống bội 10.000; tồn 0..100. Giá quan sát ở output là 60.000..2.990.000, không nhầm với miền sinh dữ liệu. Tên theo brand + loại + ID, SKU nguồn dạng NXR-00001, mô tả synthetic và URL placehold.co theo danh mục.
- Validation `isna()` của notebook không chứng minh URL tải được ảnh hoặc chuỗi không rỗng. Import phải kiểm tra riêng, tải/chuyển ảnh JPEG/PNG/WebP hợp lệ, upload qua Catalog lên Cloudinary và kiểm tra CDN trước mở bán; không hotlink placehold.co làm ?nh chính.

#### 8.3.3. Chuyển sang mô hình vận hành và ranh giới AI

Một dòng products_demo tạo một Product có attributes `{}`, variant_option_keys `[]` và một ProductVariant options `{}`. Variant nhận toàn bộ price/stock, reserved = 0 và mã vận hành sinh bằng sequence; sku CSV giữ riêng như seed_sku. Không nhân stock qua nhiều SKU. Danh mục seed ban đầu có parent_id NULL, attribute_config `{}`; ảnh là ảnh chung variant_id NULL. is_active true chuyển ACTIVE chỉ sau khi đủ danh mục, ảnh và SKU hợp lệ; stock = 0 vẫn ACTIVE/hết hàng. is_active false chuyển INACTIVE. Mọi thống kê/ID nguồn được lưu đối chiếu, không sửa qua form Admin. Hợp đồng ba CSV không đổi; không yêu cầu notebook sinh thông số giả.

Snapshot lưu trong notebook ghi 417.053 item có category, 235.061 item có event, 49.815 thiếu category, 185.246 còn lại, 25 root toàn cây và 23 root được chọn. Đây là mốc đối chiếu phiên bản đầu, không hardcode như bất biến cho mọi dataset tương lai. Bộ CSV/clean parquet chưa có trong thư mục docs; output notebook không chứng minh seed database đã chạy.

Dataset lịch sử ở khu vực offline riêng. Model tương lai dùng ánh xạ source_item_id để lọc/rerank ứng viên về Product đang bán/có tồn trong catalog; không chỉ train trên 500 item demo theo mặc định. view → VIEW, addtocart → ADD_TO_CART, transaction → PURCHASE; order_created không đổi thành PURCHASE. Export phải phân biệt nguồn LIVE/REPLAY và danh tính web với visitor lịch sử. Temporal split, continuous ID mapping, graph training, embeddings, WebSocket/SSE/Graph UI và model cập nhật gần realtime là định hướng chưa triển khai trong hai notebook, chưa thuộc FR hiện tại. Feature category dùng đánh giá theo thời gian cần lấy thông tin có sẵn tại thời điểm tương ứng để tránh rò rỉ tương lai.

<a id="verification"></a>
## 9. Kiểm thử và truy vết

### 9.1. Nguyên tắc

Vitest chạy các bài kiểm tra; Supertest gửi request tới backend trong bài kiểm tra. Dùng database test riêng. Kiểm tra trình duyệt bằng Playwright và kiểm tra thủ công các trạng thái giao diện quan trọng. Tài liệu này chưa khẳng định đã chạy hoặc đã đạt các ca kiểm thử phần mềm.

Không yêu cầu kiểm thử tải nhiều người. Các ca hai request đồng thời là kiểm tra bất biến dữ liệu cần thiết ngay cả khi demo một người hoặc người dùng mở hai tab.

### 9.2. Kịch bản nghiệm thu

| Mã | Kịch bản | Kết quả bắt buộc |
|---|---|---|
| TC-01 | Đăng ký hợp lệ, email khác hoa/thường, thiếu trường, sai xác nhận | Chỉ tạo một Customer/email; không gửi email xác minh; chuyển đăng nhập; lỗi không tạo user dở dang |
| TC-02 | Đăng nhập đúng/sai/khóa trên hai trình duyệt | Đúng tạo hai phiên độc lập; sai lỗi chung; khóa không đăng nhập được |
| TC-03 | Logout một phiên, phiên hết hạn, token cũ của Customer bị khóa | Phiên khác còn khi chỉ logout; không lộ cache/giỏ tài khoản; tài khoản khóa bị từ chối |
| TC-04 | Đổi mật khẩu sai/đúng; dùng lại các phiên cũ | Sai không đổi; đúng thu hồi mọi phiên, mật khẩu cũ không dùng được |
| TC-05 | Sửa tên/điện thoại rồi gửi thêm email/role hoặc user ID khác | Chỉ trường được phép thay đổi; không sửa email/quyền hoặc dữ liệu người khác |
| TC-06 | Thêm/sửa/xóa địa chỉ, đổi tỉnh, địa giới sai quan hệ | Kiểm tra server; đổi tỉnh phải chọn lại cấp xã; không truy cập địa chỉ người khác |
| TC-07 | Địa chỉ đầu tiên, đổi mặc định, xóa mặc định và sửa địa chỉ có đơn cũ | Tối đa một mặc định; chọn địa chỉ cũ nhất còn lại; snapshot đơn không đổi |
| TC-08 | Lọc đen/M/còn hàng/giá; Product chỉ có đen/L và trắng/M | Product không được khớp sai; tìm tên, sort và URL/phân trang đúng; rỗng không lỗi |
| TC-09 | Chọn options khác thứ tự với áo color/size, điện thoại color/storage và sách options rỗng; tổ hợp không có/hết hàng/ngừng bán | Giá/ảnh/tình trạng đúng SKU; một SKU tự chọn; không thêm tổ hợp không tồn tại; view không tăng khi đổi lựa chọn |
| TC-10 | Thêm SKU lặp, khác lựa chọn, tăng vượt tồn, retry cùng thao tác | Cộng đúng quantity hoặc tách dòng; vượt tồn từ chối; retry không cộng hai lần; tồn không đổi |
| TC-11 | Sửa quantity, giảm/xóa SKU hết hàng, chọn từng dòng | Chỉ sửa quantity/xóa; giá hiện tại; dòng lỗi không checkout; tổng chỉ phần chọn |
| TC-12 | Guest chọn thêm giỏ hoặc gọi API giỏ; đăng nhập rồi tiếp tục | Guest không tạo/đọc/sửa được giỏ; sau đăng nhập thao tác được tiếp tục theo xác nhận của khách |
| TC-13 | Giỏ tài khoản còn nguyên sau logout/login lại; tracking session quá 30 phút | Giỏ vẫn gắn đúng tài khoản, không lộ giữa hai tài khoản; phiên tracking mới không làm mất giỏ |
| TC-14 | Guest sang checkout, đăng nhập, chọn dòng, địa chỉ mới bật/tắt lưu | Yêu cầu login; Customer kiểm tra giỏ rồi tiếp tục; ship 30.000đ; lưu địa chỉ chỉ khi chọn và đặt thành công |
| TC-15 | Đặt nhiều dòng; lỗi local trước/sau reserve và lưu đơn | Một tiến trình/đơn, snapshot và reserve đủ dòng; chỉ xóa dòng mua khi đơn commit; Saga phục hồi/bù hiệu ứng đã commit |
| TC-16 | Giá/giỏ/stock đổi trước đặt; hai request tranh SKU cuối | Yêu cầu xác nhận lại hoặc từ chối dòng lỗi; tối đa một đơn giữ được hàng cuối; không âm tồn |
| TC-17 | Gửi lại đặt hàng cùng khóa/cùng body khi PROCESSING/SUCCEEDED và cùng khóa/khác body | Trả cùng checkout attempt/đơn hoặc xung đột; không giữ hàng/lưu địa chỉ/tạo event hai lần |
| TC-18 | Customer xem đơn của mình/người khác; catalog/địa chỉ đã đổi | Chỉ đọc đơn của mình; snapshot giữ nguyên; không lộ ghi chú nội bộ |
| TC-19 | Customer hủy PENDING UNPAID/PAID, CONFIRMED, retry và tranh chấp Admin xác nhận | Chỉ đơn UNPAID đủ điều kiện hủy; chỉ một kết quả thắng; giải phóng reservation đúng một lần |
| TC-20 | Đơn đúng hạn/quá hạn, Admin xác nhận sau hạn, restart qua hạn | PENDING UNPAID hết hạn; PAID không tự hết hạn; không xác nhận PENDING UNPAID sau hạn; CONFIRMED không bị hủy theo 24 giờ |
| TC-21 | Admin xác nhận/hủy PENDING và CONFIRMED; hủy SHIPPING hoặc thiếu lý do | Chuyển đúng bảng trạng thái; thao tác sai bị từ chối; không tác động tồn lặp |
| TC-22 | Chuyển CONFIRMED đi giao, retry, thiếu reservation | Xuất onHand/reserved một lần; thiếu dữ liệu không xuất một phần |
| TC-23 | Xác nhận giao COD chưa thu/đã thu và payOS đã trả; retry; thử với CANCELLED | COD chỉ PAID khi thu; payOS giữ paidAt gốc; transaction mỗi dòng một lần; không hoàn tất đơn hủy |
| TC-24 | Giao thất bại rồi giao lại nhiều lần | Lý do bắt buộc; lịch sử đầy đủ; không nhập/xuất kho hoặc thu thêm phí ship |
| TC-25 | Nhận toàn bộ hàng về, retry; thử hoàn trước khi nhận | Hoàn đủ một lần rồi CANCELLED/UNPAID; chỉ thất bại chưa làm tăng tồn |
| TC-26 | Tạo/mở bán Product đa ngành; options trùng khác thứ tự/hoa thường/khoảng trắng, sai kiểu/mã/tập khóa; đổi options SKU đã reserve hoặc có đơn | Chặn tổ hợp trùng và dữ liệu sai; SKU đã dùng bất biến; không sửa nguồn/snapshot; giá/tồn riêng từng SKU |
| TC-27 | Tạo cây Category, tự trỏ/chu trình đồng thời; sửa cấu hình/đổi Category làm SKU đang bán sai; thử quản lý Brand hoặc xóa Category đang dùng | Cây hợp lệ, lọc gồm danh mục con; chặn chu trình/thay đổi sai; không có CRUD Brand/module thuộc tính riêng; giữ tham chiếu cũ |
| TC-28 | Upload ảnh hợp lệ/sai định dạng/quá giới hạn/thiếu quyền; gắn SKU khác Product; dùng chung asset nhiều SKU; Cloudinary timeout và thay ảnh đã có đơn | Chỉ asset xác minh được READY; chặn SKU sai Product; ưu tiên ảnh SKU rồi ảnh chung; gỡ một liên kết không xóa asset Cloudinary; chỉ lưu metadata/URL, giải phóng buffer, giữ asset lịch sử |
| TC-29 | Nhập hàng/kiểm kê với reserved đang thay đổi | Không cho onHand < reserved; có người/lý do/trước–sau; không tự sửa reserved |
| TC-30 | Admin tìm/lọc đơn, xem lịch sử, thêm ghi chú | Kết quả đúng; ghi chú nội bộ không trả cho Customer; không sửa nội dung đơn |
| TC-31 | Khóa/mở Customer có phiên và đơn đang xử lý | Khóa chặn token cũ, không hủy đơn; mở không hồi sinh phiên; không khóa Admin qua API Customer |
| TC-32 | Tập đơn mới/chờ/hủy/thất bại/đã giao ở hai mốc ngày | Đơn theo createdAt/trạng thái, tiền theo paidAt; ship riêng; retry giao thất bại không nhân số đơn |
| TC-33 | View/search/impression/click đủ và không đủ điều kiện; event gửi lại | Ghi đúng ngữ cảnh; impression chỉ đủ ngưỡng; không trùng event ID; không ghi từng ký tự |
| TC-34 | Nghiệp vụ giỏ/đơn thành công/rollback/retry; client giả transaction | Event đúng nguồn và thời điểm; rollback không có event; client bị từ chối |
| TC-35 | Guest login/logout, tài khoản khác trên cùng trình duyệt, sửa user ID client | Không trộn lịch sử danh tính; session đúng; server không tin user ID client |
| TC-36 | Gợi ý không có tín hiệu/không đủ ứng viên/SKU hết hàng/lỗi service nội bộ | Nguồn rule_based, thứ tự ổn định, chỉ item bán được; ẩn khi rỗng, không chặn mua |
| TC-37 | Seed 500 item, thay catalog qua Admin, seed lại, Product mới chưa có RR ID | Manifest cố định; không trùng/ghi đè; Product mới vẫn bán được; nguồn/category tách biệt |
| TC-38 | Địa giới offline, cập nhật snapshot, export hành vi | Chạy không gọi nguồn live; đơn cũ giữ tên/mã; export có version, không thông tin liên hệ |
| TC-39 | Khởi chạy/restart, CDN lỗi hoặc thiếu CSV/manifest/asset đã upload | Database và metadata/asset CDN còn nguyên; UI fallback khi CDN lỗi; upload chưa thành công không đánh READY/mở bán; thiếu đầu vào báo rõ, không tự reset |
| TC-40 | Gọi API sai quyền, origin sai, nhập script, upload bất thường, xem log/response | Không vượt quyền, thực thi nội dung nhập hoặc lộ secret; validation server có hiệu lực |
| TC-41 | Đi trọn luồng ở 390px/1366px, API lỗi, giỏ rỗng, click lặp | UI dùng được, báo trạng thái rõ; không thông báo đặt thành công giả hoặc mất dữ liệu cần sửa |
| TC-42 | Một item có nhiều category theo thời gian, category mới nhất lỗi/null; cây chu trình/mồ côi | Giữ đúng dòng cuối rồi bỏ null, không nhân item; cây sai bị từ chối; không dùng merge EDA làm thống kê |
| TC-43 | Kiểm tra quota và artifact snapshot; tái xuất có item hòa điểm | Tổng 500, đúng quota 23 root, đủ 500 source_item_id duy nhất; manifest đóng băng/checksum đúng, không tự chọn lại khi seed |
| TC-44 | Import ba CSV vào DB đã có ID; trùng/thiếu ID, sai root/tên, giá thập phân, thiếu ảnh, lỗi giữa lô | ID nội bộ riêng; schema 14/3/4 cột, mapping 1.664 dòng đúng snapshot; lỗi từ chối/rollback toàn lô, không mở bán catalog dở dang |
| TC-45 | Seed sản phẩm stock 0/dương, chọn SKU mặc định, xem ảnh CDN và kiểm tra số liệu | Đúng một SKU/Product, reserved 0, không nhân stock; tự chọn SKU; nhãn demo rõ; dữ liệu nguồn không tạo LIVE/doanh thu; seed lại giữ sửa đổi Admin |
| TC-46 | Checkout chọn COD/payOS; tạo link payOS đúng đơn, số tiền và hạn; tạo link lỗi rồi thử lại | Hai phương thức có trạng thái đúng; không tạo đơn/giữ hàng trùng; link lỗi giữ UNPAID và retry gắn đơn cũ |
| TC-47 | Webhook payOS hợp lệ, gửi lặp, chữ ký sai, sai orderCode/amount hoặc đơn đã hủy | Chỉ callback hợp lệ đúng đơn chuyển PAID; callback lặp không nhân doanh thu/event; callback không hợp lệ không đổi trạng thái |
| TC-48 | Return/cancel URL mở trước/sau webhook; payOS đã trả rồi giao thất bại | Return URL không xác nhận PAID; API hiển thị trạng thái chuẩn; đơn paid chỉ được giao lại, không hủy/hoàn tồn |
| TC-49 | Khôi phục mật khẩu với email có/không có tài khoản; token sai, hết hạn, đã dùng; thử lại nhiều lần | Phản hồi chung không dò được email; email hợp lệ có liên kết dùng một lần; đổi mật khẩu thu hồi mọi phiên; link lỗi không đổi mật khẩu |
| TC-50 | Gửi email tạo đơn/thay đổi trạng thái, nhà cung cấp lỗi/tạm ngừng, worker retry cùng event | Đơn/payment không rollback; không tạo job trùng event key; dùng provider idempotency nếu hỗ trợ, ghi nhận hạn chế gửi lặp khi provider không hỗ trợ; retry/thất bại quan sát được, không lộ secret/token |
| TC-51 | Orchestrator dừng sau reserve/trước gửi bước kế; duplicate command/result/event; Kafka gián đoạn rồi restart | Tiếp tục từ Saga step/result bền vững, timeout chưa rõ không tự bù; inbox/outbox không mất hiệu ứng; không tạo đơn hoặc reserve/release/ship/return hai lần |
| TC-52 | ES/Redis lỗi, search event trễ/cũ; lọc options/giá/còn hàng ở nhiều ngành, danh mục cha | Search fallback cùng ngữ nghĩa; các điều kiện khớp cùng SKU, gồm danh mục con; checkout dùng PostgreSQL, stock/payment không lấy cache làm nguồn sự thật |
| TC-53 | Upload Admin qua Gateway/Catalog/Cloudinary; giả URL/READY hoặc gọi route seed từ client | Metadata và liên kết thuộc catalog_db, kiểm tra READY trong transaction local; URL HTTPS hợp lệ, chặn vượt quyền, không lộ secret hoặc giữ file gốc |
| TC-54 | Retry cùng key/khác payload; timeout/restart sau upload trước commit DB; gắn ảnh lỗi rồi thử lại | Cùng key trả cùng asset hoặc PENDING, khác payload trả 409; phục hồi đúng asset sau đối soát, không upload trùng hoặc READY giả; gắn lại dùng asset đã có; giữ asset lịch sử |

Các ca tracking/gợi ý trong bảng là tiêu chí cho giai đoạn Python/FastAPI sau; chưa yêu cầu chạy trong stack Docker/PostgreSQL hiện tại.

### 9.3. Ma trận truy vết chức năng

| BREQ | FR | UC | TC |
|---|---|---|---|
| BREQ-01 | FR-AUTH-01 | UC-01 | TC-01 |
| BREQ-01 | FR-AUTH-02 | UC-02 | TC-02 |
| BREQ-01 | FR-AUTH-03 | UC-03 | TC-03 |
| BREQ-01 | FR-AUTH-04 | UC-04 | TC-04 |
| BREQ-01 | FR-AUTH-05 | UC-05 | TC-05 |
| BREQ-11 | FR-AUTH-06, FR-AUTH-07 | UC-04A, UC-04B | TC-49 |
| BREQ-11 | FR-EMAIL-01, FR-EMAIL-02 | UC-14B | TC-50 |
| BREQ-04 | FR-ADDR-01 | UC-06 | TC-06 |
| BREQ-04 | FR-ADDR-02 | UC-06 | TC-07 |
| BREQ-04 | FR-ADDR-03 | UC-13, UC-14 | TC-14, TC-17 |
| BREQ-02 | FR-CAT-01 | UC-07 | TC-08, TC-36 |
| BREQ-02 | FR-CAT-02 | UC-07 | TC-08, TC-52 |
| BREQ-02 | FR-CAT-03 | UC-08 | TC-09, TC-45 |
| BREQ-02 | FR-CAT-04 | UC-08 | TC-09, TC-26 |
| BREQ-09 | FR-REC-01 | UC-32 | TC-36 |
| BREQ-03 | FR-CART-01 | UC-09, UC-11 | TC-13 |
| BREQ-03 | FR-CART-02 | UC-09 | TC-10 |
| BREQ-03 | FR-CART-03 | UC-10, UC-11 | TC-11 |
| BREQ-03 | FR-CART-04 | UC-12 | TC-12 |
| BREQ-03 | FR-CART-05 | UC-11 | TC-11, TC-16 |
| BREQ-04 | FR-CHK-01 | UC-13 | TC-14 |
| BREQ-04 | FR-CHK-02 | UC-14 | TC-16 |
| BREQ-04 | FR-CHK-03 | UC-14 | TC-15, TC-17, TC-51 |
| BREQ-04 | FR-PAY-01 | UC-14 | TC-46 |
| BREQ-04 | FR-PAY-02 | UC-14A | TC-47 |
| BREQ-04 | FR-PAY-03, FR-PAY-04 | UC-14A, UC-17 | TC-48, TC-20 |
| BREQ-05 | FR-ORD-01 | UC-15 | TC-18 |
| BREQ-05 | FR-ORD-02 | UC-16 | TC-19 |
| BREQ-05 | FR-ORD-03 | UC-17 | TC-20 |
| BREQ-05 | FR-ORD-04 | UC-18 | TC-21 |
| BREQ-05 | FR-ORD-05 | UC-19 | TC-22 |
| BREQ-05 | FR-ORD-06 | UC-20 | TC-23 |
| BREQ-05 | FR-ORD-07 | UC-21, UC-22 | TC-24, TC-25 |
| BREQ-06 | FR-INV-01 | UC-14, UC-16, UC-17, UC-19, UC-22 | TC-16, TC-19, TC-20, TC-22, TC-25 |
| BREQ-06 | FR-INV-02 | UC-26 | TC-29 |
| BREQ-07 | FR-ADM-01 | UC-23 | TC-26 |
| BREQ-07 | FR-ADM-02 | UC-24 | TC-27 |
| BREQ-07 | FR-ADM-03 | UC-25 | TC-28, TC-53, TC-54 |
| BREQ-07 | FR-ADM-04 | UC-27 | TC-30 |
| BREQ-07 | FR-ADM-05 | UC-28 | TC-31 |
| BREQ-07 | FR-ADM-06 | UC-29 | TC-32 |
| BREQ-08 | FR-TRK-01 | UC-30 | TC-33 |
| BREQ-08 | FR-TRK-02 | UC-31 | TC-34 |
| BREQ-08 | FR-TRK-03 | UC-30 | TC-35 |
| BREQ-09 | FR-DATA-01 | UC-33 | TC-37, TC-43, TC-44 |
| BREQ-09 | FR-DATA-02 | UC-33 | TC-38 |
| BREQ-09 | FR-DATA-03 | UC-33 | TC-42, TC-43, TC-44 |
| BREQ-02, BREQ-09 | FR-DATA-04 | UC-08, UC-33 | TC-44, TC-45 |
| BREQ-04 | FR-LOC-01 | UC-06, UC-33 | TC-06, TC-38 |
| BREQ-10 | FR-OPS-01 | UC-33 | TC-39 |

### 9.4. Truy vết quy tắc và phi chức năng

| BR | FR tiêu biểu | TC |
|---|---|---|
| BR-01, BR-03 | FR-AUTH-01, FR-AUTH-05 | TC-01, TC-05 |
| BR-02 | FR-AUTH-02, FR-AUTH-03, FR-AUTH-04 | TC-02, TC-03, TC-04 |
| BR-04, BR-05 | FR-CAT-03, FR-ADM-01 | TC-09, TC-26 |
| BR-06 | FR-CART-01, FR-CART-02 | TC-10, TC-13 |
| BR-07, BR-08 | FR-CHK-01, FR-CHK-02 | TC-14, TC-16 |
| BR-09, BR-10 | FR-CHK-03, FR-INV-01 | TC-15, TC-16, TC-29 |
| BR-11, BR-12, BR-13 | FR-ORD-02, FR-ORD-03, FR-ORD-04 | TC-17, TC-19, TC-20, TC-21 |
| BR-14, BR-15 | FR-ORD-07 | TC-24, TC-25 |
| BR-16 | FR-ORD-06, FR-TRK-02 | TC-23, TC-34 |
| BR-17 | FR-ADDR-02, FR-ADDR-03, FR-CHK-03 | TC-07, TC-14, TC-18 |
| BR-18 | FR-CAT-04 | TC-09, TC-26 |
| BR-19 | FR-ADM-05 | TC-31 |
| BR-20 | FR-DATA-01, FR-DATA-04, FR-REC-01 | TC-36, TC-37, TC-45 |
| BR-21 | FR-ADM-06 | TC-32 |
| BR-22 | FR-CAT-02 | TC-08 |
| BR-23 | FR-DATA-01, FR-DATA-03 | TC-37, TC-43, TC-44 |
| BR-24 | FR-DATA-04, FR-CAT-03 | TC-45 |
| BR-25 | FR-DATA-02, FR-DATA-04, FR-REC-01 | TC-36, TC-38, TC-45 |

| NFR | TC liên quan |
|---|---|
| NFR-01 | TC-03, TC-05, TC-18, TC-31, TC-40 |
| NFR-02 | TC-02, TC-03, TC-04, TC-40 |
| NFR-03 | TC-15, TC-16, TC-17, TC-19, TC-22, TC-23, TC-25 |
| NFR-04 | TC-37, TC-39, TC-54 |
| NFR-05 | TC-41 |
| NFR-06 | TC-33, TC-36, TC-41 |
| NFR-07 | TC-38, TC-39 |
| NFR-08 | TC-20, TC-32 |
| NFR-09 | TC-18, TC-35, TC-38, TC-40 |
| NFR-10 | TC-16, TC-41 |
| NFR-11 | TC-01, TC-28, TC-40, TC-53 |
| NFR-12 | TC-21, TC-25, TC-29, TC-31, TC-40 |
| NFR-13 | TC-47, TC-48 |
| NFR-14 | TC-49, TC-50 |
| NFR-15 | TC-15, TC-17, TC-51, TC-52, TC-53, TC-54 |

<a id="delivery"></a>
## 10. Giới hạn và điều kiện bàn giao

### 10.1. Giới hạn đã thống nhất

- Không wishlist, xác minh email, đổi email, SMS, social login hoặc Keycloak. Email khôi phục mật khẩu và thông báo đơn hàng thuộc phạm vi.
- Không bảng/quản trị Color, Size, SizeGroup hoặc EAV tổng quát; cấu hình thuộc tính nằm trong form Category, giá trị nằm tại Product/SKU. Khách chọn options có sẵn, không tự gõ khi mua. Chưa lọc khoảng số theo thông số hoặc tự chuyển đổi đơn vị.
- Không voucher, đánh giá, cổng thanh toán ngoài payOS, hoàn tiền, đối soát COD, hãng/mã vận đơn, giao một phần, đổi trả sau nhận hàng, hàng hỏng hoặc mua lại. Đơn payOS đã thanh toán không được hủy trong phạm vi này.
- Không sửa đơn trực tiếp, không yêu cầu hủy sau xác nhận từ Customer, không giới hạn số đơn chờ.
- Giả định toàn bộ hàng giao thất bại nhận về nguyên vẹn; không nhập kho trước khi xác nhận nhận lại.
- Không cam kết tải đồng thời, production hosting hoặc độ chính xác recommendation. Model AI không phải phụ thuộc của ecommerce hiện tại.

### 10.2. Đầu vào và cấu hình cần chuẩn bị

- Workspace có dữ liệu RetailRocket raw và hai notebook kèm output đã lưu. Cần bàn giao ba CSV xuất, manifest/checksum, asset placeholder trên CDN và snapshot địa giới; tái chạy notebook cần chuẩn bị ba parquet clean theo đường dẫn cấu hình.
- Cấu hình hiện tại gồm năm database/user riêng cho Auth, Catalog, Order, Payment, Notification. Khi triển khai upload, Cloudinary credential chỉ cấp cho Catalog. Recommendation FastAPI có cấu hình/database riêng ở giai đoạn sau. Không commit mật khẩu/khóa thật.
- Luồng payOS cần client ID, API key, checksum key, return/cancel URL và webhook URL được cấu hình phía backend. Thiếu cấu hình hoặc provider lỗi thì báo lỗi thanh toán, giữ đơn UNPAID; không giả lập thành công.
- Email cần cấu hình nhà cung cấp SMTP/API và địa chỉ gửi phía backend; thiếu cấu hình thì báo trạng thái gửi lỗi/thử lại, không làm sai giao dịch đơn hàng.
- Việc tải dữ liệu ban đầu có thể cần Internet/quyền truy cập nguồn; chạy demo sau chuẩn bị không cần gọi nguồn đó trực tiếp.
- Frontend ReactJS + Vite, Gateway và năm scaffold NestJS hiện có sẽ được mở rộng; module upload nằm trong Catalog. Recommendation dùng Python/FastAPI triển khai sau, không thuộc npm workspaces. ORM/migration/token phải đáp ứng SRS.
- Monorepo/workspaces, service ownership, Kafka topic, Compose và CI theo [Architecture](Folder-ARCHITECTURE.md). CD AWS là giai đoạn sau; từng service có database/migration riêng, không dùng FK xuyên service của baseline.

### 10.3. Điều kiện hoàn thành phần mềm

1. Toàn bộ FR có chức năng tương ứng và vượt qua ca kiểm thử liên kết.
2. Kịch bản một người thực hiện cả vai Customer/Admin hoàn tất các nhánh mua, hủy, hết hạn, giao thành công, thất bại/giao lại/nhận hàng về.
3. Không có lỗi vượt quyền, âm tồn, giữ/hoàn tồn lặp, tạo đơn trùng hoặc sai snapshot.
4. Có catalog 500 sản phẩm, 23 danh mục, 1.664 mapping nguồn của snapshot đầu, 500 SKU mặc định và manifest tái lập; metadata synthetic/placeholder có nhãn minh họa, ảnh đọc CDN, địa giới chạy local. Số SKU/Product có thể tăng do Admin sau seed.
5. Có mã nguồn, migration, seed, cấu hình mẫu, OpenAPI khi triển khai, hướng dẫn chạy và bằng chứng kết quả kiểm thử; dữ liệu test tách database demo.
6. Khởi động lại giữ nguyên dữ liệu/ảnh; tác vụ xử lý bù đơn hết hạn hoạt động.

### 10.4. Quản lý thay đổi tài liệu

Các quy tắc nghiệp vụ đã được chốt trong trao đổi. Những mặc định triển khai ở mục 6.2–6.3 được nêu rõ để tránh người triển khai tự đoán; có thể hiệu chỉnh bằng cập nhật phiên bản tài liệu trước khi thay hành vi.

Nếu yêu cầu mới thay đổi quyền, thời hạn, tồn, tiền, event hoặc phạm vi, cập nhật cả [BRD](BRD.md), FR/UC liên quan và ma trận TC. Không xem tài liệu Draft này là biên bản nghiệm thu hoặc bằng chứng phần mềm đã vượt qua kiểm thử.

### 10.5. Nguồn tham khảo

- [RetailRocket dataset](https://www.kaggle.com/datasets/retailrocket/ecommerce-dataset).
- [Build Demo Catalog — giải thích tiền xử lý](../Data/Build_Demo_Catalog.docx).
- [Notebook Build — mã nguồn và output catalog](../Data/Build_Demo_Catalog.ipynb). Schema/thuật toán thực tế trong notebook là chuẩn khi ví dụ Word khác với code.
- [Notebook EDA — thống kê và giới hạn merge category](../Data/EDA_Exploratory_Data_Analysis.ipynb).
- [Danh mục đơn vị hành chính — Cục Thống kê](https://danhmuchanhchinh.nso.gov.vn/Default.aspx).
- [Quyết định 19/2025/QĐ-TTg](https://chinhphu.vn/?docid=214409&pageid=27160), kết hợp bản đối chiếu cập nhật tại thời điểm chuẩn bị snapshot.
- [payOS — API](https://payos.vn/docs/api/): tạo liên kết thanh toán và nhận kết quả webhook.
- [payOS — Kiểm tra chữ ký webhook](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/): xác minh tính toàn vẹn dữ liệu thanh toán.

### 10.6. Lịch sử phiên bản

| Phiên bản | Ngày | Nội dung |
|---|---|---|
| 1.0 | 09/10/2026 | Tổng hợp yêu cầu đã thảo luận; bổ sung use case, trạng thái, validation, API tóm tắt và ma trận nghiệm thu |
| 1.1 | 10/10/2026 | Đồng bộ màu/size trực tiếp, mã SKU tự sinh, snapshot dạng cột và reservation theo dòng đơn; bổ sung liên kết thiết kế database |
| 1.2 | 11/10/2026 | Catalog đa ngành theo notebook; latest category/quota root; hợp đồng ba CSV, provenance, SKU mặc định và placeholder local; bổ sung TC-42–TC-45, tách dữ liệu nguồn khỏi LIVE và định hướng AI |
| 1.3 | 16/10/2026 | Bổ sung COD/payOS, xác minh thanh toán qua webhook, trạng thái thanh toán theo phương thức và TC-46–TC-48 |
| 1.4 | 16/10/2026 | Bổ sung khôi phục mật khẩu và thông báo email; giới hạn quản trị catalog ở danh mục, không quản lý thương hiệu; TC-49–TC-50 |
| 1.5 | 16/10/2026 | Microservices/Saga/Kafka/Elasticsearch/Redis, monorepo, Compose/CI và AWS sau; API checkout bất đồng bộ, transaction local/outbox/inbox; TC-51–TC-52 |
| 1.6 | 16/10/2026 | Phương án choreography trước đây; Auth service; provider ảnh/CDN thay upload/lưu ảnh local |
| 1.7 | 16/10/2026 | Chốt orchestration tại Order, Saga step/result/retry bền vững và command/result Kafka; giữ Auth service, CDN và domain event cho subscriber |
| 1.8 | 16/10/2026 | Upload chuyển tiếp tới dịch vụ ảnh/CDN ngoài; backend không giữ file gốc, database chỉ lưu asset metadata/URL; cập nhật FR-ADM-03/UC-25/TC-28 |
| 1.9 | 16/10/2026 | Catalog đa ngành với danh mục cha–con, cấu hình thuộc tính, attributes Product/options SKU JSONB, ảnh chung/ảnh SKU, snapshot lựa chọn và cập nhật các tiêu chí nghiệm thu liên quan; giữ hợp đồng CSV RetailRocket |
| 1.10 | 17/10/2026 | Làm rõ hợp đồng upload ảnh/Cloudinary, retry và bảo toàn asset lịch sử |
