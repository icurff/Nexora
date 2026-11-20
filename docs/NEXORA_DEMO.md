# Nexora recommendation demo

## Hành vi

| Trang | API GET (prefix `/api/v1`) | Ngữ cảnh / fallback |
|---|---|---|
| Trang chủ | `/recommendations/home?limit=8` | VIEW LIVE trong phiên / DACN-65 lịch sử danh mục hoặc sản phẩm mới |
| Chi tiết | `/recommendations/products/:id/session?limit=8` | Phiên + sản phẩm hiện tại / DACN-65 sản phẩm tương tự |
| Giỏ hàng | `/recommendations/cart/session?limit=8` | Phiên + giỏ của tài khoản đã xác thực / DACN-65 danh mục giỏ |

Hai API cũ `/recommendations/products/:id` và `/recommendations/cart` vẫn là DACN-65. Giỏ hàng yêu cầu Bearer token; tài khoản lấy từ xác thực, không lấy userId do trình duyệt truyền.

Giữ model/artifacts LightGCN hiện có và toàn bộ 500 sản phẩm, không retrain/reseed. Backend chỉ gửi RetailRocket **item IDs** sang AI `/recommend/session`; Nexora visitorId chỉ dùng để tìm lịch sử LIVE. AI service lấy giao ứng viên với `item_to_idx` trước khi xếp hạng: có RetailRocket ID chưa đồng nghĩa có embedding.

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
2. Mở `/products/496`, chờ “Có thể bạn cũng thích” có nhãn LightGCN. Đã xác minh model hiện tại trả kết quả cho ngữ cảnh này.
3. Xem thêm sản phẩm rồi quay lại trang chủ, xem “Dành riêng cho bạn”. Không cam kết thứ tự thay đổi sau mỗi click.
4. Đăng nhập Customer hiện có, thêm sản phẩm rồi mở giỏ để xem “Có thể bạn cũng cần”. Thêm/xóa/đổi số lượng sẽ tải lại đề xuất.
5. Giải thích hai nguồn bằng nhãn từng thẻ. Không cần Colab hay train lại giữa buổi demo.

## Kiểm chứng và giới hạn

Typecheck, lint, build hai ứng dụng; backend tests bao phủ AI unavailable/empty, thiếu kết quả hợp lệ, duplicate, tồn sau inference, detail/cart, tách visitor/item IDs, quyền truy cập và fallback exclusions. Các integration DB chưa bật vẫn được bỏ qua.

HTTP thật đã xác nhận catalog 500; AI health; khách mới → DACN-65; VIEW 496 → LightGCN home/detail; detail API cũ → rule-based; guest cart → 401; product ID sai → 400. Trình duyệt đã xác nhận LightGCN home/detail và giá/tồn SKU.

Chưa kiểm chứng thao tác giỏ đã đăng nhập trên trình duyệt: phiên kiểm tra không có tài khoản đăng nhập hoặc giỏ chứa hàng sẵn. Cart hiện được kiểm chứng bằng service/controller tests có mock; không coi đó là bằng chứng giỏ thật end-to-end. Không thay đổi dữ liệu catalog hoặc model để tạo kết quả demo.
