# KẾ HOẠCH TRIỂN KHAI BACKEND LÊN RENDER BẰNG DOCKER (STEP-BY-STEP)

Tài liệu này là bản kế hoạch chi tiết, chính xác 100% theo mã nguồn thực tế của dự án để triển khai **Backend (NestJS + BullMQ + MongoDB Atlas + Redis)** lên **Render.com** bằng **Docker Container**.

---

## I. KIỂM TRA & RÀ SOÁT CẤU HÌNH DOCKER CỦA DỰ ÁN

Mã nguồn tại thư mục `Backend/` đã được chuẩn bị đầy đủ và tối ưu hóa sẵn cho Docker:

### 1. File `Backend/Dockerfile` (Multi-stage Build an toàn):
* **Giai đoạn 1 (Builder):** Sử dụng `node:22-alpine`, cài đặt dependencies qua `npm ci`, biên dịch toàn bộ TypeScript sang JavaScript vào `/app/dist`.
* **Giai đoạn 2 (Runner):**
  - Chỉ cài đặt production dependencies (`npm ci --omit=dev`), loại bỏ hoàn toàn devDependencies để tối ưu dung lượng image.
  - Sao chép thư mục `/app/dist` từ stage builder.
  - Tạo thư mục `/app/uploads` để lưu trữ audio/tệp tải lên.
  - Chạy ứng dụng dưới tài khoản bảo mật `appuser:appgroup` (không chạy quyền `root`).
  - Mở cổng `EXPOSE 3000`.
  - Tích hợp sẵn `HEALTHCHECK` thăm dò endpoint `/api/v1/health/live`.
  - Lệnh khởi chạy: `CMD ["node", "dist/main"]`.

### 2. File `Backend/.dockerignore`:
Đã cấu hình loại bỏ `node_modules`, `dist`, `.env`, `coverage`, `.git` khỏi ngữ cảnh build để tránh rò rỉ thông tin nhạy cảm và không bị xung đột thư viện giữa máy local và container Linux.

---

## II. BẢN ĐỒ KIẾN TRÚC TRIỂN KHAI (DOCKER CONTAINER)

```
                            ┌────────────────────────────────────────────────────────┐
                            │   MongoDB Atlas (Replica Set Cluster)                  │
                            │   cluster0.2paqxox.mongodb.net/ielts_lms_customer      │
                            └───────────────────────────┬────────────────────────────┘
                                                        │ (TLS / Port 27017)
                                                        ▼
┌─────────────────────────┐  (Proxy HTTPS)   ┌───────────────────────────────────────┐
│     VERCEL FRONTEND     │ ───────────────► │       RENDER.COM (Docker Container)   │
│ (https://*.vercel.app)  │                  │   Image: node:22-alpine (non-root)    │
│  Next.js Rewrite Proxy  │                  │   Port: 3000                          │
└─────────────────────────┘                  │   Process: node dist/main             │
                                             │     ├─ NestJS REST API Server         │
                                             │     ├─ BullMQ DeadlineProcessor       │
                                             │     └─ BullMQ DeadlineScheduler (60s) │
                                             └──────────────────┬────────────────────┘
                                                                │ (Port 6379)
                                                                ▼
                                             ┌───────────────────────────────────────┐
                                             │     Render Redis / Upstash Redis      │
                                             │     Prefix: ielts:customer:bull       │
                                             └───────────────────────────────────────┘
```

---

## III. QUY TRÌNH TRIỂN KHAI STEP-BY-STEP

