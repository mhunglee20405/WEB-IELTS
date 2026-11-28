# HƯỚNG DẪN TRIỂN KHAI PRODUCTION MIỄN PHÍ DỰ ÁN WEB-IELTS
> **Kiến trúc:** Frontend (Vercel) + Backend (Docker trên Render Free 512MB) + MongoDB Atlas + Redis Cloud

---

## I. TỔNG QUAN KIẾN TRÚC & CHECKLIST CHUẨN BỊ

### 1. Sơ đồ luồng hoạt động
```
[Học viên / Giáo viên]
         │
         ▼ (HTTPS)
┌────────────────────────────────────────────────────────┐
│               VERCEL (Global Edge CDN)                 │
│   Frontend Next.js 16 (App Router + React 19)          │
│   - Rewrite Proxy: /api/v1/* ──► Render Backend        │
└───────────────────────────┬────────────────────────────┘
                            │ (Server-to-Server HTTPS)
                            ▼
┌────────────────────────────────────────────────────────┐
│             RENDER.COM (Docker Container)              │
│   Gói Free: 512MB RAM / 0.1 CPU                        │
│   Image kéo từ: ghcr.io/<owner>/web-ielts-backend      │
│   - Port: 3000 (bind 0.0.0.0)                          │
│   - Memory cap: V8 max-old-space-size = 384MB          │
│   - Runtime: NestJS API + BullMQ Worker + Scheduler    │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│   MongoDB Atlas (M0 Free)    │ │ Upstash Redis / Render Redis │
│   - 3-Node Replica Set       │ │ - Lưu trữ hàng đợi BullMQ    │
│   - Hỗ trợ Mongoose Tx       │ │ - Cronjob quét deadline 60s  │
└──────────────────────────────┘ └──────────────────────────────┘
```

