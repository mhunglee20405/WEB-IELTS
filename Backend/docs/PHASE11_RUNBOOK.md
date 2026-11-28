# SỔ TAY VẬN HÀNH & HƯỚNG DẪN KHỞI CHẠY (PHASE 11 RUNBOOK)

> **Dự án**: IELTS Learning Management System (IELTS LMS)  
> **Tài liệu**: Quy trình vận hành, khởi chạy, kiểm thử và xử lý sự cố toàn hệ thống (Full-Stack Runbook)  
> **Cập nhật ngày**: 14/11/2026

---

## 1. YÊU CẦU HỆ THỐNG & TIỀN ĐIỀU KIỆN

1. **Hệ điều hành**: Windows 10/11, macOS hoặc Linux.
2. **Node.js**: Phiên bản 20.x trở lên (khuyên dùng Node 20 LTS).
3. **Docker & Docker Compose**: Để chạy MongoDB Replica Set và Redis.
4. **Cổng mạng (Ports)**:
   - `3000`: Next.js Frontend
   - `3001`: NestJS Backend API
   - `27018`: MongoDB Replica Set (`rs0`)
   - `6379`: Redis Cache & BullMQ Queue

---

## 2. QUY TRÌNH KHỞI CHẠY HẠ TẦNG (INFRASTRUCTURE)

### Bước 2.1: Khởi động MongoDB Replica Set và Redis
Chạy lệnh tại thư mục gốc `D:\WEB-IELTS` (hoặc `D:\WEB-IELTS\Backend`):

```powershell
# Khởi động các container trong nền
docker compose up -d

# Kiểm tra trạng thái containers
docker ps
```
Đảm bảo container `ielts-lms-mongo` (port 27018 -> 27017) và `ielts-lms-redis` (port 6379) ở trạng thái `Up (healthy)`.

### Bước 2.2: Khởi tạo dữ liệu mẫu (Database Seeding)
Chạy lệnh seed để tạo sẵn tài khoản Admin, Giáo viên và Học viên:

```powershell
cd D:\WEB-IELTS\Backend
npm run seed
```

**Tài khoản mặc định được tạo sẵn:**
- **Admin**: `admin@ielts-lms.local` | Mật khẩu: `Admin@123456`
- **Giáo viên**: `teacher@ielts-lms.local` | Mật khẩu: `Teacher@123456`
- **Học viên**: `student@ielts-lms.local` | Mật khẩu: `Student@123456`

---

## 3. KHỞI CHẠY BACKEND & FRONTEND

### Bước 3.1: Chạy Backend NestJS (Cổng 3001)
Mở cửa sổ terminal 1:

```powershell
cd D:\WEB-IELTS\Backend

# Chế độ phát triển (hot reload)
npm run start:dev

# Hoặc biên dịch và chạy bản build production
npm run build
node dist/main.js
```
Kiểm tra Backend đã sẵn sàng tại:
- Liveness Probe: `http://localhost:3001/api/v1/health/live`
- Readiness Probe: `http://localhost:3001/api/v1/health/ready`
- Swagger UI Documentation: `http://localhost:3001/api/docs`

### Bước 3.2: Chạy Frontend Next.js (Cổng 3000)
Mở cửa sổ terminal 2:

```powershell
cd D:\WEB-IELTS\frontend

# Khởi động Next.js ở chế độ phát triển
npm run dev
```
Mở trình duyệt truy cập: `http://localhost:3000`

---

## 4. QUY TRÌNH CHẠY BỘ KIỂM THỬ (TEST SUITES EXECUTION)

### 4.1. Kiểm thử Backend Unit Tests
Kiểm tra toàn bộ 19 test suites với 135 unit tests:

```powershell
cd D:\WEB-IELTS\Backend
npm test -- --forceExit
```
*Kết quả kỳ vọng: `Tests: 135 passed, 135 total`.*

### 4.2. Kiểm thử Backend End-to-End (E2E)
Kiểm tra toàn bộ 10 test suites (Auth, Phase 3–11):

```powershell
cd D:\WEB-IELTS\Backend
npm run test:e2e
```
*Kết quả kỳ vọng: `Test Suites: 10 passed, 10 total; Tests: 138 passed, 138 total`.*

### 4.3. Kiểm thử Frontend Component & Zod Contracts
Kiểm tra toàn bộ 17 test suites với 77 tests:

