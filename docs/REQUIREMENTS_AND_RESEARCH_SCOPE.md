# Xác định yêu cầu chức năng, phi chức năng và phạm vi nghiên cứu

Nexora là hệ thống thương mại điện tử bán lẻ đa ngành theo mô hình doanh nghiệp bán hàng trực tiếp cho người tiêu dùng (B2C), định hướng tích hợp hệ thống gợi ý sản phẩm dựa trên mạng nơ-ron đồ thị (Graph Neural Network — GNN). Hệ thống được xây dựng nhằm hỗ trợ các hoạt động mua sắm trực tuyến, đồng thời nghiên cứu khả năng cá nhân hóa sản phẩm đề xuất thông qua dữ liệu hành vi người dùng. Bên cạnh chất lượng gợi ý, đề tài quan tâm đến khả năng thích ứng với tương tác mới trong phiên truy cập và cung cấp thông tin giải thích cho các đề xuất.

Trên cơ sở mục tiêu của đề tài, yêu cầu hệ thống được xác định thành hai nhóm: yêu cầu chức năng và yêu cầu phi chức năng. Phạm vi nghiên cứu được giới hạn phù hợp với dữ liệu RetailRocket, mô hình kinh doanh của Nexora và điều kiện thực hiện đồ án.

Cập nhật ngày 20/10/2026: module ảnh/Cloudinary thuộc Catalog; Recommendation triển khai sau bằng Python/FastAPI. Stack hiện tại chỉ có Gateway, năm service NestJS, frontend và PostgreSQL.

## 1. Yêu cầu chức năng

### 1.1. Các tác nhân của hệ thống

Hệ thống phục vụ ba nhóm tác nhân chính, bao gồm khách truy cập, khách hàng đã đăng ký và quản trị viên. Chức năng của từng nhóm được xác định theo nhu cầu sử dụng và quyền truy cập tương ứng.

| Tác nhân | Mô tả | Nhu cầu sử dụng chính |
|---|---|---|
| Khách truy cập | Người sử dụng chưa đăng nhập vào hệ thống | Xem và tìm kiếm sản phẩm, tham khảo gợi ý, đăng ký và đăng nhập |
| Khách hàng | Người sử dụng đã có tài khoản hợp lệ | Quản lý thông tin cá nhân, địa chỉ nhận hàng, đặt hàng, theo dõi đơn hàng và nhận gợi ý sản phẩm |
| Quản trị viên | Người chịu trách nhiệm quản lý hoạt động của cửa hàng | Quản lý sản phẩm, danh mục, tồn kho, đơn hàng, tài khoản khách hàng và theo dõi số liệu kinh doanh; không quản lý thương hiệu |

### 1.2. Chức năng dành cho khách hàng

#### 1.2.1. Đăng ký, đăng nhập và quản lý tài khoản

Hệ thống cho phép người dùng đăng ký tài khoản, đăng nhập, đăng xuất và thay đổi mật khẩu. Khách hàng có thể xem, cập nhật thông tin cá nhân và quản lý các địa chỉ nhận hàng. Việc truy cập thông tin tài khoản, địa chỉ và đơn hàng phải được giới hạn theo quyền sở hữu của từng khách hàng.

#### 1.2.2. Tra cứu và xem thông tin sản phẩm

Người dùng có thể xem danh sách sản phẩm, tìm kiếm theo tên, lọc theo danh mục, khoảng giá, thuộc tính biến thể và tình trạng còn hàng. Hệ thống hỗ trợ sắp xếp kết quả để thuận tiện cho việc lựa chọn. Trang chi tiết sản phẩm cung cấp tên, hình ảnh, mô tả, giá bán, các lựa chọn biến thể và tình trạng cung ứng.