### 2. Checklist tài khoản & dịch vụ cần chuẩn bị trước:
- [ ] **GitHub Account:** Repository chứa mã nguồn dự án (`mhunglee20405/WEB-IELTS`).
- [ ] **Render Account:** Đăng ký miễn phí tại [render.com](https://render.com).
- [ ] **Vercel Account:** Đăng ký miễn phí tại [vercel.com](https://vercel.com) (kết nối tài khoản GitHub).
- [ ] **MongoDB Atlas Account:** Đăng ký tại [cloud.mongodb.com](https://cloud.mongodb.com) (tạo cluster M0 Free, đã bật sẵn Replica Set).
- [ ] **Redis Account:** Dùng **Render Redis** (tạo trực tiếp trên Render) hoặc **Upstash Redis** ([upstash.com](https://upstash.com)).

---

## II. KẾT QUẢ AUDIT CODEBASE & NHỮNG VIỆC CẦN LƯU Ý / ĐIỀU CHỈNH

Dựa trên việc kiểm tra toàn bộ mã nguồn hiện tại của dự án:

| Hạng mục kiểm tra | Trạng thái hiện tại | Đánh giá & Việc cần làm |
| :--- | :--- | :--- |
| **1. Cổng (Port) & Host** | `app.listen(port)` đọc `process.env.PORT` | Cần đảm bảo backend lắng nghe rõ ràng trên host `0.0.0.0` (thay vì mặc định có thể trỏ `localhost`) để Render có thể định tuyến lưu lượng vào container Docker. |
| **2. Kiểm soát RAM 512MB** | Node.js V8 mặc định có thể dùng tới 1.4GB RAM | **Rất nguy hiểm trên Render Free (512MB):** Container sẽ bị hệ thống Render "kill" ngay lập tức (lỗi OOM Exit Code 137). Cần cấu hình biến môi trường `NODE_OPTIONS="--max-old-space-size=384"` để Node dọn rác trước khi vượt quá 512MB. |
| **3. Cấu hình CORS** | Đã hỗ trợ `CORS_ALLOWED_ORIGINS` | Đã hỗ trợ danh sách domain từ env. Ngoài ra, Frontend đã có cơ chế `rewrites` trong `next.config.ts`, giúp chuyển tiếp server-to-server và triệt tiêu 100% lỗi CORS. |
| **4. Docker & .dockerignore** | Đã có `Backend/Dockerfile` multi-stage build và `.dockerignore` | Dockerfile đã tối ưu chạy trên `node:22-alpine` với user không có quyền root (`appuser`). File `.dockerignore` đã chặn rò rỉ `node_modules` và `.env` vào image. |
| **5. CI/CD GitHub Actions** | Đã có workflow `.github/workflows/deploy.yml` | Workflow tự động kích hoạt khi push code vào nhánh `main`, build Docker image tối ưu đẩy lên `ghcr.io`, và kích hoạt Render Deploy Hook. |
| **6. Health check & Lưu trữ** | Đã có `/api/v1/health/live` và `/api/v1/health/ready` | Health check đã chuẩn NestJS Terminus. Về lưu trữ: Ổ cứng Render Free là **tạm thời (ephemeral)**, nếu có tệp tải lên cần dùng Cloudflare R2 / AWS S3 nếu muốn lưu trữ vĩnh viễn sau các lần khởi động lại. |

### Chi tiết các vị trí code ứng dụng cần sửa đổi (để duyệt trước khi sửa):

1. **Host Binding (`Backend/src/main.ts` - Dòng 16):**
   - **Hiện tại:** `await app.listen(port);`
   - **Cần sửa:** `await app.listen(port, '0.0.0.0');`
   - **Lý do:** Trong Docker trên Render, nếu không chỉ định rõ ràng `0.0.0.0`, Node.js có thể bind vào `127.0.0.1` (loopback nội bộ), khiến reverse proxy của Render không thể chuyển tiếp request bên ngoài vào container.

2. **CORS Origins (`Backend/src/config/configuration.ts` - Dòng 93):**
   - **Hiện tại:** `allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(',')`
   - **Không cần sửa code**, chỉ cần khai báo biến `CORS_ALLOWED_ORIGINS` trên Render bao gồm domain Frontend (ví dụ `https://web-ielts.vercel.app,http://localhost:3000`). Ngoài ra, Next.js rewrite proxy ở Frontend đã tự loại trừ CORS cho các request xuất phát từ web.

3. **Redis URL / Connection (`Backend/src/config/configuration.ts` - Dòng 51-62 & `Backend/src/app.module.ts` - Dòng 50-51):**
   - **Hiện tại:** Đang đọc 3 biến riêng lẻ `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.
   - **Nếu dùng Render Managed Redis:** Điền trực tiếp `REDIS_HOST=red-xxxxxxxxxxxx` và `REDIS_PORT=6379` (không cần password, không cần sửa code).
   - **Nếu dùng Upstash Redis (chuỗi URL dạng `rediss://...`):** Cần sửa code để parse chuỗi `REDIS_URL` hoặc bổ sung tùy chọn `tls: {}` trong cấu hình ioredis/bullmq. Khuyến nghị dùng **Render Managed Redis** để không cần can thiệp logic code.

---

## III. BẢNG BIẾN MÔI TRƯỜNG (ENVIRONMENT VARIABLES) CHI TIẾT

### 1. Biến môi trường cho Backend (Cấu hình trên Render Web Service)

| Tên biến (Key) | Giá trị thực tế của dự án | Giải thích ý nghĩa |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Bật chế độ production tối ưu hiệu năng |
| `PORT` | `3000` | Cổng HTTP server bên trong Docker container (khớp với `EXPOSE 3000`) |
| `API_PREFIX` | `api/v1` | Tiền tố cho toàn bộ REST API endpoint |
| `NODE_OPTIONS` | `--max-old-space-size=384` | **Tối ưu RAM 512MB:** Giới hạn V8 Heap tối đa 384MB để không bị OOM Kill |
| `HEALTH_HEAP_THRESHOLD_MB` | `384` | Ngưỡng kiểm tra cảnh báo bộ nhớ trong endpoint `/health/memory` |
| `MONGODB_URI` | `mongodb+srv://mhunguit2005_db_user:eVuAvcJQdPQnnyIw@cluster0.2paqxox.mongodb.net/ielts_lms_customer?retryWrites=true&w=majority` | Chuỗi kết nối MongoDB Atlas (Replica Set cho Transaction) |
| `MONGODB_DNS_SERVERS` | `8.8.8.8,1.1.1.1` | Override DNS resolver tránh lỗi phân giải SRV trên cloud |
| `REDIS_HOST` | `red-xxxxxxxxxxxx` (hoặc Upstash endpoint) | Host máy chủ Redis để chạy BullMQ Worker |
| `REDIS_PORT` | `6379` | Cổng kết nối Redis |
| `REDIS_PASSWORD` | *(Mật khẩu Redis hoặc để trống)* | Mật khẩu xác thực Redis |
| `JWT_ACCESS_SECRET` | `LLr3j6TqeHB--GeUSYSUSGIr3i7li1TLzYWzgtgmC3ZZN8DMybnT5G8_HMVAqLm9` | Khóa bí mật ký JWT Access Token (tối thiểu 32 ký tự) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Thời gian hết hạn của Access Token |
| `JWT_REFRESH_SECRET` | `XYUHTfihJLDPdN5_M2gmyFTnVKmtzJ5XCu_8hu61lIFJA0BH-2fWsUGRd5YKZOlI` | Khóa bí mật ký JWT Refresh Token |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Thời gian hết hạn của Refresh Token |
| `CORS_ALLOWED_ORIGINS` | `https://web-ielts.vercel.app,http://localhost:3000` | Danh sách domain được phép gọi API trực tiếp |
| `STORAGE_TYPE` | `disk` | Kiểu lưu trữ (cục bộ) |
| `STORAGE_LOCAL_PATH` | `/app/uploads` | Thư mục lưu file trong container |

---

### 2. Biến môi trường cho Frontend (Cấu hình trên Vercel Project)

| Tên biến (Key) | Giá trị cấu hình | Giải thích ý nghĩa |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_MODE` | `live` | **Bắt buộc:** Kích hoạt chế độ gọi API thật (thay vì dùng in-memory mock) |
| `BACKEND_INTERNAL_URL` | `https://ielts-lms-backend.onrender.com` | URL của Backend trên Render dùng cho Next.js server rewrite proxy |
| `NEXT_PUBLIC_API_BASE_URL` | `/api/v1` | Đường dẫn API tương đối (trình duyệt gọi cùng domain, loại bỏ hoàn toàn lỗi CORS) |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `Asia/Ho_Chi_Minh` | Thiết lập múi giờ Việt Nam (GMT+7) cho hệ thống bài tập và lịch thi |

---

## IV. HƯỚNG DẪN CẤU HÌNH TỪNG BƯỚC

### BƯỚC 1: Chuẩn bị MongoDB Atlas & Redis
1. **MongoDB Atlas:**
   - Đăng nhập [cloud.mongodb.com](https://cloud.mongodb.com) -> Vào **Network Access**.
   - Đảm bảo đã thêm IP `0.0.0.0/0` (Allow Access from Anywhere) để Render kết nối được.
2. **Redis Service:**
   - Tạo Redis trên [render.com](https://render.com) (chọn **New +** -> **Redis**, Region: `Singapore`).
   - Sao chép **Internal Redis Host** (dạng `red-xxxxxxxxxxxx`) và **Port** `6379`.

---

### BƯỚC 2: Cấu hình GitHub Actions & Quyền cho GitHub Packages (GHCR)
1. **Kiểm tra workflow:** File `.github/workflows/deploy.yml` đã được thiết lập sẵn trong repo (tự động kích hoạt khi push vào nhánh `main` hoặc kích hoạt thủ công qua `workflow_dispatch`).
2. **Kích hoạt build Docker image:**
   - Commit và push code lên nhánh `main`:
     ```bash
     git push origin main
     ```
   - Vào tab **Actions** trên GitHub để theo dõi build Docker và push image lên `ghcr.io`.
3. **Chuyển quyền Package sang Public (để Render kéo image không cần mật khẩu):**
   - Vào trang cá nhân GitHub: `https://github.com/mhunglee20405?tab=packages`.
   - Bấm vào package **`web-ielts-backend`** -> Bấm **Package settings** (cột bên phải).
   - Cuộn xuống **Danger Zone** -> **Change package visibility** -> Chọn **Public**.
   *(Nếu muốn giữ Private, bạn cần tạo GitHub Personal Access Token và khai báo vào mục Image Credentials trên Render)*.

---

### BƯỚC 3: Tạo Free Web Service trên Render từ Image GHCR
1. Đăng nhập [render.com](https://render.com) -> Bấm **New +** -> Chọn **Web Service**.
2. Chọn tab: **Existing Image** (Deploy an existing image from a registry).
3. Nhập đường dẫn image trên GitHub Packages:
   ```text
   ghcr.io/mhunglee20405/web-ielts-backend:latest
   ```
4. Điền các trường thông số:
   - **Name:** `ielts-lms-backend`
   - **Region:** `Singapore`
   - **Instance Type:** `Free` (512MB RAM / 0.1 CPU)
5. Nhập toàn bộ biến môi trường ở **Mục III.1** vào phần **Environment Variables**.
6. Mục **Advanced**:
   - **Health Check Path:** `/api/v1/health/live`
7. Bấm **Create Web Service**. Render sẽ kéo image về và khởi động container trong vòng 30 giây.

---

### BƯỚC 4: Lấy Deploy Hook để tự động hóa 100% CI/CD
1. Sau khi service trên Render tạo xong, vào tab **Settings** của service đó.
2. Cuộn xuống mục **Deploy Hook** -> Sao chép URL có dạng: `https://api.render.com/deploy/srv-xxxx?key=yyyy`.
3. Quay lại GitHub repository: `https://github.com/mhunglee20405/WEB-IELTS/settings/secrets/actions`.
4. Bấm **New repository secret**:
   - **Name:** `RENDER_DEPLOY_HOOK_URL`
   - **Value:** *(Dán URL Deploy Hook vừa copy)*
5. Bấm **Add secret**.
*Từ thời điểm này, mỗi khi push code Backend lên GitHub, GitHub Actions sẽ tự build Docker image và tự kích hoạt Render deploy bản mới hoàn toàn tự động!*

---

### BƯỚC 5: Khởi tạo Database Indexes & Tài khoản Quản trị (Admin)
Sau khi Backend trên Render chuyển trạng thái **Live**, chạy lệnh khởi tạo từ máy local:
```powershell
cd Backend

# 1. Khởi tạo toàn bộ Indexes trên MongoDB Atlas
npm run init:indexes

# 2. Tạo tài khoản Admin hệ thống
npm run bootstrap:admin -- --email admin@ielts-lms.edu.vn --password "Admin@123456" --fullname "System Admin"
```

---

### BƯỚC 6: Deploy Frontend lên Vercel
1. Đăng nhập [vercel.com](https://vercel.com) -> Bấm **Add New...** -> **Project**.
2. Chọn repository `WEB-IELTS` -> Bấm **Import**.
3. **Cấu hình Project Settings:**
   - **Framework Preset:** `Next.js`
   - **Root Directory:** Bấm **Edit** -> Chọn thư mục `frontend` -> Bấm **Continue**.
4. **Nhập Biến môi trường:** Thêm đầy đủ 4 biến ở **Mục III.2**:
   - `NEXT_PUBLIC_API_MODE`: `live`
   - `BACKEND_INTERNAL_URL`: `https://ielts-lms-backend.onrender.com`
   - `NEXT_PUBLIC_API_BASE_URL`: `/api/v1`
   - `NEXT_PUBLIC_DEFAULT_TIMEZONE`: `Asia/Ho_Chi_Minh`
5. Bấm **Deploy**. Vercel sẽ tự động build và xuất bản trang web.

---

## V. CÁC LƯU Ý KHI VẬN HÀNH & XỬ LÝ SỰ CỐ (TROUBLESHOOTING)

### 1. Giới hạn 512MB RAM trên Render Free
- **Hiện tượng lỗi OOM (Out Of Memory):** Log trên Render xuất hiện `Exit Code 137` hoặc `Killed`.
- **Cách phòng ngừa:** Đảm bảo biến `NODE_OPTIONS="--max-old-space-size=384"` luôn tồn tại trong tab Environment. Cờ này ép V8 dọn dẹp bộ nhớ (Garbage Collection) trước khi chạm trần 512MB của Render.

### 2. Hiện tượng Render Free tự ngủ (Cold Start)
- Gói Free của Render sẽ tạm dừng (spin down) container nếu không có request trong vòng **15 phút**.
- Khi có học viên truy cập lại, server sẽ mất từ **30 - 50 giây** để khởi động lại, đồng thời job quét bài tập quá hạn của BullMQ cũng tạm dừng trong lúc ngủ.
- **Giải pháp giữ server chạy 24/7 hoàn toàn miễn phí:**
  1. Tạo tài khoản miễn phí tại [uptimerobot.com](https://uptimerobot.com).
  2. Tạo 1 monitor kiểm tra định kỳ mỗi **5 phút** gửi request `GET` đến:
     `https://ielts-lms-backend.onrender.com/api/v1/health/live`
  3. Server sẽ luôn duy trì trạng thái thức và BullMQ chạy liên tục không bị gián đoạn.

### 3. Vấn đề lưu trữ tệp tin (Audio / Attachments)
- Ổ cứng của Render Free là **Ephemeral** (mọi file tải lên thư mục `/app/uploads` sẽ bị xóa sạch nếu container khởi động lại hoặc deploy bản mới).
- Trong giai đoạn thử nghiệm: Dùng các bài nghe IELTS có link CDN bên ngoài hoặc dữ liệu seed sẵn.
- Khi lên production thực tế: Cần cấu hình lưu file sang các dịch vụ Object Storage miễn phí/rẻ như **Cloudflare R2** (10GB miễn phí, không tính phí băng thông) hoặc **AWS S3**.

### 4. Cách kiểm tra lỗi (Debugging)
- **Lỗi không gọi được API từ Frontend:** Mở DevTools (F12) trên trình duyệt -> tab **Network**. Kiểm tra xem request `/api/v1/...` trả về mã lỗi gì (401, 403, 500 hay 502 Bad Gateway). Nếu 502/503 nghĩa là Backend trên Render chưa khởi động xong hoặc bị crash.
- **Lỗi kết nối Database / Redis:** Mở URL `https://ielts-lms-backend.onrender.com/api/v1/health/ready` để xem MongoDB hay Redis đang bị `down`.
- **Xem log thời gian thực:** Vào Dashboard Render -> chọn Web Service `ielts-lms-backend` -> tab **Logs** để theo dõi lỗi chi tiết của Node.js.