### BƯỚC 1: Kiểm tra kết nối MongoDB Atlas & Network Access
Backend yêu cầu MongoDB Replica Set để chạy Mongoose Transactions (`session.withTransaction`). Cluster Atlas hiện tại của dự án đã sẵn sàng:
* **URI:** `mongodb+srv://mhunguit2005_db_user:eVuAvcJQdPQnnyIw@cluster0.2paqxox.mongodb.net/ielts_lms_customer?retryWrites=true&w=majority`
* **Xác nhận IP Access trên Atlas:**
  1. Vào [cloud.mongodb.com](https://cloud.mongodb.com) -> Chọn cluster của bạn.
  2. Vào **Security** -> **Network Access**.
  3. Đảm bảo IP Address `0.0.0.0/0` đang có trạng thái **Active** (Cho phép kết nối từ bất kỳ máy chủ nào của Render).

---

### BƯỚC 2: Khởi tạo dịch vụ Redis (Render Redis hoặc Upstash)
Redis dùng để lưu trạng thái hàng đợi BullMQ và cronjob quét bài tập quá hạn.

#### Cách 1: Dùng Render Redis (Khuyên dùng)
1. Trên Dashboard [render.com](https://render.com), bấm **New +** -> Chọn **Redis**.
2. Điền:
   - **Name:** `ielts-redis`
   - **Region:** `Singapore` *(Cùng region với Web Service)*
   - **Plan:** Free
3. Bấm **Create Redis**.
4. Vào mục **Connections**, sao chép thông tin:
   - **Host (Internal Redis Host):** thường có dạng `red-xxxxxxxxxxxx`
   - **Port:** `6379`
   - **Password:** (để trống nếu mạng nội bộ không đặt mật khẩu)

#### Cách 2: Dùng Upstash Redis
Tạo 1 database tại [upstash.com](https://upstash.com) ở region `Singapore`, lấy `Host`, `Port 6379` và `Password`.

---

### BƯỚC 3: Tạo Web Service chạy Docker trên Render
1. Trên Render Dashboard, bấm **New +** -> Chọn **Web Service**.
2. Chọn **Build and deploy from a Git repository** -> Kết nối tới repository `WEB-IELTS`.
3. Điền chính xác các mục thiết lập sau:

| Mục cấu hình | Giá trị điền | Giải thích chi tiết |
| :--- | :--- | :--- |
| **Name** | `ielts-lms-backend` | Tên dịch vụ (URL: `https://ielts-lms-backend.onrender.com`) |
| **Region** | `Singapore` | Tối ưu độ trễ thấp nhất về Việt Nam |
| **Branch** | `develop` (hoặc `main`) | Nhánh chứa mã nguồn hoàn chỉnh |
| **Root Directory** | `Backend` | **Bắt buộc**: Render sẽ trỏ vào thư mục `Backend` để đọc Dockerfile |
| **Runtime** | **Docker** | **Chọn Docker** (Render sẽ dùng `Backend/Dockerfile` để build image) |
| **Dockerfile Path** | `./Dockerfile` | Đường dẫn Dockerfile tính từ Root Directory |
| **Docker Build Context** | `.` | Ngữ cảnh build (thư mục `Backend`) |
| **Instance Type** | `Free` (hoặc `Starter` $7/tháng) | Free đủ dùng cho test, Starter chạy 24/7 không sleep |

---

### BƯỚC 4: Nhập Biến Môi Trường (Environment Variables) trên Render

Tại mục **Environment Variables** của Web Service, nhập chính xác danh sách biến môi trường thực tế sau:

```env
# ==============================================================================
# RUNTIME & CỔNG KẾT NỐI DOCKER
# ==============================================================================
NODE_ENV=production
PORT=3000
API_PREFIX=api/v1

# ==============================================================================
# MONGODB ATLAS (Dữ liệu khách hàng thực tế)
# ==============================================================================
MONGODB_URI=mongodb+srv://mhunguit2005_db_user:eVuAvcJQdPQnnyIw@cluster0.2paqxox.mongodb.net/ielts_lms_customer?retryWrites=true&w=majority
MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1

# ==============================================================================
# REDIS (Dành cho BullMQ Worker quét bài tập quá hạn)
# Thay bằng Host thực tế từ Render Redis (red-xxxx) hoặc Upstash
# ==============================================================================
REDIS_HOST=red-xxxxxxxxxxxx
REDIS_PORT=6379
REDIS_PASSWORD=

# ==============================================================================
# BẢO MẬT JWT AUTHENTICATION
# ==============================================================================
JWT_ACCESS_SECRET=LLr3j6TqeHB--GeUSYSUSGIr3i7li1TLzYWzgtgmC3ZZN8DMybnT5G8_HMVAqLm9
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=XYUHTfihJLDPdN5_M2gmyFTnVKmtzJ5XCu_8hu61lIFJA0BH-2fWsUGRd5YKZOlI
JWT_REFRESH_EXPIRES_IN=7d

# ==============================================================================
# CORS (Cho phép Frontend Vercel gọi API)
# ==============================================================================
CORS_ALLOWED_ORIGINS=https://web-ielts.vercel.app,http://localhost:3000,http://localhost:3001

# ==============================================================================
# LƯU TRỮ TỆP TIN AUDIO / ATTACHMENTS
# ==============================================================================
STORAGE_TYPE=disk
STORAGE_LOCAL_PATH=/app/uploads

# ==============================================================================
# EMAIL / THÔNG BÁO (TẠM THỜI CHƯA DÙNG)
# Backend tự động chạy Mock Mode nội bộ, không cần cấu hình tài khoản SMTP
# ==============================================================================
```

> **Cấu hình Health Check Path trên Render:**
> Trong mục **Advanced Settings** của Render Web Service:
> - **Health Check Path:** `/api/v1/health/live`
> - Render sẽ thăm dò đường dẫn này. Khi ứng dụng trả về HTTP 200, Render sẽ tự động chuyển trạng thái sang **Live**.

Bấm **Create Web Service** để Render tiến hành build Docker image và khởi chạy.

---

### BƯỚC 5: Khởi tạo Dữ liệu Database (Indexes & Admin Account)

Sau khi Docker container trên Render chuyển sang trạng thái **Live**, cơ sở dữ liệu `ielts_lms_customer` trên Atlas cần được tạo Index và tạo sẵn tài khoản Admin.

Bạn thực hiện trực tiếp từ máy local thông qua terminal PowerShell:

```powershell
# 1. Di chuyển vào thư mục Backend
cd d:\WORK\WEB-IELTS\Backend

# 2. Khởi tạo toàn bộ Indexes cho các Collection (Đảm bảo hiệu năng và tính toàn vẹn)
npm run init:indexes

# 3. Tạo tài khoản Quản trị viên (Admin)
npm run bootstrap:admin -- --email admin@ielts-lms.edu.vn --password "Admin@123456" --fullname "System Admin"

# 4. (Tùy chọn) Nạp dữ liệu mẫu gồm các đề IELTS, bài đọc, câu hỏi demo
npm run seed
```

---

### BƯỚC 6: Kết nối Frontend (Vercel) tới Backend Docker (Render)

Khi Backend trên Render triển khai thành công, bạn nhận được URL dạng:
`https://ielts-lms-backend.onrender.com`

Vào project Frontend trên Vercel:
1. Vào **Settings** -> **Environment Variables**.
2. Thêm hoặc cập nhật biến:
   - **Key:** `BACKEND_INTERNAL_URL`
   - **Value:** `https://ielts-lms-backend.onrender.com`
   - **Key:** `NEXT_PUBLIC_API_BASE_URL`
   - **Value:** `/api/v1`
   - **Key:** `NEXT_PUBLIC_API_MODE`
   - **Value:** `live`
3. Vào tab **Deployments** -> Bấm dấu 3 chấm -> Chọn **Redeploy** để Frontend nạp cấu hình mới.

---

## IV. BẢNG KIỂM TRA NGHIỆM THU (VERIFICATION CHECKLIST)

| STT | Bước kiểm tra | Phương pháp thực hiện | Kết quả chuẩn |
| :---: | :--- | :--- | :--- |
| **1** | **Docker Container Build Log** | Xem tab **Events** và **Logs** trên Render | - Docker build hoàn thành cả 2 stage `builder` và `runner`<br>- Image size nhỏ gọn (khoảng ~200MB)<br>- Xuất hiện log `🚀 IELTS LMS Backend running on http://localhost:3000` |
| **2** | **Liveness Probe** | Mở trình duyệt: `https://ielts-lms-backend.onrender.com/api/v1/health/live` | `{"status":"ok","info":{"process":{"status":"up"}}}` |
| **3** | **Readiness Probe (DB + Redis)** | Mở trình duyệt: `https://ielts-lms-backend.onrender.com/api/v1/health/ready` | `{"status":"ok","info":{"mongodb":{"status":"up"},"redis":{"status":"up"}}}` |
| **4** | **Swagger API Documentation** | Mở trình duyệt: `https://ielts-lms-backend.onrender.com/api/v1/docs` | Hiển thị đầy đủ tài liệu API tương tác trực tiếp |
| **5** | **BullMQ Worker & Cronjob** | Quan sát log trên Render sau 1-2 phút | Xuất hiện log định kỳ mỗi 60 giây:<br>`[JOB repeatable-deadline-check] Executing scheduled overdue assignments check...` |
| **6** | **End-to-End từ Frontend** | Đăng nhập tài khoản `admin@ielts-lms.edu.vn` trên Vercel | Đăng nhập mượt mà, lưu token, tạo/sửa đề thi, nộp bài dịch passage và xin gia hạn thành công |

---

## V. MẸO DUY TRÌ CONTAINER KHÔNG BỊ SLEEP TRÊN RENDER FREE

Gói Free của Render sẽ tạm dừng container sau 15 phút không nhận được HTTP request. Để giữ container luôn thức 24/7 và để BullMQ scheduler quét bài tập quá hạn liên tục:

1. Đăng ký tài khoản miễn phí tại [uptimerobot.com](https://uptimerobot.com).
2. Tạo 1 monitor:
   - **Type:** `HTTP(s)`
   - **URL:** `https://ielts-lms-backend.onrender.com/api/v1/health/live`
   - **Interval:** `5 minutes`
3. UptimeRobot sẽ gửi request nhẹ mỗi 5 phút, container sẽ luôn duy trì trạng thái **Warm & Active 24/7** hoàn toàn miễn phí.