Đối với sản phẩm có nhiều biến thể, người dùng chọn các thuộc tính phù hợp theo ngành hàng, ví dụ màu/cỡ với quần áo, màu/dung lượng với điện thoại hoặc dung tích với đồ gia dụng. Thông số chung của sản phẩm được phân biệt với các lựa chọn tạo SKU có giá và tồn riêng. Sản phẩm không có biến thể sử dụng một SKU mặc định không có lựa chọn. Thông tin và ảnh hiển thị phải phản ánh đúng SKU được chọn, dùng ảnh chung nếu SKU không có ảnh riêng.

#### 1.2.3. Quản lý giỏ hàng

Hệ thống cho phép thêm sản phẩm vào giỏ, thay đổi số lượng, xóa sản phẩm và lựa chọn các mặt hàng cần thanh toán. Giỏ hàng hiển thị giá hiện tại, số lượng và tổng tiền tạm tính, đồng thời thông báo khi sản phẩm thay đổi giá, hết hàng hoặc ngừng kinh doanh.

Người dùng cần đăng nhập bằng tài khoản Customer đang hoạt động để xem và thao tác với giỏ hàng. Nếu khách chưa đăng nhập chọn thêm sản phẩm, hệ thống yêu cầu đăng nhập trước khi tiếp tục; sau khi đăng nhập, khách có thể thêm sản phẩm vào giỏ tài khoản. Việc thêm sản phẩm vào giỏ không đồng nghĩa với việc sản phẩm đã được giữ để bán.

#### 1.2.4. Đặt hàng và theo dõi đơn hàng

Khách hàng đã đăng nhập có thể đặt mua các sản phẩm được lựa chọn, cung cấp địa chỉ nhận hàng và kiểm tra tổng giá trị đơn trước khi xác nhận. Trong phạm vi đề tài, hệ thống hỗ trợ thanh toán khi nhận hàng (COD) và thanh toán trực tuyến qua payOS. Với payOS, hệ thống tạo liên kết thanh toán và tự cập nhật trạng thái khi xác minh webhook thanh toán thành công.

Sau khi đặt hàng, khách hàng có thể xem lịch sử mua hàng, chi tiết sản phẩm đã đặt, tổng tiền, phương thức thanh toán và trạng thái xử lý đơn. Khách hàng được hủy đơn chưa thanh toán khi đơn còn ở trạng thái chờ xác nhận. Hệ thống phải bảo đảm thông tin của đơn hàng đã tạo không bị thay đổi theo các lần cập nhật sản phẩm hoặc địa chỉ sau đó.

#### 1.2.5. Tiếp nhận gợi ý sản phẩm

Hệ thống cung cấp danh sách sản phẩm gợi ý tại các vị trí phù hợp trong hành trình mua sắm. Nội dung gợi ý được định hướng cá nhân hóa dựa trên lịch sử tương tác và hành vi gần đây của người dùng, đồng thời hỗ trợ đề xuất sản phẩm liên quan đến sản phẩm đang được quan tâm.

Đối với người dùng mới hoặc trường hợp chưa có đủ dữ liệu, hệ thống sử dụng phương án gợi ý thay thế, chẳng hạn sản phẩm phổ biến hoặc sản phẩm phù hợp với ngữ cảnh truy cập. Các sản phẩm được đề xuất phải đáp ứng điều kiện hiển thị và kinh doanh của cửa hàng.

### 1.3. Chức năng dành cho quản trị viên

| Nhóm chức năng | Nội dung yêu cầu |
|---|---|
| Quản lý sản phẩm | Thêm, cập nhật nội dung/thông số chung, hình ảnh, lựa chọn SKU có giá/tồn riêng và trạng thái kinh doanh |
| Quản lý hình ảnh | Upload ảnh qua module ảnh Catalog lên Cloudinary; gắn asset sẵn sàng vào Product/SKU, chọn ảnh đại diện và giữ ảnh lịch sử khi thay/gỡ liên kết |
| Quản lý danh mục | Tổ chức danh mục cha–con và cấu hình thông số/lựa chọn theo ngành hàng trong cùng form; không có quản lý thương hiệu hoặc module thuộc tính riêng |
| Quản lý tồn kho | Theo dõi số lượng hàng trong kho, số lượng đang giữ cho đơn hàng và số lượng có thể bán; ghi nhận nhập hàng, điều chỉnh tồn kho |
| Quản lý đơn hàng | Tra cứu, xác nhận, hủy đơn theo điều kiện; cập nhật quá trình giao hàng, kết quả giao và tình trạng thanh toán COD/payOS |
| Quản lý khách hàng | Tra cứu thông tin cần thiết cho hoạt động bán hàng; khóa hoặc mở tài khoản khách hàng |
| Thống kê hoạt động | Theo dõi số lượng đơn hàng, tình trạng xử lý, tiền đã thu và tình hình tồn kho |

