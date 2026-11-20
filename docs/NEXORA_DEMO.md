# Nexora recommendation demo

## Local admin model mapping

The local demo maps the authenticated admin account ID `1` to RetailRocket visitor
`1150086` using `DEMO_RECOMMENDATION_USER_ID` and
`DEMO_RECOMMENDATION_VISITOR_ID` in `backend/.env`. This is a demonstration
mapping, not the admin's real historical activity. It applies only to the
home, product-session and cart-session endpoints only when both account ID and ADMIN role match.
Without a recent session, the model ranks eligible catalog products using the
visitor's trained user embedding. With mapped recent views, the model combines
standardized user and session scores at 50% each. Detail adds the current product;
cart adds distinct products in the cart. When both recent views and page context
exist, their similarity scores have equal weight within the session score. The
current detail product is not counted twice. Context products are excluded from
the recommendations. Unmapped or unrecognized
session items and AI failures still use the existing rule-based fallback.
Other accounts retain the popularity and session model policy. All three pages
keep their own category-based fallback when model inference cannot use the full
context. A service without page-context support is rejected for detail and cart.

The selected visitor has 5,312 training events across 2,493 product edges in
`dataset/ai_task073/v1/train_edges.parquet`; both user and item mapping hashes
match the serving model metadata. This is the largest event count within the
model's selected training cohort, not necessarily in the entire dataset.
Restart the AI service and backend to load the new code and local settings.

## Hành vi

| Trang | API GET (prefix `/api/v1`) | Ngữ cảnh / fallback |
|---|---|---|
| Trang chủ | `/recommendations/home?limit=8` | Profile demo nếu có + VIEW LIVE trong phiên / DACN-65 lịch sử danh mục hoặc sản phẩm mới |
| Chi tiết | `/recommendations/products/:id/session?limit=8` | Profile demo nếu có + phiên + sản phẩm hiện tại / DACN-65 sản phẩm tương tự |
| Giỏ hàng | `/recommendations/cart/session?limit=8` | Profile demo nếu có + phiên + giỏ của tài khoản đã xác thực / DACN-65 danh mục giỏ |

Hai API cũ `/recommendations/products/:id` và `/recommendations/cart` vẫn là DACN-65. Giỏ hàng yêu cầu Bearer token; tài khoản lấy từ xác thực, không lấy userId do trình duyệt truyền.

Khi dùng rule-based, trang chủ ưu tiên danh mục trong tối đa ba lượt VIEW gần nhất của phiên, sau đó xét tần suất VIEW trong 7 ngày; giỏ hàng ưu tiên danh mục có nhiều Product khác nhau trong giỏ nhất (nhiều SKU của cùng Product chỉ tính một). Trong từng danh mục lấy sản phẩm mới nhất còn bán, sau đó mới xét danh mục tiếp theo và sản phẩm mới dự phòng. Lịch sử giỏ không thay thế lịch sử VIEW trên trang chủ.

Nếu một VIEW gần nhất hoặc Product trong giỏ không có RetailRocket item ID hợp lệ, hệ thống dùng rule-based thay vì âm thầm bỏ qua ngữ cảnh đó. AI service báo `unknown_recent_itemids` khi ID không có embedding; backend dùng rule-based nếu danh sách này không rỗng hoặc service cũ không cung cấp trường này. Cần khởi động lại cả AI service và backend sau khi cập nhật hợp đồng.

Giữ model/artifacts LightGCN hiện có, không retrain/reseed. Backend chỉ gửi RetailRocket **item IDs** sang AI `/recommend/session`; Nexora visitorId chỉ dùng để tìm lịch sử LIVE. AI service lấy giao ứng viên với `item_to_idx` trước khi xếp hạng: có RetailRocket ID chưa đồng nghĩa có embedding.

Database local đã chủ động xóa bốn category không có sản phẩm trong model vào 2026-11-21: Bags & Accessories, Health & Wellness, Pet Supplies và Toys & Kids. Dataset RetailRocket gốc không còn đủ 500 Product/23 category trong database này; `npm run seed:catalog` sẽ phát hiện dataset không đầy đủ và dừng để tránh ghi đè. Các artifact nghiên cứu và manifest nguồn không bị sửa; không chạy lại seed để khôi phục các category đã xóa trừ khi được yêu cầu.

