# HƯỚNG DẪN CHI TIẾT DEPLOY BACKEND (NESTJS) LÊN RENDER.COM

Tài liệu này cung cấp toàn bộ quy trình triển khai Backend `WEB-IELTS` lên nền tảng **Render.com**, bám sát chính xác 100% cấu trúc mã nguồn, cơ chế hàng đợi BullMQ, và các thông số cấu hình thực tế hiện tại của dự án.

---

## I. TỔNG QUAN KIẾN TRÚC VÀ CÁC THÀNH PHẦN BACKEND

Backend của hệ thống được xây dựng bằng **NestJS (Node.js)** và bao gồm 3 khối chức năng chạy hợp nhất trong một tiến trình (`node dist/main`):
1. **REST API Service:** Xử lý toàn bộ logic nghiệp vụ (Auth, Thi IELTS, Quản lý kho đề, Làm bài, Nộp bản dịch, Xin gia hạn...).
2. **BullMQ Background Workers:** Xử lý tác vụ ngầm gồm `DeadlineProcessor` (quét bài tập quá hạn, tính điểm phạt). *(Tính năng gửi email/thông báo qua email hiện tạm thời chưa sử dụng, hệ thống tự động chạy ở chế độ Mock an toàn mà không yêu cầu cấu hình SMTP thật)*.
3. **BullMQ Deadline Scheduler:** Định kỳ mỗi 60 giây gửi job kiểm tra hạn nộp tự động.

Do đó, trên Render chỉ cần tạo **1 Web Service duy nhất** là có thể chạy cả API lẫn Background Workers.

```
                                      ┌────────────────────────────────────────────────────────┐
                                      │   MongoDB Atlas (Replica Set Cluster)                  │
                                      │   cluster0.2paqxox.mongodb.net/ielts_lms_customer      │
                                      └───────────────────────────┬────────────────────────────┘
                                                                  │
[Vercel Frontend] ──────(Proxy HTTPS /api/v1/*)──────► ┌──────────┴────────────────────────────┐
(https://web-ielts-xxx.vercel.app)                     │       RENDER.COM (Web Service)        │
                                                       │   Backend: NestJS API + BullMQ Worker │
                                                       └──────────┬────────────────────────────┘
                                                                  │
                                      ┌───────────────────────────┴────────────────────────────┐
                                      │   Render Redis / Upstash Redis                         │
                                      │   Quản lý hàng đợi: ielts:customer:bull                │
                                      └────────────────────────────────────────────────────────┘
```

---

## II. BƯỚC 1: CHUẨN BỊ MONGODB ATLAS (CÓ SẴN REPLICA SET)

Backend sử dụng Mongoose Transaction (`session.withTransaction`) khi thực hiện các tác vụ trọng yếu (nộp bài thi, chấm điểm, phê duyệt gia hạn). MongoDB Atlas Cluster M0 (Free) đã được cấu hình Replica Set 3 node sẵn sàng.

### Thông tin kết nối thực tế của dự án:
* **URI:** `mongodb+srv://mhunguit2005_db_user:eVuAvcJQdPQnnyIw@cluster0.2paqxox.mongodb.net/ielts_lms_customer?retryWrites=true&w=majority`
* **Database Name:** `ielts_lms_customer`