```powershell
cd D:\WEB-IELTS\frontend
npm test
```
*Kết quả kỳ vọng: `Test Files: 17 passed (17); Tests: 77 passed (77)`.*

### 4.4. Kiểm tra Typecheck Frontend
```powershell
cd D:\WEB-IELTS\frontend
npm run typecheck
```
*Kết quả kỳ vọng: Không có lỗi type.*

---

## 5. HƯỚNG DẪN KIỂM TRA THỦ CÔNG CÁC LUỒNG CHÍNH (SMOKE TEST GUIDE)

### Luồng 1: Đăng nhập & Điều hướng theo vai trò (RBAC)
1. Truy cập `http://localhost:3000/login`.
2. Đăng nhập bằng `student@ielts-lms.local` / `Student@123456`.
3. Kiểm tra chuyển hướng tự động về `/student/dashboard`.
4. Đăng xuất, đăng nhập bằng `teacher@ielts-lms.local` / `Teacher@123456`.
5. Kiểm tra chuyển hướng tự động về `/teacher/dashboard`.

### Luồng 2: Thi thử trực tuyến (CBT Exam Practice)
1. Đăng nhập với vai trò Học viên, vào mục **Luyện đề thi** (`/student/practice`).
2. Chọn bài thi Reading hoặc Listening, chọn chế độ **Làm theo từng Part (PART Mode)** hoặc **Cả đề (FULL Mode)**.
3. Trong giao diện làm bài CBT:
   - Thử đánh dấu cờ (Flag) câu hỏi.
   - Trả lời các câu hỏi, để ý trạng thái tự động lưu (Autosave).
   - Nộp bài thi.
4. Xem màn hình kết quả: điểm số %, ước lượng Band IELTS, và phân tích chi tiết.

### Luồng 3: Mở khóa dịch đọc (Reading Translation Unlock)
1. Nếu bài thi đạt điểm số >= 70%:
   - Nút **Dịch đoạn văn** sẽ sáng lên.
   - Bấm vào để mở không gian dịch song ngữ (Passage gốc tiếng Anh song song với khung nhập tiếng Việt).
   - Nhập bản dịch thử nghiệm và bấm **Lưu nháp** hoặc **Nộp bài dịch**.
2. Nếu bài thi đạt điểm < 70%:
   - Đoạn văn sẽ bị khóa, hiển thị thông báo: *"Cần đạt từ 70% trở lên cho Passage này để mở khóa dịch"*.

### Luồng 4: Xin gia hạn bài tập (Deadline Extension)
1. Học viên vào bài tập quá hạn hoặc sắp đến hạn.
2. Bấm **Xin gia hạn**, chọn hạn nộp mới và nhập lý do (tối thiểu 10 ký tự).
3. Kiểm tra quota: mỗi học viên được tối đa 3 lần gia hạn/tháng theo múi giờ `Asia/Ho_Chi_Minh`.
4. Đăng nhập tài khoản Giáo viên, vào mục **Đơn xin gia hạn**, kiểm tra đơn xuất hiện và thực hiện **Phê duyệt** hoặc **Từ chối**.

---

## 6. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

| Sự cố | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **CORS Error khi gọi API từ browser** | Thiếu cấu hình Header hoặc sai port | Kiểm tra `Backend/.env` xem `CORS_ORIGIN=http://localhost:3000`. Đảm bảo `main.ts` cho phép các headers: `Idempotency-Key`, `X-Correlation-Id`. |
| **Lỗi kết nối MongoDB `MongooseServerSelectionError`** | Container Mongo chưa khởi động hoặc chưa init replica set | Chạy `docker ps`. Nếu container dừng, chạy `docker compose restart mongo`. Kiểm tra log bằng `docker logs ielts-lms-mongo`. |
| **Lỗi BullMQ `ECONNREFUSED 127.0.0.1:6379`** | Redis chưa chạy | Chạy `docker compose up -d redis`. |
| **Lỗi 401 Unauthorized khi login** | Cơ sở dữ liệu trống chưa có tài khoản admin | Chạy lệnh `npm --prefix Backend run seed` để khởi tạo người dùng mặc định. |
| **Lỗi `Invalid value used in weak set`** | Primitive string lọt vào `WeakSet` trong `TransformInterceptor` | Đã được khắc phục triệt để trong `Backend/src/common/interceptors/transform.interceptor.ts`. |