Các thao tác quản trị có ảnh hưởng đến đơn hàng, tồn kho hoặc tài khoản phải được lưu lại để phục vụ việc tra cứu. Số liệu thống kê kinh doanh được xác định từ hoạt động thực tế của website, tách biệt với dữ liệu lịch sử dùng để nghiên cứu mô hình gợi ý.

### 1.4. Chức năng xử lý nghiệp vụ tự động

Hệ thống kiểm tra giá bán, trạng thái kinh doanh và số lượng có thể bán trước khi chấp nhận đơn hàng. Khi đặt hàng thành công, số lượng tương ứng được giữ cho đơn; khi đơn bị hủy theo điều kiện hợp lệ, phần hàng đang giữ được giải phóng. Đơn chờ xác nhận quá 24 giờ được tự động hủy.

Hệ thống cần ngăn việc tạo nhiều đơn hoặc cập nhật tồn kho nhiều lần do cùng một thao tác được gửi lại. Trường hợp giao hàng thất bại, giao lại hoặc nhận hàng quay về phải được xử lý phù hợp, tránh ghi nhận xuất kho hoặc hoàn tồn trùng lặp. Giao dịch mua hoàn tất chỉ được ghi nhận khi COD đã được xác nhận lúc giao hàng hoặc payOS đã được xác minh thanh toán thành công.

### 1.5. Chức năng thu thập hành vi và gợi ý thông minh

| Nhóm chức năng | Nội dung yêu cầu |
|---|---|
| Thu thập hành vi | Ghi nhận hoạt động xem, tìm kiếm, thêm hoặc giảm giỏ hàng, tạo đơn, mua hàng hoàn tất và tương tác với danh sách gợi ý |
| Liên kết ngữ cảnh | Gắn tương tác với sản phẩm, người dùng hoặc khách truy cập, phiên sử dụng và thời điểm xảy ra |
| Cá nhân hóa bằng GNN | Khai thác quan hệ tương tác giữa người dùng và sản phẩm để học biểu diễn và tạo danh sách sản phẩm được xếp hạng |
| Thích ứng theo phiên | Sử dụng những tương tác gần đây để điều chỉnh thứ hạng sản phẩm theo mối quan tâm hiện tại của người dùng |
| Giải thích đề xuất | Cung cấp lý do ngắn gọn có căn cứ từ dữ liệu tương tác hoặc quan hệ được sử dụng trong quá trình gợi ý |
| Xử lý thiếu dữ liệu | Duy trì khả năng đề xuất cho người dùng mới, sản phẩm mới hoặc trường hợp mô hình chưa đủ thông tin |

Việc giải thích phải phù hợp với nguồn dữ liệu và phương pháp gợi ý thực tế. Hệ thống không được trình bày kết quả từ quy tắc thay thế như kết quả cá nhân hóa của GNN. Các chức năng GNN, thích ứng theo phiên và giải thích là mục tiêu nghiên cứu, tích hợp của đề tài; không mặc định đã hoàn thành ở giai đoạn xây dựng các chức năng thương mại điện tử cơ bản.

## 2. Yêu cầu phi chức năng

### 2.1. Hiệu năng và khả năng phản hồi

Hệ thống cần có thời gian phản hồi phù hợp để bảo đảm trải nghiệm mua sắm và khả năng tích hợp gợi ý trực tiếp trên giao diện. Các mục tiêu hiệu năng dự kiến của đề tài gồm:

