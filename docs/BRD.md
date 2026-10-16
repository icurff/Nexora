# BRD — Nexora

**Business Requirements Document / Tài liệu yêu cầu nghiệp vụ**

| Thông tin | Giá trị |
|---|---|
| Phiên bản | 1.10 |
| Ngày lập | 09/10/2026 |
| Cập nhật | 17/10/2026 |
| Trạng thái | Bản dự thảo để rà soát trước triển khai |
| Phạm vi | Ecommerce đa ngành chạy local, catalog synthetic từ RetailRocket, chuẩn bị tích hợp recommendation |
| Cơ sở | Yêu cầu web đã thống nhất và phần tiền xử lý trong tài liệu Build cùng hai notebook; catalog đa ngành, metadata demo và placeholder |
| Tài liệu liên quan | [SRS](SRS.md), [Kiến trúc microservices và monorepo](Folder-ARCHITECTURE.md), [Database baseline](DATABASE_DESIGN.md) |

## Mục lục

1. [Bối cảnh và vấn đề](#context)
2. [Mục tiêu và tiêu chí thành công](#objectives)
3. [Các bên liên quan](#stakeholders)
4. [Phạm vi](#scope)
5. [Yêu cầu nghiệp vụ](#requirements)
6. [Quy trình vận hành](#processes)
7. [Quy tắc nghiệp vụ](#rules)
8. [Dữ liệu và định hướng recommendation](#data)
9. [Giả định, phụ thuộc và giới hạn](#constraints)
10. [Nghiệm thu và quản lý thay đổi](#acceptance)

<a id="context"></a>
## 1. Bối cảnh và vấn đề

Nexora là đồ án ecommerce có định hướng tích hợp hệ thống gợi ý sản phẩm. Người phụ trách web triển khai frontend, backend, database, tracking và các điểm tích hợp. Phía AI phụ trách nghiên cứu, huấn luyện và cung cấp dịch vụ recommendation ở giai đoạn sau.

Tiến độ AI chưa sẵn sàng, vì vậy giai đoạn hiện tại phải tạo được một cửa hàng hoạt động độc lập. Website cần hoàn chỉnh luồng mua hàng COD, thanh toán trực tuyến qua payOS và vận hành của admin, đồng thời thu thập hành vi nhất quán để tránh phải thiết kế lại khi tích hợp AI.

Tại thời điểm cập nhật, workspace có frontend React + Vite và các bộ khung NestJS; thư mục media-service chưa có mã nguồn. Catalog demo dự kiến dựa trên dữ liệu RetailRocket. Các nghiệp vụ trong tài liệu này là yêu cầu cần triển khai, không phải xác nhận rằng hệ thống đã có các chức năng đó.

<a id="objectives"></a>
## 2. Mục tiêu và tiêu chí thành công

| Mã | Mục tiêu | Bằng chứng thành công |
|---|---|---|
| BO-01 | Hoàn thành hành trình mua hàng đa ngành | Khách đăng nhập, chọn sản phẩm/SKU, thêm giỏ, thanh toán COD hoặc payOS và theo dõi đơn |
| BO-02 | Cho phép admin vận hành cửa hàng | Admin quản lý catalog, tồn kho, đơn và tài khoản Customer |
| BO-03 | Đảm bảo tính đúng đắn của đơn và tồn | Không vượt tồn; không tạo đơn, giữ hàng hoặc hoàn tồn lặp do gửi lại thao tác |
| BO-04 | Chuẩn bị dữ liệu hành vi cho AI | Có event gắn khách/phiên, sản phẩm, SKU và ID RetailRocket khi có |
| BO-05 | Trình diễn độc lập trên local | Có hướng dẫn chạy, dữ liệu mẫu, tài khoản demo và luồng nghiệm thu một người |

Không đặt mục tiêu doanh số, lợi nhuận, tỷ lệ chuyển đổi hoặc độ chính xác GNN trong giai đoạn này. Việc giả lập gửi nhiều request để kiểm tra toàn vẹn dữ liệu không phải cam kết chịu tải nhiều người dùng.

<a id="stakeholders"></a>
## 3. Các bên liên quan

| Bên liên quan | Nhu cầu và trách nhiệm |
|---|---|
| Khách chưa đăng nhập | Duyệt, tìm sản phẩm, chọn SKU, đăng ký/đăng nhập; phải đăng nhập để thêm giỏ |
| Customer | Đặt hàng, quản lý hồ sơ/địa chỉ, theo dõi và hủy đơn đúng điều kiện |
| Admin | Quản lý sản phẩm đa ngành, thông số và lựa chọn SKU, danh mục cha–con, tồn, trạng thái đơn, Customer và dashboard |
| Người phát triển web | Xây dựng và kiểm thử frontend, backend, dữ liệu và tracking |
| Phía AI | Sử dụng dữ liệu tương tác và ánh xạ item; tích hợp model ở giai đoạn sau |
| Người đánh giá đồ án | Đối chiếu tài liệu với chức năng, dữ liệu và kịch bản demo |

Tác vụ tự hủy đơn hết hạn là hành vi của hệ thống, không phải một vai trò người dùng. Phiên bản này không có vai trò người bán độc lập, nhân viên kho hoặc shipper.

<a id="scope"></a>
## 4. Phạm vi

### 4.1. Trong phạm vi

- Một cửa hàng đa ngành, giao diện tiếng Việt, tiền VND, hỗ trợ màn hình desktop và điện thoại; tên sản phẩm/danh mục seed giữ nhãn tiếng Anh của notebook.
- Tài khoản tự quản lý bởi backend; Customer/Admin; đăng ký, đăng nhập, đăng xuất và đổi mật khẩu.
- Khôi phục mật khẩu qua email và email thông báo xác nhận đơn hàng, thanh toán và thay đổi trạng thái đơn.
- Catalog ban đầu 500 sản phẩm trên 23 danh mục hiển thị, chọn từ RetailRocket theo quota root category; tên, brand, giá, tồn và mô tả synthetic, ảnh placeholder theo danh mục.
- Danh mục có quan hệ cha–con do Admin quản lý; cấu hình thông số và lựa chọn SKU ngay trong danh mục. Không có chức năng quản lý thương hiệu; nhãn brand nếu có chỉ là metadata demo gắn với sản phẩm.
- Product có thông số chung; SKU có lựa chọn tùy ngành hàng như màu/cỡ/dung lượng. Tìm kiếm, lọc theo lựa chọn SKU, chi tiết sản phẩm, ảnh chung/ảnh SKU và trạng thái hết hàng.
- Giỏ hàng gắn với tài khoản Customer; yêu cầu đăng nhập để thêm, xem hoặc cập nhật giỏ và checkout theo dòng được chọn.
- Sổ địa chỉ với tỉnh/thành và đơn vị cấp xã từ bộ dữ liệu local.
- Đơn COD hoặc payOS, phí ship 30.000đ/đơn, giữ hàng, hủy đơn chưa thanh toán, hết hạn, giao thất bại và giao lại.
- Tạo liên kết thanh toán payOS và cập nhật tự động sau khi backend xác minh webhook hợp lệ; không dùng đường dẫn quay lại trình duyệt làm bằng chứng thanh toán.
- Quản trị catalog, upload ảnh, tồn kho, đơn, Customer và dashboard.
- Gửi email khôi phục mật khẩu và thông báo giao dịch/đơn hàng; không gửi SMS.
- Tracking hành vi và gợi ý tạm thời theo quy tắc.
- Frontend/backend chạy local; database lưu metadata media và URL CDN; Media Service riêng kiểm tra và upload ảnh lên Cloudinary, hệ thống không lưu file gốc riêng; kiểm thử các nghiệp vụ quan trọng.
- Monorepo React + Vite/NestJS; microservices với Saga orchestration tại Order, Kafka, Elasticsearch, Redis; Docker Compose là môi trường phát triển chính và CI kiểm tra repository. Chi tiết service/ownership tại [Architecture](Folder-ARCHITECTURE.md).

### 4.2. Ngoài phạm vi

- Wishlist/yêu thích và event liên quan.
- Xác minh email, đổi email, xác minh SMS, đăng nhập mạng xã hội hoặc Keycloak.
- Voucher, khuyến mại tự động, đánh giá sản phẩm và nút mua lại/thêm lại từ đơn cũ.
- Cổng thanh toán trực tuyến ngoài payOS, đối soát COD, hoàn tiền hoặc xuất hóa đơn thuế.
- Tích hợp hãng vận chuyển, tên hãng, mã vận đơn, tách kiện hoặc giao một phần đơn.
- Yêu cầu hủy của Customer sau xác nhận, sửa đơn trực tiếp, đổi/trả sau giao thành công.
- Quản lý hàng trả về bị hỏng, nhiều kho, nhà cung cấp hoặc quy trình mua hàng nhập kho.
- Giới hạn số đơn chờ xác nhận của một tài khoản.
- Module quản trị thuộc tính riêng, bảng màu/size/nhóm size dùng chung và mô hình EAV tổng quát. Chưa lọc khoảng số theo thông số Product hoặc tự chuyển đổi đơn vị thuộc tính.
- Huấn luyện, benchmark GNN, dịch vụ AI thật hoặc giả lập AI; triển khai public và kiểm thử tải nhiều người.
- Graph UI realtime, WebSocket/SSE và cập nhật gợi ý từ model là định hướng tích hợp sau, chưa phải điều kiện nghiệm thu bản web này.

<a id="requirements"></a>
## 5. Yêu cầu nghiệp vụ

| Mã | Yêu cầu | Mục tiêu |
|---|---|---|
| BREQ-01 | Quản lý danh tính và quyền Customer/Admin; bảo vệ dữ liệu của từng khách | BO-01, BO-02 |
| BREQ-02 | Tổ chức catalog đa ngành có SKU, giá, ảnh minh họa và trạng thái bán rõ ràng | BO-01, BO-02 |
| BREQ-03 | Duy trì giỏ theo tài khoản Customer; yêu cầu đăng nhập để thêm hoặc thao tác giỏ, cho chọn các dòng cần mua | BO-01 |
| BREQ-04 | Tạo đơn COD/payOS với địa chỉ hợp lệ, giá đã kiểm tra và tổng tiền xác định bởi hệ thống; tự xác minh thanh toán payOS | BO-01, BO-03 |
| BREQ-05 | Kiểm soát vòng đời đơn, hủy và tự hết hạn theo quyền/trạng thái | BO-02, BO-03 |
| BREQ-06 | Quản lý hàng trong kho, hàng đang giữ và hàng có thể bán theo SKU | BO-02, BO-03 |
| BREQ-07 | Cho phép admin vận hành catalog, đơn, Customer và tra cứu số liệu | BO-02 |
| BREQ-08 | Thu thập hành vi chính xác, phân biệt ý định đặt hàng và mua hàng hoàn tất | BO-04 |
| BREQ-09 | Giữ liên kết RetailRocket và điểm thay nguồn recommendation sau này | BO-04 |
| BREQ-10 | Bàn giao bản demo local có thể khởi động lại và nghiệm thu theo tài liệu | BO-05 |
| BREQ-11 | Hỗ trợ khôi phục mật khẩu và gửi thông báo về đơn hàng qua email | BO-01, BO-02 |

<a id="processes"></a>
## 6. Quy trình vận hành

### 6.1. Duyệt và mua hàng

1. Khách duyệt hoặc tìm sản phẩm; chọn các thuộc tính biến thể theo bất kỳ thứ tự nào nếu có nhiều SKU, ví dụ màu/cỡ hoặc màu/dung lượng. Catalog seed có một SKU mặc định không có lựa chọn, được chọn sẵn.
2. Hệ thống xác định SKU và tình trạng có thể mua. Nếu khách chưa đăng nhập chọn thêm giỏ, hệ thống yêu cầu đăng nhập rồi quay lại thao tác; sản phẩm chỉ được thêm sau khi xác thực thành công.
3. Customer chọn các dòng muốn mua. Checkout chỉ dành cho Customer đã đăng nhập.
4. Khách chọn/nhập địa chỉ, ghi chú, phương thức COD hoặc payOS và xem tổng tiền gồm tiền hàng cộng phí ship.
5. Hệ thống kiểm tra lại giỏ, giá, SKU, số có thể bán và địa chỉ.
6. Tạo một đơn chờ xác nhận, giữ hàng, ghi lịch sử và event; xóa các dòng vừa mua khỏi giỏ. Nếu chọn payOS, hệ thống tạo liên kết thanh toán cho đúng tổng tiền của đơn.
7. Với COD, khách trả khi nhận hàng. Với payOS, khách thanh toán qua liên kết; backend chỉ xác nhận đã trả sau khi xác minh webhook hợp lệ.
8. Khách xem mã đơn, trạng thái thanh toán và diễn biến trong tài khoản; hệ thống gửi email xác nhận đơn và email khi trạng thái đơn/thanh toán thay đổi.

Nếu một dòng không hợp lệ, chưa tạo toàn bộ đơn. Hệ thống không tự bỏ dòng lỗi hoặc thay số lượng rồi đặt phần còn lại. Khách cần kiểm tra và xác nhận lại.

### 6.2. Xác nhận và giao hàng

1. Admin kiểm tra đơn chờ và xác nhận trước hạn 24 giờ.
2. Khi bàn giao đi giao, admin chuyển đơn sang đang giao; hệ thống xuất kho các SKU và kết thúc phần giữ tương ứng.
3. Admin xác nhận giao thành công; với đơn COD, xác nhận đã thu tiền trong cùng thao tác. Hệ thống ghi nhận thanh toán cho COD đã thu hoặc payOS đã xác minh.
4. Nếu giao thất bại, admin ghi lý do. Có thể giao lại hoặc chờ hàng quay về.
5. Khi xác nhận đã nhận lại toàn bộ hàng nguyên vẹn, hệ thống nhập lại tồn và kết thúc đơn bằng trạng thái đã hủy.

Giao lại sau thất bại không xuất kho lần thứ hai. Báo thất bại chưa làm tăng hàng có thể bán.

### 6.3. Hủy và hết hạn

- Customer tự hủy khi đơn chờ xác nhận; Admin có thể hủy khi chờ hoặc đã xác nhận nhưng chưa giao.
- Đơn PENDING chưa thanh toán quá 24 giờ tự hủy với lý do hết hạn. Đơn đã thanh toán và đơn đã xác nhận không tự hết hạn theo mốc này.
- Chỉ hủy đơn chưa thanh toán trước giao; giải phóng hàng đang giữ. Đơn payOS đã thanh toán không được hủy trong phạm vi hiện tại vì chưa có nghiệp vụ hoàn tiền.
- Backend dừng rồi khởi động lại phải xử lý các đơn đã quá hạn. Đơn tới hạn không còn được xác nhận dù tác vụ nền chưa xử lý xong.
- Đơn hủy không được mở lại; không tự đưa sản phẩm vào giỏ. Khách muốn mua tiếp tự mở sản phẩm và thêm giỏ.

### 6.4. Quản lý catalog và tồn

Admin tạo nháp, bổ sung nội dung/ảnh/SKU rồi mở bán. Ảnh được upload qua Media Service lên Cloudinary, sau đó Catalog gắn asset đã sẵn sàng vào Product/SKU. Thay hoặc gỡ liên kết ảnh không xóa asset cũ đang phục vụ lịch sử đơn; bản đầu chưa cung cấp xóa vật lý asset. Mở bán không bắt buộc có tồn dương, nhưng phải có ít nhất một SKU hợp lệ. Đổi giá và ngừng bán ảnh hưởng giao dịch mới, không thay đổi thông tin đã chụp trong đơn.

Thông số chung như chất liệu/hệ điều hành mô tả Product; các lựa chọn phân biệt mặt hàng có giá/tồn riêng nằm trên SKU. Không ép mọi sản phẩm có màu và size. Sản phẩm không có biến thể có một SKU mặc định. Danh mục quy định các mã thuộc tính được phép, không kế thừa cấu hình từ cha trong bản đầu. Đổi cấu hình/danh mục phải giữ dữ liệu đang bán hợp lệ; cây danh mục không được có chu trình.

Nhập hàng/điều chỉnh kiểm kê có lý do và lịch sử. Nếu lượng hàng thực tế thấp hơn số đang giữ, admin phải xử lý các đơn liên quan trước khi hoàn tất điều chỉnh làm số có thể bán âm.

<a id="rules"></a>
## 7. Quy tắc nghiệp vụ

| Mã | Quy tắc |
|---|---|
| BR-01 | Đăng ký tạo Customer; Admin được tạo bằng seed, không qua đăng ký công khai |
| BR-02 | Nhiều phiên đăng nhập được phép; logout kết thúc phiên hiện tại, đổi mật khẩu kết thúc tất cả phiên |
| BR-03 | Đăng ký không yêu cầu email xác minh; email đăng nhập không được sửa trong phiên bản này |
| BR-03a | Email được dùng để khôi phục mật khẩu và gửi xác nhận/thay đổi trạng thái đơn; lỗi gửi email không được làm sai trạng thái đơn |
| BR-04 | Một Product có các SKU duy nhất theo tổ hợp lựa chọn đã chuẩn hóa; SKU đang bán cùng Product dùng cùng tập mã lựa chọn. Không có biến thể thì một SKU options rỗng; mã SKU tự sinh, duy nhất toàn catalog và bất biến |
| BR-05 | SKU đã có reservation/đơn được chấp nhận không được đổi ý nghĩa lựa chọn; bản chụp mã, nhãn và giá trị lựa chọn trong đơn không đổi theo catalog |
| BR-06 | Chỉ Customer đã đăng nhập mới có thể xem hoặc sửa giỏ; thêm giỏ không giữ hàng/giá |
| BR-07 | Checkout theo dòng chọn; mọi dòng phải hợp lệ; Customer phải đăng nhập và đang hoạt động |
| BR-08 | Giá, số lượng, địa chỉ và phí ship được kiểm tra phía server; tiền là số nguyên VND; ship 30.000đ/đơn |
| BR-09 | Tạo đơn giữ hàng ngay; một đơn được giao toàn bộ; không giới hạn số đơn chờ mỗi Customer |
| BR-10 | Có thể bán = hàng trong kho − hàng đang giữ; các đại lượng không được âm |
| BR-11 | Customer chỉ hủy PENDING UNPAID; Admin chỉ hủy đơn UNPAID trước giao có lý do; không sửa trực tiếp đơn |
| BR-12 | PENDING UNPAID hết hạn sau 24 giờ; PENDING PAID không tự hết hạn; CONFIRMED không hết hạn theo quy tắc này |
| BR-13 | Mỗi thay đổi trạng thái có lịch sử; gửi lại/xung đột chỉ tạo một hiệu ứng nghiệp vụ hợp lệ |
| BR-14 | Giao thất bại chưa hoàn tồn; xác nhận nhận lại toàn bộ hàng nguyên vẹn mới nhập lại tồn |
| BR-15 | DELIVERED và CANCELLED kết thúc đơn; không đổi trả, mở lại hoặc mua lại tự động |
| BR-16 | COD chỉ PAID khi Admin xác nhận đã thu lúc giao; payOS chỉ PAID khi webhook hợp lệ được xác minh; ghi nhận thanh toán không lặp khi webhook gửi lại |
| BR-17 | Hồ sơ/sổ địa chỉ và thông tin người nhận trong đơn độc lập; địa chỉ mới chỉ lưu vào sổ nếu khách chọn |
| BR-18 | Hết hàng vẫn hiển thị trong catalog; nháp/ngừng bán không xuất hiện trong danh sách công khai |
| BR-19 | Khóa Customer chặn thao tác tài khoản, không tự hủy các đơn đã có |
| BR-20 | Tên danh mục, tên sản phẩm, nhãn brand dạng metadata, giá, tồn, mô tả và ảnh placeholder là dữ liệu demo; Admin chỉ quản lý danh mục, không quản lý brand; không suy ra ngữ nghĩa thật của item/category RetailRocket hoặc dùng làm bằng chứng chất lượng AI |
| BR-21 | Doanh thu ghi theo thời điểm xác nhận thu COD hoặc xác minh payOS thành công; tiền hàng và phí ship hiển thị riêng |
| BR-22 | Lọc các lựa chọn/giá/còn hàng phải khớp trong cùng một SKU; cùng mã dùng OR, giữa các mã dùng AND. Lọc danh mục gồm danh mục đó và các danh mục con |
| BR-23 | Catalog seed giữ đúng 500 source_item_id duy nhất và quota 23 root từ artifact đã đóng băng; seed lại không chọn lại item hoặc ghi đè thay đổi Admin |
| BR-24 | Catalog seed không có thông số/lựa chọn nguồn: Product có attributes rỗng và một SKU options rỗng; không tự bịa thuộc tính thật hoặc nhân tồn stock của CSV sang nhiều SKU |
| BR-25 | Thống kê interactions/users của RetailRocket là dữ liệu lịch sử nguồn, không cộng vào hành vi LIVE hoặc dashboard kinh doanh của website |

### Bảng biến động tồn

| Sự kiện | Hàng trong kho | Đang giữ | Có thể bán |
|---|---:|---:|---:|
| Thêm giỏ | Không đổi | Không đổi | Không đổi |
| Tạo đơn số lượng q | Không đổi | +q | −q |
| Hủy/hết hạn trước giao | Không đổi | −q | +q |
| Chuyển giao lần đầu | −q | −q | Không đổi |
| Giao thành công, thất bại hoặc giao lại | Không đổi | Không đổi | Không đổi |
| Nhận lại hàng giao thất bại | +q | Không đổi | +q |

<a id="data"></a>
## 8. Dữ liệu và định hướng recommendation

### 8.1. Nguồn và cách chọn catalog

Hai notebook đọc ba tập đã clean là events, category tree và item properties; chúng không chứa quy trình làm sạch dữ liệu raw. Kết quả lưu trong notebook ghi nhận 2.755.641 event, 1.407.580 visitor và 235.061 item có event; view chiếm 96,68%, addtocart 2,50%, transaction 0,81%. Đây là số liệu dữ liệu nguồn, không phải số liệu vận hành web hay kết quả chạy lại trong lần cập nhật tài liệu.

Notebook Build lấy category mới nhất theo timestamp cho từng item trước khi ghép. Trong 235.061 item có event, 49.815 item thiếu category bị loại khỏi tập chọn demo; còn 185.246 item thuộc 23 root có tương tác trong tổng 25 root. Loại khỏi demo không đồng nghĩa loại khỏi dữ liệu training. Phép merge category lịch sử trong EDA làm số dòng tăng lên 5.899.105, vì vậy không dùng bảng xếp hạng category đó để phân bổ catalog.

Mỗi root được quota ban đầu min(5, số item của root). Phần còn lại để đủ 500 được phân bổ theo căn bậc hai tổng interaction của root, có giới hạn sức chứa; phần dư làm tròn ưu tiên root có tổng interaction cao. Trong từng root, chọn theo interactions giảm dần rồi users giảm dần, tính trên cả view/addtocart/transaction. Artifact đã xuất được đóng băng vì notebook chưa quy định khóa phân xử khi hòa hoàn toàn. Cách chọn này phục vụ catalog demo đa dạng, không phải chia train/test hoặc đánh giá model.

### 8.2. Bộ dữ liệu bàn giao và metadata

| Artifact | Kết quả lưu trong notebook | Vai trò |
|---|---|---|
| products_demo.csv | 500 dòng, 14 cột | Product nguồn, source_item_id, SKU nguồn, metadata synthetic, giá/tồn và thống kê lịch sử |
| categories_demo.csv | 23 dòng, 3 cột | Mã danh mục seed, root_categoryid và tên hiển thị |
| category_mapping.csv | 1.664 dòng, 4 cột | Category nguồn → root → danh mục seed; chỉ gồm các root được chọn |

23 tên danh mục như Electronics, Fashion, Gaming được gán để minh họa theo thứ tự root, không phải giải mã danh mục RetailRocket. Metadata dùng random seed 42; ảnh là placeholder theo danh mục. Website ghi rõ dữ liệu minh họa; ảnh seed được upload qua Media Service lên Cloudinary và đọc qua CDN, cần kết nối mạng khi chưa có cache. H&M không còn là đầu vào bắt buộc. Placeholder hợp lệ được chấp nhận cho catalog demo này; URL có giá trị nhưng chưa tải được ảnh không đủ điều kiện nghiệm thu.

ID Product trong database, product_id của CSV và source_item_id của RetailRocket phải phân biệt. SKU NXR của CSV được lưu như mã nguồn; SKU vận hành vẫn do hệ thống sinh. Một Product seed có attributes rỗng và một SKU options rỗng, giá và tổng tồn lấy đúng CSV. 23 danh mục seed ban đầu là danh mục gốc, chưa có cấu hình thuộc tính; Admin có thể tạo cây và cấu hình sau. Chuyển sang nhiều biến thể phải ngừng bán SKU mặc định và quản lý tồn từng SKU riêng. Sản phẩm mới chưa có ID RetailRocket vẫn được bán và dùng gợi ý theo quy tắc.

### 8.3. Hành vi website và hướng tích hợp AI

Tracking ghi view, search, thêm/giảm giỏ, tạo đơn, mua hoàn tất, hiển thị/click gợi ý. Không tin yêu cầu từ client để ghi sự kiện mua hoàn tất. Dữ liệu xuất cho AI không chứa email, điện thoại hoặc địa chỉ nhận hàng.

Gợi ý giai đoạn này dùng quy tắc như cùng danh mục hoặc mức độ quan tâm trên website, có nhãn đúng với nguồn thực tế. Khả năng thích ứng/model GNN và chất lượng recommendation không thuộc tiêu chí hoàn thành ecommerce.

Định hướng sau là huấn luyện offline trên dữ liệu RetailRocket clean, ánh xạ ID liên tục và chia tập theo thời gian, rồi giới hạn ứng viên về catalog demo qua source_item_id. Các cạnh VIEW/ADD_TO_CART/PURCHASE tương ứng view/addtocart/transaction; order_created chưa phải PURCHASE. Graph realtime và cập nhật trạng thái user/session cần hợp đồng riêng khi triển khai. Hai notebook hiện tại chưa thực hiện các bước training, temporal split, graph hoặc tích hợp realtime này; category mới nhất toàn kỳ chỉ phục vụ catalog, không mặc nhiên dùng làm feature quá khứ vì có nguy cơ rò rỉ thông tin tương lai.

<a id="constraints"></a>
## 9. Giả định, phụ thuộc và giới hạn

| Mã | Nội dung | Ảnh hưởng |
|---|---|---|
| A-01 | Demo một người trên local | Không cam kết tải đồng thời hoặc SLA production |
| A-02 | Một cửa hàng, một kho logic; hàng nhận về nguyên vẹn | Không quản lý chia kho, hàng hỏng hoặc nhận lại một phần |
| A-03 | Có cấu hình dịch vụ gửi email; không tích hợp SMS và không xác minh email đăng ký | Khôi phục mật khẩu và email thông báo phụ thuộc cấu hình nhà cung cấp email |
| A-04 | Không tích hợp vận chuyển | Admin cập nhật thủ công thông tin giao hàng và xác nhận thu COD |
| A-05 | Cần ba CSV đã xuất, manifest có version/checksum, ảnh placeholder đã upload CDN và snapshot địa giới | Output lưu trong notebook chưa thay thế artifact thực để seed/nghiệm thu |
| A-06 | RetailRocket là nguồn training của phía AI | Metadata synthetic chỉ phục vụ trình diễn; không diễn giải sai nguồn học |
| A-07 | Thời gian xử lý nền phụ thuộc backend hoạt động | Có xử lý bù khi khởi động lại và chặn xác nhận đơn đã tới hạn |
| A-08 | React + Vite, NestJS microservices, PostgreSQL theo service, Kafka, Elasticsearch, Redis; phát triển qua Docker Compose; bảy service backend gồm Auth, Catalog, Media, Order, Payment, Notification, Recommendation; cấu hình payOS/email/Cloudinary tại service sở hữu | Order orchestrator phối hợp transaction local bằng command/result Kafka; search/cache có thể đồng bộ trễ và không quyết định stock/payment |
| A-09 | CI thực hiện ở giai đoạn local; CD lên AWS là lộ trình sau khi demo ổn định | Chưa cần triển khai backend lên AWS để nghiệm thu local; Media Service cần tài khoản/credential Cloudinary được cấu hình, triển khai AWS có pipeline riêng |

Không có email xác minh và không giới hạn số đơn chờ là lựa chọn phạm vi đã chốt. Khôi phục mật khẩu và email thông báo đơn hàng thuộc phạm vi; SRS không được tự bổ sung xác minh/đổi email trong quá trình triển khai.

<a id="acceptance"></a>
## 10. Nghiệm thu và quản lý thay đổi

### 10.1. Điều kiện nghiệm thu nghiệp vụ

- Có 500 sản phẩm, 23 danh mục và mapping nguồn nhất quán; đủ metadata demo, ảnh placeholder qua CDN và nhãn minh họa; mỗi Product có một SKU mặc định khi seed lần đầu.
- Đúng quota từ artifact đóng băng; seed lại không nhân đôi hoặc ghi đè giá/tồn/nội dung Admin; thống kê RetailRocket không làm tăng event LIVE hoặc doanh thu.
- Hoàn thành luồng khách vãng lai duyệt catalog → đăng nhập → thêm giỏ → chọn COD/payOS → xác nhận thanh toán phù hợp → giao hàng → Customer xem đơn.
- Chạy được các nhánh khách hủy, đơn hết hạn, admin hủy, giao thất bại/giao lại và nhận hàng về.
- Tồn, thanh toán, event và dashboard phản ánh đúng trạng thái đơn.
- COD ghi nhận khi Admin xác nhận đã thu; payOS tự xác nhận qua webhook đã kiểm tra chữ ký, không ghi lặp khi webhook gửi lại.
- Khôi phục mật khẩu gửi liên kết dùng một lần qua email; thông báo đơn được gửi theo trạng thái mà không làm gián đoạn cập nhật nghiệp vụ khi nhà cung cấp email lỗi.
- Upload ảnh qua Media Service lên Cloudinary, lưu metadata và liên kết đúng service; lỗi upload không mở bán với ảnh chưa sẵn sàng, retry không tạo asset trùng; không lộ credential Cloudinary.
- Customer không truy cập được dữ liệu của khách khác hoặc chức năng quản trị.
- Có hướng dẫn chạy, seed, tài khoản demo và bằng chứng kiểm thử theo SRS.
- Database giữ sau restart; asset CDN và metadata không mất khi container khởi động lại; chức năng email hoạt động với cấu hình nhà cung cấp hợp lệ và có thông báo lỗi/thử lại khi dịch vụ không sẵn sàng.

### 10.2. Quản lý thay đổi

SRS diễn giải BRD thành yêu cầu có thể kiểm tra. Nếu thay đổi phạm vi, quyền, trạng thái đơn, giá/phí hoặc cách giữ/hoàn tồn, cập nhật đồng thời BRD, SRS và ca nghiệm thu liên quan. Lựa chọn kỹ thuật không được âm thầm thay đổi quy tắc nghiệp vụ.

Tài liệu này ghi nhận nội dung đã thống nhất trong trao đổi; trạng thái Draft không phải biên bản nghiệm thu phần mềm hoặc xác nhận đã triển khai.

Bản cập nhật 1.1 ngày 10/10/2026 đồng bộ quyết định màu/size nhập trực tiếp và mã SKU tự sinh. Chi tiết bảng, snapshot dạng cột và giữ hàng theo dòng đơn nằm trong [Thiết kế database](DATABASE_DESIGN.md).

Bản cập nhật 1.4 ngày 16/10/2026 đưa khôi phục mật khẩu và thông báo đơn hàng qua email vào phạm vi, đồng thời giới hạn quản trị catalog ở danh mục; nhãn brand chỉ là metadata demo. Bản cập nhật 1.3 bổ sung payOS bên cạnh COD; thanh toán payOS được xác nhận tự động bằng webhook đã xác minh. Bản cập nhật 1.2 ngày 11/10/2026 chuyển catalog sang đa ngành theo notebook, chấp nhận metadata synthetic/placeholder, cập nhật quota theo root, hợp đồng CSV và truy vết nguồn.

Bản cập nhật 1.5 ngày 16/10/2026 xác định monorepo microservices, Kafka, Elasticsearch, Redis, CI và lộ trình CD lên AWS. Phương án orchestration của phiên bản này được thay bằng choreography ở bản 1.6; thiết kế hiện tại tại [Architecture](Folder-ARCHITECTURE.md).

### 10.3. Nguồn tham khảo

- [RetailRocket dataset](https://www.kaggle.com/datasets/retailrocket/ecommerce-dataset): nguồn item và lịch sử hành vi phục vụ AI.
- [Build Demo Catalog](../Data/Build_Demo_Catalog.docx): giải thích tiền xử lý và định hướng AI.
- [Notebook Build](../Data/Build_Demo_Catalog.ipynb): thuật toán chọn quota, metadata và schema CSV thực tế; là chuẩn cho hợp đồng catalog khi ví dụ trong Word khác mã nguồn.
- [Notebook EDA](../Data/EDA_Exploratory_Data_Analysis.ipynb): phân bố hành vi và giới hạn phép ghép category lịch sử.
- [Danh mục đơn vị hành chính — Cục Thống kê](https://danhmuchanhchinh.nso.gov.vn/Default.aspx): đối chiếu snapshot địa giới.
- [Quyết định 19/2025/QĐ-TTg](https://chinhphu.vn/?docid=214409&pageid=27160): tài liệu nền về danh mục/mã đơn vị hành chính; khi seed phải ghi phiên bản và đối chiếu các cập nhật.

Bản cập nhật 1.6 ngày 16/10/2026 thay phương án điều phối tập trung của bản 1.5 bằng Saga choreography; đổi tên Auth service; media được upload qua provider và phân phối CDN ngay trong môi trường phát triển local.

Bản cập nhật 1.7 ngày 16/10/2026 chốt lại Saga orchestration tại Order cho checkout và vòng đời đơn/tồn/payment; giữ tên Auth service và thiết kế media provider/CDN của bản 1.6. Các subscriber email/search/tracking tiếp tục xử lý domain event sau commit.

Bản cập nhật 1.8 ngày 16/10/2026 làm rõ media/CDN là dịch vụ bên ngoài; Nexora chỉ lưu metadata/URL và không giữ file gốc trên server, volume hoặc database.

Bản cập nhật 1.9 ngày 16/10/2026 chốt catalog đa ngành: danh mục cha–con, thông số Product, lựa chọn SKU linh hoạt, ảnh chung/ảnh SKU và snapshot lựa chọn. Giữ dataset RetailRocket và hợp đồng ba CSV; các tên ngành hàng seed vẫn là nhãn minh họa tự gán.

Bản cập nhật 1.10 ngày 17/10/2026 bổ sung Media Service độc lập với media_db và chốt Cloudinary làm nhà cung cấp upload/CDN. Catalog giữ liên kết ảnh Product/SKU; cập nhật tiêu chí upload, retry và bảo toàn ảnh lịch sử. Chi tiết tại [Media Service](Folder-ARCHITECTURE.md#media-service).
