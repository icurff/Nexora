# Nexora

Nexora gồm frontend React/Vite, API Gateway và năm backend NestJS. Mỗi ứng dụng
Node được quản lý riêng trong thư mục của nó: có `package.json`,
`package-lock.json`, cấu hình và Dockerfile riêng. Dự án dùng Node.js 24 và npm 11.

## Chạy PostgreSQL và một service trên máy

Cần Docker Desktop và Docker Compose v2. Chạy các lệnh Compose ở thư mục gốc:

```powershell
docker compose up -d --wait postgres
```

Không cần tạo `.env` để chạy local: Compose tự dùng mật khẩu và port mặc định. Nếu muốn đổi mật khẩu, có thể tạo `.env` từ `.env.example` rồi chỉnh giá trị cần thay.

Mở terminal mới để chạy backend, ví dụ Auth:

```powershell
Set-Location auth-service
npm install
npm run start:dev
```

Mở terminal khác cho frontend:

```powershell
Set-Location frontend
npm install
npm run dev
```

`npm install` chỉ cần chạy lần đầu hoặc sau khi thay đổi dependency. Sau đó vào
đúng thư mục và chạy lệnh start của ứng dụng. Các ứng dụng Node không chia sẻ
`node_modules` hay lockfile. Script chạy trên máy hiện chưa tự đọc `.env`; khi
kết nối database từ máy host, cấu hình phải dùng `localhost` và port
`5432`.

| Thành phần | Địa chỉ |
| --- | --- |
| Frontend | http://localhost:5173 |
| API Gateway | http://localhost:3000 |
| Auth Service | http://localhost:3001 |
| Catalog Service | http://localhost:3002 |
| Order Service | http://localhost:3003 |
| Payment Service | http://localhost:3004 |
| Notification Service | http://localhost:3005 |
| PostgreSQL | localhost:5432 |

Các backend hiện có endpoint kiểm tra tại `/health`, ví dụ
http://localhost:3001/health cho Auth Service.

## Chạy bằng Docker

Compose khởi động toàn bộ ứng dụng và PostgreSQL theo lệnh mặc định. Nếu chỉ cần PostgreSQL, chỉ định riêng service:

```powershell
docker compose up -d --wait postgres
```

Chạy một backend trong Docker (Compose tự khởi động PostgreSQL):

```powershell
docker compose up -d --build auth-service
```

Chạy toàn bộ frontend và backend để kiểm tra tích hợp:

```powershell
docker compose up -d --build --wait --wait-timeout 240
```

Mỗi ứng dụng có Dockerfile riêng. Compose build image từ Dockerfile và lockfile trong thư mục ứng dụng tương ứng. NestJS chạy JavaScript đã build, không chạy watch và không mount source. Khi sửa code hoặc dependency, build lại service bằng `docker compose up -d --build <service>`. Frontend vẫn dùng Vite với source mount để tự cập nhật khi sửa giao diện.

Các lệnh tiện ích chạy ở thư mục gốc:

```powershell
docker compose ps
docker compose logs -f auth-service postgres
docker compose restart auth-service
docker compose down
```

Frontend, Gateway, các backend và PostgreSQL đều có cổng riêng trên máy host;
Compose publish các cổng này trên mọi interface của máy host; thiết bị khác trong mạng có thể truy cập nếu firewall cho phép. Các ứng dụng vẫn giao tiếp nội bộ qua
tên service và cổng container `3000`, ví dụ `auth-service:3000`. Frontend chuyển
tiếp `/api` đến Gateway qua Vite proxy. Mỗi service dùng cùng một cổng local khi
chạy trực tiếp hoặc trong Docker, nên không chạy đồng thời hai bản của cùng service.

## PostgreSQL

PostgreSQL 17.11 lưu dữ liệu trong named volume `postgres-data`. Script khởi tạo
một database và user riêng cho mỗi backend:

| Database | User |
| --- | --- |
| `auth_db` | `auth_user` |
| `catalog_db` | `catalog_user` |
| `order_db` | `order_user` |
| `payment_db` | `payment_user` |
| `notification_db` | `notification_user` |

Script khởi tạo chỉ chạy khi volume còn trống. `docker compose down` giữ dữ liệu;
không dùng `docker compose down -v` nếu muốn giữ database. Đợt này chỉ dựng Docker
và PostgreSQL. Kafka, Redis, Elasticsearch, migration, seed và kết nối database
trong ứng dụng sẽ được bổ sung sau. Recommendation dự kiến dùng Python/FastAPI;
hiện chưa có code hoặc container.

## Build image production

Ví dụ build riêng image runtime cho Auth:

```powershell
docker build --target runtime -t nexora-auth:local ./auth-service
```

Docker Compose dùng runtime image chạy JavaScript đã build, không bật Nest watch. Sau khi sửa NestJS code, dùng `docker compose up -d --build <service>` để build và khởi động lại image mới; `docker compose restart <service>` chỉ khởi động lại image hiện có.
build và không bật watch.