| Nội dung | Mục tiêu dự kiến |
|---|---|
| Các thao tác thương mại điện tử thông thường | Hướng đến thời gian phản hồi không quá 1 giây trong điều kiện thử nghiệm |
| Truy vấn gợi ý sản phẩm | Hướng đến thời gian trả kết quả không quá 5 giây |
| Ghi nhận và chuyển tiếp tương tác mới | Hướng đến độ trễ không quá 2 giây để phục vụ cập nhật trạng thái người dùng hoặc phiên |

Các mốc trên là mục tiêu đánh giá, chưa phải kết quả thực nghiệm. Việc đánh giá cần nêu rõ cấu hình máy, quy mô dữ liệu, số người dùng mô phỏng và cách đo. Kết quả phản hồi được báo cáo theo phân bố độ trễ và tỷ lệ lỗi để phản ánh điều kiện thử nghiệm thực tế.

Khả năng đáp ứng theo thời gian thực trong đề tài được giới hạn ở mức gần thời gian thực: tương tác mới được ghi nhận và sử dụng để điều chỉnh các lần gợi ý tiếp theo. Hệ thống không yêu cầu huấn luyện lại toàn bộ mô hình sau mỗi hành vi của người dùng.

### 2.2. Bảo mật và phân quyền

Hệ thống phải xác thực người dùng trước khi cho phép truy cập các chức năng yêu cầu đăng nhập và phân biệt quyền của khách hàng với quản trị viên. Mật khẩu được lưu dưới dạng băm an toàn. Thông tin xác thực và dữ liệu nhạy cảm không được công khai qua giao diện, phản hồi lỗi hoặc nhật ký hệ thống.

Khách hàng chỉ được truy cập thông tin cá nhân và đơn hàng thuộc quyền sở hữu của mình. Các yêu cầu thay đổi dữ liệu phải được kiểm tra tính hợp lệ tại phía máy chủ. Tài khoản bị khóa hoặc phiên đã bị thu hồi không được tiếp tục thực hiện các chức năng yêu cầu xác thực.

### 2.3. Tính chính xác và nhất quán dữ liệu

Thông tin giá bán, số lượng, tổng tiền và trạng thái đơn hàng phải được xử lý chính xác. Hệ thống không được bán vượt số lượng có thể cung ứng, ghi nhận tồn kho âm hoặc tạo thêm giao dịch do thao tác bị lặp. Lịch sử đơn hàng phải được bảo toàn để phản ánh thông tin tại thời điểm mua.

Do hệ thống định hướng sử dụng kiến trúc microservices, dữ liệu trao đổi giữa các dịch vụ cần được kiểm soát để hạn chế sai lệch khi xảy ra gián đoạn. Các nghiệp vụ trọng yếu như tạo đơn và giữ hàng phải bảo đảm tính nhất quán; dữ liệu hành vi phục vụ gợi ý có thể được đồng bộ sau với độ trễ phù hợp.

### 2.4. Độ tin cậy và khả năng phục hồi

Hệ thống cần duy trì các chức năng mua sắm cơ bản khi dịch vụ gợi ý không khả dụng. Trong trường hợp này, hệ thống sử dụng phương án gợi ý thay thế hoặc thông báo phù hợp mà không làm gián đoạn việc xem và đặt mua sản phẩm.

Dữ liệu nghiệp vụ đã được ghi nhận phải được bảo toàn sau khi dịch vụ khởi động lại. Các tương tác nghiệp vụ chưa chuyển tiếp thành công cần có khả năng được xử lý tiếp sau khi kết nối phục hồi. Lỗi hệ thống phải được ghi nhận để phục vụ xác định nguyên nhân và khôi phục hoạt động.

### 2.5. Khả năng sử dụng

Giao diện sử dụng tiếng Việt, bố cục rõ ràng và phù hợp với màn hình máy tính cũng như thiết bị di động. Các thao tác tìm kiếm, chọn sản phẩm, thêm giỏ và đặt hàng cần có trình tự dễ hiểu. Thông tin giá, tình trạng hàng và trạng thái đơn phải được trình bày nhất quán.

