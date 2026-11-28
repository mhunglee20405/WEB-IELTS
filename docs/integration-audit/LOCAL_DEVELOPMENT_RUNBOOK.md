# LOCAL DEVELOPMENT & INTEGRATION RUNBOOK

> **Dự án**: IELTS Academic Learning Management System (IELTS LMS)  
> **Workspace**: `D:\WEB-IELTS`  
> **Môi trường**: Windows PowerShell / CMD  
> **Thời gian cập nhật**: 14/11/2026

Tài liệu này cung cấp toàn bộ các câu lệnh thực tế và quy trình chuẩn từng bước để bất kỳ thành viên nào trong đội ngũ phát triển có thể thiết lập, khởi chạy và kiểm thử toàn bộ hệ thống từ đầu.

---

## 1. THÔNG SỐ CỔNG & TÀI KHOẢN MẪU

### 1.1. Cổng Dịch vụ
| Dịch vụ | Địa chỉ | Cổng | Ghi chú |
| :--- | :--- | :---: | :--- |
| **Frontend (Next.js)** | `http://localhost:3000` | 3000 | Giao diện người dùng |
| **Backend API (NestJS)** | `http://localhost:3001/api/v1` | 3001 | API chính |
| **Swagger API Docs** | `http://localhost:3001/api/v1/docs` | 3001 | Tài liệu OpenAPI tương tác |
| **MongoDB Replica Set rs0** | `mongodb://localhost:27018/ielts_lms` | 27018 | Container `ielts-lms-mongo` |
| **Redis Cache / Sessions** | `redis://localhost:6379` | 6379 | Container `ielts-lms-redis` |

### 1.2. Danh sách Tài khoản Kiểm thử (Đã Seed trong Database)
| Vai trò | Email đăng nhập | Mật khẩu mặc định | Trang điều hướng mặc định |
| :--- | :--- | :--- | :--- |
| **Học viên (Student)** | `student@ielts-lms.local` | `Student@123456` | `http://localhost:3000/student/dashboard` |
| **Giảng viên (Teacher)** | `teacher@ielts-lms.local` | `Teacher@123456` | `http://localhost:3000/teacher/dashboard` |
| **Quản trị viên (Admin)** | `admin@ielts-lms.local` | `Admin@123456` | `http://localhost:3000/admin/users` |

---

## 2. QUY TRÌNH KHỞI CHẠY TỪNG BƯỚC (STEP-BY-STEP)

Mở cửa sổ **PowerShell** tại thư mục gốc `D:\WEB-IELTS`:

### Bước 1: Khởi động Cơ sở Dữ liệu & Hàng đợi (Docker)
Chỉ khởi động MongoDB (Replica Set `rs0`) và Redis (tránh xung đột cổng với Backend chạy trên host):
```powershell
cd D:\WEB-IELTS\Backend
docker compose up -d mongodb redis mongo-init
```
*Kiểm tra trạng thái container:*
```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```
*Kết quả kỳ vọng:* Cả `ielts-lms-mongo` và `ielts-lms-redis` đều ở trạng thái `healthy`.

---

### Bước 2: Nạp Dữ liệu Mẫu (Seed Data)
Chạy script seed dữ liệu mẫu (tạo các tài khoản, khóa học, buổi học, bài tập hôm nay và đề thi Reading):
```powershell
cd D:\WEB-IELTS\Backend
npm run seed
```
*Kết quả kỳ vọng:* Console báo `Seeding completed successfully!` kèm danh sách tài khoản được tạo.

---

### Bước 3: Khởi chạy Backend NestJS (Cổng 3001)
Mở một tab terminal mới và chạy:
```powershell
cd D:\WEB-IELTS\Backend
npm run start:dev
```
*Hoặc chạy bản build đã tối ưu:*
```powershell
cd D:\WEB-IELTS\Backend
node dist/main.js
```
*Kết quả kỳ vọng:*
```text
🚀 IELTS LMS Backend running on http://localhost:3001
📚 Swagger docs: http://localhost:3001/api/v1/docs
```

---

### Bước 4: Khởi chạy Frontend Next.js (Cổng 3000)
Mở một tab terminal khác và chạy:
```powershell
cd D:\WEB-IELTS\frontend
npm run dev
```
*Kết quả kỳ vọng:*
```text
▲ Next.js 16.4.6 (Turbopack)
- Local: http://localhost:3000
✓ Ready in ...
```

---

## 3. QUY TRÌNH KIỂM THỬ XÁC MINH NHANH (SMOKE TESTS)

### 3.1. Kiểm tra Liveness & Readiness của Backend
Trong PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/v1/health/live" -Method GET
Invoke-RestMethod -Uri "http://localhost:3001/api/v1/health/ready" -Method GET
```
*Kỳ vọng:* Cả hai đều trả về `statusCode: 200` và `status: "ok"`.

### 3.2. Chạy Kịch bản Kiểm tra Tích hợp API Tự động
```powershell
cd D:\WEB-IELTS
node Backend/scripts/verify-integration-live.js
```
Script sẽ tự động kiểm tra:
1. Health check
2. Đăng nhập Student
3. Lấy thông tin `/auth/me` với Bearer Token
4. Lấy dữ liệu `/dashboard/student`
5. Đăng nhập Teacher và lấy `/dashboard/teacher`
6. Đăng nhập Admin

### 3.3. Chạy Kiểm tra Đăng nhập Trực quan qua Trình duyệt (Headless Browser)
```powershell
cd D:\WEB-IELTS
node frontend/e2e/test-all-roles-login.mjs
```
Script sẽ tự động khởi động Microsoft Edge / Chromium, điều hướng vào `http://localhost:3000/login`, điền form đăng nhập cho từng vai trò và kiểm tra URL sau điều hướng.

---

## 4. BỘ LỆNH KIỂM THỬ TOÀN DIỆN (FULL TEST SUITE)

### Backend Tests
```powershell
cd D:\WEB-IELTS\Backend

# Chạy Unit Tests (135 tests)
npm run test

# Chạy E2E Tests (154 tests)
npm run test:e2e

# Biên dịch Backend
npm run build
```

### Frontend Tests
```powershell
cd D:\WEB-IELTS\frontend

# Kiểm tra kiểu TypeScript (0 lỗi)
npm run typecheck

# Kiểm tra cú pháp Lint (0 lỗi)
npm run lint

# Chạy Unit Tests (78 tests)
npm run test

# Biên dịch Production Build (45 routes)
npm run build
```

---

## 5. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

1. **Lỗi `EADDRINUSE: address already in use :::3001`**:
   - Do có tiến trình cũ hoặc container Docker đang chiếm cổng 3001.
   - Xử lý:
     ```powershell
     # Dừng container nếu có
     docker stop ielts-lms-api
     # Tìm và tắt tiến trình trên cổng 3001
     Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
     ```

2. **Lỗi `Unable to connect to mongodb`**:
   - Kiểm tra xem Docker container `ielts-lms-mongo` có đang chạy không:
     ```powershell
     docker restart ielts-lms-mongo
     ```

3. **Lỗi hiển thị *"Không thể kết nối đến máy chủ"* trên màn hình login**:
   - Kiểm tra xem Backend trên cổng 3001 đã chạy chưa bằng lệnh:
     ```powershell
     Invoke-RestMethod -Uri "http://localhost:3001/api/v1/health/live"
     ```
   - Xóa bộ nhớ cache `sessionStorage` trên trình duyệt (F12 -> Application -> Session Storage -> Clear).

