# Sổ tay Vận hành Sản phẩm Cục bộ (Local Product Operator Runbook)

**Dự án:** IELTS Academic Learning Management System (WEB-IELTS)  
**Tài liệu dành cho:** DevOps Engineers, Kỹ sư Vận hành & Nhà phát triển (Operators)  
**Nhánh:** `connect`  
**Ngày cập nhật:** 15/11/2026  

---

## 1. Yêu cầu Tiên quyết Môi trường (System Prerequisites)

Trước khi khởi chạy hệ thống, đảm bảo môi trường đã cài đặt:
- **Hệ điều hành:** Windows 10/11, macOS, hoặc Linux.
- **Node.js:** Phiên bản `>= 20.x` (Khuyến nghị Node.js v22 hoặc v24).
- **Trình quản lý gói:** `npm` (đi kèm Node.js).
- **Docker & Docker Compose:** Dùng để chạy cụm MongoDB Replica Set và Redis.

---

## 2. Cấu hình Biến Môi trường (Environment Setup)

### 2.1 Backend (`Backend/.env`)
Tạo hoặc kiểm tra file `Backend/.env`:
```env
NODE_ENV=development
PORT=3001
API_PREFIX=api/v1

# MongoDB Replica Set (bắt buộc replicaSet=rs0 để hỗ trợ Transactions & Change Streams)
MONGO_HOST_PORT=27018
MONGODB_URI=mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true

# Redis Cache & BullMQ Queue
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Secrets (tối thiểu 32 ký tự)
JWT_ACCESS_SECRET=local_dev_access_secret_at_least_32_characters_long
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=local_dev_refresh_secret_at_least_32_characters_long
JWT_REFRESH_EXPIRES_IN=7d

# File Storage
STORAGE_TYPE=disk
STORAGE_LOCAL_PATH=./uploads

# (Tùy chọn) Mã token bảo vệ khởi tạo ban đầu
# SETUP_TOKEN=my-secure-bootstrap-token-12345
```

### 2.2 Frontend (`frontend/.env.local`)
Tạo hoặc kiểm tra file `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_MOCK_API=false
```

---

## 3. Khởi chạy Hạ tầng Cơ sở Dữ liệu (Infrastructure Startup)

Khởi động cụm MongoDB và Redis bằng Docker Compose từ thư mục gốc của dự án:
```powershell
docker-compose up -d
```

Kiểm tra trạng thái các container:
- MongoDB Replica Set đang lắng nghe tại cổng `27018`.
- Redis đang lắng nghe tại cổng `6379`.

---

## 4. Quy trình Bắt đầu từ Cơ sở Dữ liệu Trống (Clean Start for Customer Onboarding)

Để đưa hệ thống về trạng thái ban đầu sạch sẽ (hoàn toàn không có dữ liệu mẫu):

```powershell
# 1. Thực hiện vệ sinh an toàn và tạo bản sao lưu tự động
npm --prefix Backend run clean:database -- --force

# 2. Khởi tạo chỉ mục chuẩn xác cho toàn bộ 18 models
npm --prefix Backend run init:indexes
```

---

## 5. Khởi chạy Ứng dụng (Application Services Startup)

### 5.1 Khởi chạy Backend API (Cổng 3001)
```powershell
# Biên dịch mã nguồn Backend
npm --prefix Backend run build

# Khởi chạy dịch vụ Backend Production mode
node Backend/dist/main.js
```
*Kiểm tra kết nối:* Truy cập Swagger UI tại `http://localhost:3001/api/v1/docs` hoặc kiểm tra trạng thái khởi tạo tại `http://localhost:3001/api/v1/system/setup-status`.

### 5.2 Khởi chạy Worker Xử lý Nền (BullMQ Processor)
```powershell
node Backend/dist/workers/worker.main.js
```
Worker sẽ đảm nhận việc gửi email thông báo và tự động quét hạn nộp bài tập theo lịch biểu định kỳ.

### 5.3 Khởi chạy Frontend Next.js (Cổng 3000)
```powershell
# Chế độ phát triển (Dev Mode)
npm --prefix frontend run dev

# Hoặc chế độ tối ưu hóa Production
npm --prefix frontend run build
npm --prefix frontend run start
```
*Truy cập ứng dụng:* Mở trình duyệt tại `http://localhost:3000`.

---

## 6. Khởi tạo Tài khoản Quản trị viên Đầu tiên (First-Time Super Admin)

### Lựa chọn A: Qua Giao diện Web
1. Mở `http://localhost:3000/setup`.
2. Điền thông tin Quản trị viên và nhấn **"Khởi tạo Quản trị viên Tối cao"**.
3. Đăng nhập tại `http://localhost:3000/login`.

### Lựa chọn B: Qua Terminal CLI
```powershell
npm --prefix Backend run bootstrap:admin -- `
  --email="admin@academy.edu.vn" `
  --fullName="Giám Đốc Học Thuật" `
  --phone="0901234567" `
  --password="Admin@Academy2026!"
```

---

## 7. Xử lý Sự cố Thường gặp (Troubleshooting Guide)

| Hiện tượng | Nguyên nhân | Biện pháp xử lý |
| :--- | :--- | :--- |
| **Lỗi `MongooseServerSelectionError: connect ECONNREFUSED ::1:27018`** | Container MongoDB chưa được khởi chạy hoặc cổng bị chiếm dụng. | Chạy `docker-compose up -d` và kiểm tra lại `docker ps`. Đảm bảo chuỗi kết nối có `directConnection=true`. |
| **Lỗi `409 Conflict: Hệ thống đã có quản trị viên`** | Đã có ít nhất 1 tài khoản có vai trò `admin` trong database. | Đây là cơ chế bảo mật có chủ đích. Để tạo admin mới, hãy đăng nhập bằng admin hiện tại qua `/admin/users` hoặc chạy `npm run clean:database` nếu muốn cài lại từ đầu. |
| **Lỗi `No QueryClient set` trong unit tests** | Component sử dụng React Query hook nhưng chưa được bọc bởi `QueryClientProvider`. | Sử dụng helper `renderWithClient(ui)` thay vì `render(ui)`. |
| **Lỗi `EPERM: operation not permitted, mkdir` trên Windows** | Lỗi khóa tệp tạm thời do tiến trình `next dev` đang chạy cùng lúc với `next build`. | Dừng tiến trình `next dev`, xóa thư mục `frontend/.next` và thực thi lại lệnh build. |