Hệ thống cần thông báo rõ kết quả thao tác, trạng thái đang xử lý và các lỗi cần người dùng điều chỉnh. Những chức năng chính phải có nhãn dễ nhận biết và hỗ trợ thao tác bằng bàn phím. Giá trị tiền tệ được hiển thị bằng VND, thời gian hiển thị phù hợp với người dùng tại Việt Nam.

### 2.6. Khả năng mở rộng và bảo trì

Hệ thống được định hướng xây dựng theo kiến trúc microservices, trong đó các dịch vụ được phân chia theo trách nhiệm nghiệp vụ và giao tiếp thông qua giao diện xác định. Cách tổ chức này nhằm tạo điều kiện phát triển, cập nhật và mở rộng từng thành phần, đặc biệt là dịch vụ gợi ý có nhu cầu xử lý khác với nghiệp vụ bán hàng.

Repository hiện có API gateway và năm dịch vụ NestJS: auth, catalog, order, payment, notification. Mỗi ứng dụng Node độc lập trong thư mục riêng. Catalog sở hữu upload/metadata/liên kết ảnh trong catalog_db và credential Cloudinary; browser đọc CDN, không giữ file gốc trong Nexora. Recommendation sẽ được xây sau bằng Python/FastAPI với môi trường dependency riêng và chưa có container/database. Order điều phối Saga bền vững; Kafka command/result/event, Elasticsearch và Redis sẽ được bổ sung riêng sau đợt Docker/PostgreSQL. CI/CD cũng là bước sau. Xem [Kiến trúc microservices](Folder-ARCHITECTURE.md).

Việc thay đổi mô hình gợi ý cần hạn chế ảnh hưởng đến các chức năng thương mại điện tử. Mỗi dịch vụ phải có trách nhiệm quản lý dữ liệu rõ ràng, tránh phụ thuộc trực tiếp vào cấu trúc lưu trữ nội bộ của dịch vụ khác. Khả năng mở rộng được xem xét ở mức thiết kế và thử nghiệm trong phạm vi đồ án, không mặc định tương đương khả năng vận hành quy mô lớn.

### 2.7. Bảo vệ dữ liệu cá nhân

Dữ liệu phục vụ nghiên cứu gợi ý chỉ bao gồm các thông tin cần thiết như định danh nội bộ, sản phẩm, loại tương tác, thời gian và ngữ cảnh phiên. Các thông tin liên hệ, địa chỉ nhận hàng, mật khẩu và thông tin xác thực phải được tách khỏi dữ liệu xuất cho quá trình huấn luyện, đánh giá.

Hệ thống cần phân biệt dữ liệu tương tác lịch sử của RetailRocket với dữ liệu phát sinh trên website. Không tự đồng nhất khách hàng mới của Nexora với một người dùng lịch sử trong bộ dữ liệu nguồn.

### 2.8. Khả năng kiểm chứng và tái lập nghiên cứu

Các thực nghiệm cần ghi nhận phiên bản dữ liệu, phương pháp tiền xử lý, cách chia tập, cấu hình mô hình và các tham số đánh giá. Kết quả phải có khả năng đối chiếu giữa các phương pháp trong cùng điều kiện thử nghiệm.

Việc lựa chọn mô hình và tham số không được dựa trên tập kiểm tra. Các giới hạn về dữ liệu, tài nguyên và số lần thực nghiệm phải được trình bày rõ trong báo cáo, kể cả khi kết quả của mô hình đề xuất chưa vượt phương pháp cơ sở.

## 3. Phạm vi nghiên cứu

### 3.1. Đối tượng nghiên cứu

Đề tài tập trung nghiên cứu hệ thống gợi ý sản phẩm từ dữ liệu hành vi trong môi trường thương mại điện tử. Đối tượng nghiên cứu chính bao gồm quan hệ tương tác người dùng–sản phẩm, phương pháp học biểu diễn bằng GNN, khả năng bổ sung tín hiệu phiên vào quá trình xếp hạng và cơ chế giải thích đề xuất dựa trên bằng chứng có thể truy vết.