### Kiểm tra cấu hình trên MongoDB Atlas:
1. Đăng nhập [cloud.mongodb.com](https://cloud.mongodb.com).
2. Vào mục **Security** -> **Network Access**.
3. Đảm bảo đã có bản ghi IP Whitelist: `0.0.0.0/0` (Status: **Active**) để Render có thể kết nối từ bất kỳ máy chủ nào. Nếu chưa có, bấm **Add IP Address** -> Chọn **Allow Access from Anywhere**.

---

## III. BƯỚC 2: TẠO DỊCH VỤ REDIS CHO HÀNG ĐỢI BULLMQ

BullMQ yêu cầu Redis để quản lý hàng đợi và cron job quét deadline. Bạn chọn 1 trong 2 cách sau:

### Cách A: Tạo Redis trực tiếp trên Render (Khuyên dùng)
1. Trên Dashboard của [render.com](https://render.com), bấm **New +** -> Chọn **Redis**.
2. Điền thông tin:
   * **Name:** `ielts-redis`
   * **Region:** `Singapore` (Cùng region với Web Service để độ trễ thấp nhất)
   * **Plan:** Free (hoặc Starter $7/tháng)
3. Bấm **Create Redis**.
4. Sau khi tạo xong, cuộn xuống mục **Connections**:
   * Sao chép **Internal Redis URL** (dạng `redis://red-xxxxxxxx:6379`).
   * Ghi nhận:
     * **Host:** `red-xxxxxxxx`
     * **Port:** `6379`
     * **Password:** (Render Redis thường không yêu cầu pass ở mạng internal, hoặc lấy tại mục Password nếu có).

### Cách B: Dùng Upstash Redis (Serverless Free)
1. Đăng ký tại [upstash.com](https://upstash.com) -> Tạo Database Redis đặt tại region `ap-southeast-1` (Singapore).
2. Lấy thông tin kết nối:
   * **Host:** `xxxx.upstash.io`
   * **Port:** `6379`
   * **Password:** chuỗi mật khẩu Upstash cung cấp.

---

## IV. BƯỚC 3: TẠO VÀ CẤU HÌNH WEB SERVICE TRÊN RENDER

1. Trên Dashboard Render, bấm **New +** -> Chọn **Web Service**.
2. Chọn **Build and deploy from a Git repository** -> Kết nối tới repository chứa code dự án (`WEB-IELTS`).
3. Điền các trường cấu hình chi tiết bám sát backend (chọn 1 trong 2 tùy chọn Runtime):

### Tùy chọn A: Triển khai bằng DOCKER (KHUYÊN DÙNG ⭐)
Dự án đã có sẵn file `Backend/Dockerfile` với kiến trúc multi-stage build chuẩn (Node 22-alpine, chạy bằng non-root user `appuser`, tích hợp sẵn healthcheck tự động):

| Mục cấu hình | Giá trị điền | Giải thích |
| :--- | :--- | :--- |
| **Name** | `ielts-lms-backend` | Tên dịch vụ trên Render |
| **Region** | `Singapore` | Tối ưu đường truyền gần Việt Nam nhất |
| **Branch** | `hotfix/exam-creation-and-nav` (hoặc `develop` / `main`) | Nhánh chứa code bạn muốn chạy |
| **Root Directory** | `Backend` | **Bắt buộc**: Render sẽ nhận diện `Backend/Dockerfile` |
| **Runtime** | `Docker` | Render sẽ tự động build từ Dockerfile |
| **Dockerfile Path** | `./Dockerfile` | Đường dẫn Dockerfile trong thư mục `Backend` |
| **Docker Context** | `.` | Thư mục ngữ cảnh build |
| **Instance Type** | `Free` (hoặc `Starter` $7/tháng) | Free đủ dùng cho test, Starter giúp chạy 24/7 không sleep |

---

### Tùy chọn B: Triển khai bằng NATIVE NODE RUNTIME (Không dùng Docker)
Nếu không dùng Docker, bạn chọn Runtime là `Node`:

| Mục cấu hình | Giá trị điền | Giải thích |
| :--- | :--- | :--- |
| **Name** | `ielts-lms-backend` | Tên dịch vụ trên Render |
| **Region** | `Singapore` | Tối ưu đường truyền gần Việt Nam nhất |
| **Branch** | `hotfix/exam-creation-and-nav` (hoặc `develop` / `main`) | Nhánh chứa code bạn muốn chạy |
| **Root Directory** | `Backend` | **Bắt buộc**: Render sẽ `cd Backend` |
| **Runtime** | `Node` | Môi trường thực thi Node.js tiêu chuẩn |
| **Build Command** | `npm install && npm run build` | Cài đặt package và chạy `nest build` tạo thư mục `dist/` |
| **Start Command** | `npm run start:prod` | Chạy ứng dụng production (`node dist/main`) |
| **Instance Type** | `Free` (hoặc `Starter` $7/tháng) | Free đủ dùng cho test, Starter giúp chạy 24/7 không sleep |

---

## V. BƯỚC 4: THIẾT LẬP BIẾN MÔI TRƯỜNG (ENVIRONMENT VARIABLES) TRÊN RENDER

Tại trang cấu hình Web Service, cuộn xuống mục **Environment Variables** (hoặc tab **Environment** sau khi tạo), bấm **Add Environment Variable** và thêm chính xác toàn bộ danh sách biến sau:

```env
# ==============================================================================
# RUNTIME & HTTP SERVER
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
# REDIS (Kết nối BullMQ Worker & Scheduler)
# Thay giá trị REDIS_HOST bằng host của Render Redis (red-xxxx) hoặc Upstash
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
# CORS CHO PHÉP FRONTEND VERCEL GỌI API
# Điền domain Vercel thực tế của bạn và localhost để kiểm thử
# ==============================================================================
CORS_ALLOWED_ORIGINS=https://web-ielts.vercel.app,http://localhost:3000,http://localhost:3001

# ==============================================================================
# LƯU TRỮ TỆP TIN / AUDIO UPLOAD
# ==============================================================================
STORAGE_TYPE=disk
STORAGE_LOCAL_PATH=./uploads

# ==============================================================================
# EMAIL / THÔNG BÁO QUA EMAIL (TẠM THỜI CHƯA SỬ DỤNG)
# Tính năng gửi email/thông báo qua email hiện tạm thời chưa có/chưa cần dùng.
# Backend đã được cấu hình fallback tự động sang chế độ Mock Mode (ghi log nội bộ).
# => BẠN HOÀN TOÀN KHÔNG CẦN CẤU HÌNH CÁC BIẾN SMTP TRÊN RENDER.
# (Hệ thống sẽ tự nhận giá trị mặc định an toàn và khởi động bình thường).
# ==============================================================================
```

> **Lưu ý:** Sau khi điền xong, bấm **Deploy Web Service**. Render sẽ pull code, chạy `npm install && npm run build` và khởi động service. Quá trình mất khoảng 2-3 phút.

---

## VI. BƯỚC 5: KHỞI TẠO DỮ LIỆU BAN ĐẦU TRÊN MONGODB ATLAS

Sau khi Render báo deploy thành công (`Your service is live`), cơ sở dữ liệu `ielts_lms_customer` trên MongoDB Atlas cần được tạo Index và tạo sẵn tài khoản Admin để đăng nhập.

Bạn có thể chạy các script có sẵn của dự án trực tiếp từ máy tính của bạn (vì Atlas cho phép kết nối từ xa):

Mở terminal PowerShell tại máy local:

```powershell
# Di chuyển vào thư mục Backend
cd d:\WORK\WEB-IELTS\Backend

# 1. Khởi tạo toàn bộ Indexes cho các Collection (Tránh trùng lặp dữ liệu và tăng tốc query)
npm run init:indexes

# 2. Khởi tạo tài khoản Administrator hệ thống
npm run bootstrap:admin -- --email admin@ielts-lms.edu.vn --password "Admin@123456" --fullname "System Admin"
```

Khi chạy xong, tài khoản đăng nhập quản trị của bạn là:
* **Email:** `admin@ielts-lms.edu.vn`
* **Mật khẩu:** `Admin@123456`

*(Nếu muốn tạo sẵn các đề thi mẫu, bài tập mẫu và dữ liệu demo học viên, bạn có thể chạy thêm lệnh: `npm run seed`)*.

---

## VII. BƯỚC 6: KẾT NỐI FRONTEND TRÊN VERCEL VỚI BACKEND RENDER

Khi Backend trên Render triển khai thành công, bạn sẽ có URL của dịch vụ, ví dụ:
`https://ielts-lms-backend.onrender.com`

Frontend Next.js trong file `frontend/next.config.ts` đã được lập trình sẵn cơ chế Rewrite:
```typescript
async rewrites() {
  const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:3000";
  return [
    {
      source: "/api/v1/:path*",
      destination: `${backendUrl}/api/v1/:path*`,
    },
  ];
}
```

### Các bước cài đặt trên Vercel:
1. Đăng nhập [vercel.com](https://vercel.com) -> Mở dự án Frontend `web-ielts`.
2. Vào **Settings** -> Chọn mục **Environment Variables**.
3. Thêm biến môi trường mới:
   * **Key:** `BACKEND_INTERNAL_URL`
   * **Value:** `https://ielts-lms-backend.onrender.com` *(Thay bằng URL thật trên Render của bạn, không để dấu gạch chéo `/` ở cuối)*
   * **Environment:** Chọn cả `Production`, `Preview`, `Development`.
4. Bấm **Save**.
5. Vào tab **Deployments** trên Vercel, bấm biểu tượng 3 chấm ở bản deploy mới nhất -> Chọn **Redeploy** để Vercel nạp biến môi trường mới.

---

## VIII. BƯỚC 7: KIỂM TRA VÀ NGHIỆM THU SAU KHI DEPLOY

Thực hiện các bước kiểm tra theo thứ tự sau:

### 1. Kiểm tra Health Check Endpoint:
Mở trình duyệt truy cập:
`https://ielts-lms-backend.onrender.com/api/v1/health`
* **Kết quả đạt:** Trả về JSON trạng thái `status: "ok"`, `mongoose` và `redis` đều ở trạng thái `up`.

### 2. Kiểm tra Swagger Documentation:
Mở trình duyệt truy cập:
`https://ielts-lms-backend.onrender.com/api/v1/docs`
* **Kết quả đạt:** Hiển thị giao diện Swagger UI với đầy đủ tài liệu API của tất cả module.

### 3. Kiểm tra Log BullMQ Worker trên Render:
Vào Dashboard Render -> Bấm vào Web Service `ielts-lms-backend` -> Mở tab **Logs**:
* **Kết quả đạt:**
  - Thấy dòng: `🚀 IELTS LMS Backend running on http://localhost:3000`
  - Thấy dòng: `Registered repeatable overdue checking job (every 60s)`
  - Thấy các dòng log định kỳ: `Executing scheduled overdue assignments check...` (chứng tỏ scheduler và processor đang chạy ngầm ổn định).

### 4. Kiểm tra trải nghiệm thực tế từ Frontend (Vercel):
- Mở link trang web trên Vercel (ví dụ: `https://web-ielts.vercel.app/login`).
- Đăng nhập bằng tài khoản Admin: `admin@ielts-lms.edu.vn` / `Admin@123456`.
- Kiểm tra tính năng **Kho đề thi**: Bấm nút **Sửa** đề thi, lưu bản nháp hoặc cập nhật đề xuất bản.
- Kiểm tra tính năng **Làm bài thi IELTS** và **Dịch passage ngay**: Nộp bài dịch thành công, không gặp lỗi `400 Bad Request`.
- Kiểm tra tính năng **Xin gia hạn**: Chọn ngày mới trên lịch và gửi yêu cầu gia hạn, hạn nộp mới được đồng bộ theo giờ Việt Nam (GMT+7).

---

## IX. LƯU Ý QUAN TRỌNG: GIỮ CHO RENDER FREE TIER LUÔN HOẠT ĐỘNG (WARM UP)

Nếu bạn sử dụng gói **Free** của Render:
- Render sẽ tự động tạm ngưng Web Service nếu không có request trong vòng **15 phút**.
- Khi bị ngưng, nếu có học viên truy cập, server sẽ mất từ **30 đến 50 giây** để khởi động lại (Cold Start). Đồng thời khi server ngủ thì job BullMQ quét deadline định kỳ mỗi 60s cũng sẽ tạm dừng.

### Giải pháp giữ server luôn chạy 24/7 (Hoàn toàn miễn phí):
1. Đăng ký tài khoản miễn phí tại [uptimerobot.com](https://uptimerobot.com) hoặc [cron-job.org](https://cron-job.org).
2. Tạo 1 Monitor:
   * **Monitor Type:** `HTTP(s)`
   * **Friendly Name:** `IELTS Backend Keep-Alive`
   * **URL:** `https://ielts-lms-backend.onrender.com/api/v1/health`
   * **Monitoring Interval:** `5 minutes` (mỗi 5 phút gửi 1 ping)
3. Nhờ các ping đều đặn này, Render sẽ xem server luôn có traffic và **không bao giờ bị sleep**, giữ cho toàn bộ API và BullMQ Scheduler hoạt động liên tục 24/7 như một gói trả phí.