Backend chọn ACTIVE còn tồn, loại sản phẩm đang xem/toàn bộ sản phẩm trong giỏ, kiểm tra lại tồn sau inference và loại trùng. AI lỗi/rỗng dùng fallback theo đúng ngữ cảnh; thiếu kết quả thì bổ sung DACN-65 và loại các mục AI đã chọn ngay từ truy vấn. Mỗi thẻ có nhãn riêng `AI - LightGCN` hoặc `Rule-based Recommendations`. Lỗi đề xuất không khóa mua sắm. Sản phẩm ngoài mapping vẫn xem, thêm giỏ và mua bình thường; vẫn có thể được DACN-65 đề xuất.

Frontend chờ VIEW hoàn tất trước khi tải đề xuất detail; tracking có timeout 3 giây. Giỏ thay đổi sản phẩm/số lượng sẽ tải lại đề xuất. Thêm giỏ chỉ bổ sung ngữ cảnh inference, không làm model học lại.

## Cách chạy hiện tại

PostgreSQL/frontend giữ các container hiện có; AI giữ tiến trình host tại `127.0.0.1:8000`. Backend Docker cũ đã dừng vì thiếu mã mới và không kết nối được AI loopback host. Backend mới chạy trực tiếp trên máy tại cổng 3000 với `backend/.env`, đã bổ sung local `FRONTEND_URL=http://localhost:5173` cho CORS.

Không khởi động backend Docker đồng thời trên cổng 3000. Khi cần chạy lại backend local, sau khi dừng tiến trình cũ:

```bash
cd /home/khanh/Documents/Web-Projects/Nexora/backend
npm run build
node --env-file=.env dist/main.js
```

`AI_SERVICE_URL` mặc định `http://127.0.0.1:8000`. Địa chỉ này dành cho backend chạy host. Nếu chuyển backend vào Docker, cần cấu hình riêng đường kết nối tới AI host.

## Demo nhanh

1. Mở `http://localhost:5173` bằng cửa sổ riêng tư: khách chưa có VIEW nhận DACN-65.
2. Chọn sản phẩm có RetailRocket item ID nằm trong mapping của model, ví dụ Product `2` trong database local đã kiểm tra ngày 2026-11-21; xem sản phẩm rồi tải lại trang chủ để kiểm tra nguồn LightGCN. ID và dữ liệu có thể khác giữa các database.
3. Xem thêm sản phẩm rồi quay lại trang chủ, xem “Dành riêng cho bạn”. Không cam kết thứ tự thay đổi sau mỗi click.
4. Đăng nhập Customer hiện có, thêm sản phẩm rồi mở giỏ để xem “Có thể bạn cũng cần”. Thêm/xóa/đổi số lượng sẽ tải lại đề xuất.
5. Giải thích hai nguồn bằng nhãn từng thẻ. Không cần Colab hay train lại giữa buổi demo.

## Kiểm chứng và giới hạn

Typecheck, lint, build hai ứng dụng; backend tests bao phủ AI unavailable/empty, thiếu kết quả hợp lệ, duplicate, tồn sau inference, detail/cart, tách visitor/item IDs, quyền truy cập và fallback exclusions. Các integration DB chưa bật vẫn được bỏ qua.

Kiểm tra local ngày 2026-11-21: VIEW Product `2` trả LightGCN; tiếp theo VIEW Product Automotive không có mapping trả rule-based theo danh mục vừa xem. Product `496` có RetailRocket ID nhưng không có embedding trong model hiện tại, nên không dùng làm ví dụ LightGCN. Giỏ Automotive local được kiểm tra trực tiếp qua service và trả sản phẩm cùng danh mục, không trùng giỏ.

Chưa kiểm chứng thao tác giỏ đã đăng nhập trên trình duyệt: phiên kiểm tra không có tài khoản đăng nhập hoặc giỏ chứa hàng sẵn. Cart hiện được kiểm chứng bằng service/controller tests có mock; không coi đó là bằng chứng giỏ thật end-to-end. Không thay đổi dữ liệu catalog hoặc model để tạo kết quả demo.