Website Nexora đóng vai trò môi trường ứng dụng để tích hợp, quan sát và đánh giá các chức năng gợi ý. Kiến trúc microservices là hướng tổ chức hệ thống nhằm phân tách nghiệp vụ thương mại điện tử với quá trình thu thập hành vi và phục vụ mô hình.

### 3.2. Phạm vi nghiệp vụ thương mại điện tử

Hệ thống được giới hạn ở mô hình một cửa hàng bán lẻ đa ngành, do một đơn vị quản lý và bán hàng trực tiếp cho khách hàng cá nhân. Phạm vi nghiệp vụ bao gồm quản lý tài khoản, catalog sản phẩm, giỏ hàng, đặt hàng COD/payOS, tồn kho, theo dõi đơn hàng và quản trị hoạt động bán hàng.

Đề tài không xây dựng sàn giao dịch có nhiều người bán độc lập. Thanh toán trực tuyến chỉ tích hợp payOS; các cổng khác, đối soát COD, hoàn tiền, tích hợp đơn vị vận chuyển, quản lý nhiều kho, khuyến mại phức tạp và đổi trả sau khi giao thành công nằm ngoài phạm vi nghiên cứu. Hệ thống gửi email khôi phục mật khẩu và thông báo về đơn hàng; SMS, wishlist và đánh giá sản phẩm nằm ngoài phạm vi.

### 3.3. Phạm vi dữ liệu

RetailRocket được sử dụng làm nguồn dữ liệu chính cho nghiên cứu và huấn luyện. Dữ liệu bao gồm các hành vi xem sản phẩm (`view`), thêm vào giỏ (`addtocart`), giao dịch (`transaction`), thuộc tính sản phẩm theo thời gian và cấu trúc phân cấp danh mục.

Catalog trình diễn của Nexora được xây dựng từ 500 sản phẩm có liên kết với mã sản phẩm nguồn, tổ chức thành 23 danh mục hiển thị. Tên ngành hàng, tên sản phẩm, nhãn thương hiệu dạng metadata, giá, tồn kho và mô tả được tạo để phục vụ minh họa; hình ảnh sử dụng placeholder. Nhãn thương hiệu không có màn hình hoặc API quản trị riêng. Các nhãn như điện tử, thời trang hoặc gia dụng không được xem là tên ngành hàng thật đã xác định từ RetailRocket.

Catalog vận hành hỗ trợ danh mục cha–con và cấu hình thông số/lựa chọn ngay trong danh mục. Các giá trị được lưu linh hoạt tại Product/SKU, không bắt buộc màu và size cho mọi ngành hàng; nhãn và giá trị lựa chọn lúc mua được giữ trong snapshot dòng đơn. 23 danh mục seed ban đầu là danh mục gốc chưa khai báo thuộc tính, mỗi Product có một SKU không có lựa chọn. Không suy đoán thông số thật của item từ các nhãn synthetic; thiết kế đa ngành không đồng nghĩa đã thay dataset nghiên cứu.

Vì vậy, dữ liệu tổng hợp phục vụ giao diện không được sử dụng làm bằng chứng về ý nghĩa thực của sản phẩm hoặc sở thích theo ngành hàng của người dùng nguồn. Phạm vi huấn luyện không mặc định giới hạn trong 500 sản phẩm demo; việc lựa chọn tập nghiên cứu phải được mô tả riêng theo phương pháp thực nghiệm và điều kiện tài nguyên.

### 3.4. Phạm vi nghiên cứu mô hình gợi ý

Đề tài nghiên cứu việc chuyển dữ liệu tương tác thành đồ thị, học biểu diễn người dùng và sản phẩm, sau đó xác định mức độ phù hợp để tạo danh sách Top-K. LightGCN được lựa chọn làm mô hình khởi đầu theo định hướng đề cương. Các cấu hình sử dụng loại hành vi hoặc trọng số tương tác khác nhau có thể được xem xét để đánh giá ảnh hưởng đến chất lượng gợi ý.

Nghiên cứu về tính thích ứng tập trung vào việc kết hợp biểu diễn đã học với các tương tác gần đây trong phiên để điều chỉnh thứ hạng sản phẩm. Phạm vi này không bao gồm yêu cầu cập nhật toàn bộ tham số mô hình sau từng tương tác.

Nghiên cứu về khả năng giải thích tập trung vào các lý do có căn cứ từ lịch sử tương tác, quan hệ giữa các sản phẩm hoặc tín hiệu đã được sử dụng khi xếp hạng. Lời giải thích được đánh giá về khả năng truy vết và tính phù hợp với dữ liệu; không mặc định chứng minh được quan hệ nhân quả bên trong mô hình hoặc mức độ tin tưởng của người dùng.

Đối với trường hợp thiếu dữ liệu, đề tài xem xét phương án gợi ý cho người dùng mới và sản phẩm chưa có biểu diễn phù hợp. Các mô hình khác như GraphSAGE hoặc GCN có thể được khảo sát bổ sung tùy điều kiện thực nghiệm, nhưng không phải yêu cầu phải triển khai đồng thời tất cả mô hình.

### 3.5. Phạm vi thực nghiệm và đánh giá

Dữ liệu được chia thành tập huấn luyện, xác thực và kiểm tra theo yếu tố thời gian nhằm mô phỏng việc dự đoán từ thông tin đã biết trong quá khứ. Quá trình xây dựng đồ thị, đặc trưng và trạng thái phiên phải hạn chế việc sử dụng thông tin tương lai gây sai lệch kết quả.

| Nội dung đánh giá | Phạm vi xem xét |
|---|---|
| Chất lượng xếp hạng | Sử dụng Precision@K, Recall@K và NDCG@K; so sánh GNN với các phương pháp cơ sở trong cùng điều kiện |
| Khả năng thích ứng | So sánh gợi ý từ mô hình nền với phương án có bổ sung tương tác gần đây, sử dụng chuỗi sự kiện đúng thứ tự thời gian |
| Khả năng xử lý thiếu dữ liệu | Xem xét chất lượng và độ bao phủ của kết quả đối với người dùng mới, sản phẩm mới hoặc trường hợp ít tương tác |
| Tính hợp lệ của giải thích | Kiểm tra sự tồn tại và tính phù hợp của bằng chứng gắn với lý do đề xuất |
| Hiệu năng hệ thống | Đánh giá thời gian phản hồi, độ trễ xử lý tương tác và tỷ lệ lỗi trong môi trường thử nghiệm |
| Tính đúng đắn nghiệp vụ | Kiểm tra các luồng mua hàng, phân quyền, xử lý tồn kho và khả năng duy trì hoạt động khi dịch vụ gợi ý gặp lỗi |

Kết quả trên tập sản phẩm nghiên cứu và kết quả sau khi giới hạn về catalog demo phải được phân biệt. Các thử nghiệm không được sử dụng để khẳng định khả năng tăng doanh thu, tỷ lệ chuyển đổi hoặc mức độ hài lòng của khách hàng nếu chưa có dữ liệu đánh giá tương ứng.

### 3.6. Giới hạn môi trường triển khai

Hệ thống được triển khai và đánh giá trên môi trường thử nghiệm bằng Docker Compose, phục vụ trình diễn chức năng và tích hợp các dịch vụ. Đề tài không đặt mục tiêu vận hành hạ tầng thương mại điện tử quy mô lớn, triển khai đa vùng hoặc bảo đảm mức độ sẵn sàng của hệ thống production.

Các kết quả thực nghiệm được giới hạn bởi cấu hình máy, dung lượng dữ liệu và điều kiện thực hiện đồ án. Phạm vi này cho phép tập trung vào tính đúng đắn của nghiệp vụ, khả năng tích hợp microservices và giá trị của phương pháp gợi ý trong điều kiện nghiên cứu đã xác định.
