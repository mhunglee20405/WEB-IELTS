# HƯỚNG DẪN CHI TIẾT DEPLOY FRONTEND (NEXT.JS) LÊN VERCEL

Tài liệu này cung cấp toàn bộ quy trình triển khai ứng dụng Frontend Next.js (`WEB-IELTS/frontend`) lên nền tảng **Vercel**, bám sát chính xác 100% cấu trúc mã nguồn, cấu hình Reverse Proxy, cơ chế sao chép tài nguyên soạn thảo TinyMCE và cách kết nối mượt mà với Backend chạy trên Render.

---

## I. TỔNG QUAN KIẾN TRÚC FRONTEND

* **Framework:** Next.js 16 (App Router, Webpack Builder)
* **Thư viện giao diện:** React 19, Tailwind CSS, Lucide Icons, TinyMCE 8 (Rich Text Editor).
* **Quản lý State & Data Fetching:** TanStack React Query v5.
* **Cơ chế gọi API:**
  - `NEXT_PUBLIC_API_MODE=live` (Kết nối trực tiếp tới Backend REST API).
  - Sử dụng cơ chế **Next.js Rewrite Proxy** được định nghĩa trong file `frontend/next.config.ts` để chuyển tiếp an toàn các request `/api/v1/*` sang Backend Render mà không lo bị chặn CORS.

```
[Trình duyệt Người dùng]
        │
        ▼ (HTTPS)
┌────────────────────────────────────────────────────────┐
│               VERCEL (Global Edge CDN)                 │
│   Next.js App: SSR, Static Pages, Dynamic Routing      │
│                                                        │
│   ┌────────────────────────────────────────────────┐   │
│   │ Next.js Rewrite Proxy:                         │   │
│   │ /api/v1/:path* ──► ${BACKEND_INTERNAL_URL}    │   │
│   └───────────────────────┬────────────────────────┘   │
└───────────────────────────┼────────────────────────────┘
                            │ (Server-to-Server HTTPS)
                            ▼
┌────────────────────────────────────────────────────────┐
│             RENDER.COM (Backend Service)               │
│   https://ielts-lms-backend.onrender.com/api/v1        │
└────────────────────────────────────────────────────────┘
```

---

## II. BƯỚC 1: CHUẨN BỊ TRƯỚC KHI DEPLOY

1. **URL của Backend:** Đảm bảo Backend trên Render đã triển khai thành công và có URL công khai, ví dụ:
   `https://ielts-lms-backend.onrender.com`
2. **Kiểm tra CORS trên Backend Render:**
   - Trong biến môi trường `CORS_ALLOWED_ORIGINS` của Backend trên Render, hãy đảm bảo có domain của Vercel (hoặc cho phép domain dạng `https://*.vercel.app` nếu cần).
3. **Mã nguồn trên GitHub/GitLab:**
   - Đảm bảo mã nguồn frontend đã được push lên repository của bạn.

---

## III. BƯỚC 2: TẠO PROJECT TRÊN VERCEL (TỪNG BƯỚC CHI TIẾT)

1. Đăng nhập vào tài khoản Vercel của bạn tại [vercel.com](https://vercel.com).
2. Tại trang **Overview**, bấm nút **Add New...** ở góc phải trên -> Chọn **Project**.
3. Tại danh sách GitHub/GitLab repositories, tìm repository của dự án (`WEB-IELTS`) và bấm nút **Import**.
4. Thiết lập mục **Configure Project**:

| Mục cấu hình | Giá trị thiết lập | Hướng dẫn thao tác |
| :--- | :--- | :--- |
| **Project Name** | `web-ielts` (hoặc tên tùy chọn) | Đặt tên định danh trên Vercel |
| **Framework Preset** | `Next.js` | Vercel tự động nhận diện |
| **Root Directory** | `frontend` | **BẮT BUỘC:** Bấm nút **Edit** cạnh Root Directory, gõ hoặc chọn thư mục `frontend` -> Bấm **Continue** |

5. Kiểm tra mục **Build and Output Settings** (Mở rộng nếu cần kiểm tra):
   * **Build Command:** Để mặc định trống (Vercel sẽ tự động chạy lệnh `npm run build` trong `package.json`: `node scripts/copy-tinymce.js && next build --webpack`).
   * **Output Directory:** Để mặc định (`.next`).
   * **Install Command:** Để mặc định (`npm install`). Quá trình này sẽ tự động kích hoạt script `postinstall` để copy các file CSS/Icons của TinyMCE vào `public/tinymce`.

---

## IV. BƯỚC 3: CẤU HÌNH BIẾN MÔI TRƯỜNG (ENVIRONMENT VARIABLES) TRÊN VERCEL

Tại màn hình cấu hình project (mục **Environment Variables**), bạn bấm mở rộng và thêm đầy đủ các biến môi trường sau:

```env
# 1. Chế độ API: BẮT BUỘC là "live" để kết nối Backend thật (không dùng mock)
NEXT_PUBLIC_API_MODE=live

# 2. URL Backend dùng cho cơ chế Rewrite Proxy của Next.js
# (Thay URL bên dưới bằng URL Render thật của bạn, KHÔNG có dấu gạch chéo / ở cuối)
BACKEND_INTERNAL_URL=https://ielts-lms-backend.onrender.com

# 3. URL gốc phía Client gọi API
# Khi dùng Rewrite Proxy, Client chỉ cần gọi /api/v1 cùng domain để loại bỏ hoàn toàn lỗi CORS
NEXT_PUBLIC_API_BASE_URL=/api/v1

# 4. Múi giờ mặc định cho hệ thống thi và hạn nộp bài
NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh
```

> **Cách thêm từng biến trên giao diện Vercel:**
> - Điền **Key**: `NEXT_PUBLIC_API_MODE`, **Value**: `live` -> Bấm **Add**.
> - Điền **Key**: `BACKEND_INTERNAL_URL`, **Value**: `https://ielts-lms-backend.onrender.com` -> Bấm **Add**.
> - Điền **Key**: `NEXT_PUBLIC_API_BASE_URL`, **Value**: `/api/v1` -> Bấm **Add**.
> - Điền **Key**: `NEXT_PUBLIC_DEFAULT_TIMEZONE`, **Value**: `Asia/Ho_Chi_Minh` -> Bấm **Add**.
> - Đảm bảo tích chọn áp dụng cho cả 3 môi trường: **Production**, **Preview**, và **Development**.

---

## V. BƯỚC 4: TIẾN HÀNH DEPLOY VÀ THEO DÕI QUÁ TRÌNH BUILD

1. Sau khi cấu hình xong các biến, bấm nút **Deploy** màu xanh.
2. Vercel sẽ tự động clone repo, cài đặt dependencies và build dự án:
   - **Giai đoạn Install:** Chạy `npm install` và tự động thực thi `postinstall`:
     ```text
     [copy-tinymce] Successfully copied TinyMCE assets to public/tinymce
     ```
   - **Giai đoạn Build:** Chạy `next build --webpack`:
     - Biên dịch TypeScript (`tsc`).
     - Tối ưu hóa bundle và tạo các trang tĩnh (SSG) / trang SSR.
     - Kiểm tra toàn bộ 35 routes của ứng dụng.
3. Khi hoàn tất (khoảng 1-2 phút), Vercel sẽ hiển thị màn hình chúc mừng **Congratulations!** kèm màn hình chụp giao diện trang chủ và cung cấp đường link truy cập dạng:
   `https://web-ielts-xxxx.vercel.app`

---

## VI. BƯỚC 5: CẤU HÌNH TÊN MIỀN TÙY CHỈNH (CUSTOM DOMAIN - TÙY CHỌN)

Nếu bạn có tên miền riêng (ví dụ: `ielts.edu.vn` hoặc `ielts.yourdomain.com`):

1. Trên Dashboard của project trên Vercel, vào mục **Settings** -> Chọn **Domains**.
2. Nhập tên miền của bạn (ví dụ `lms.yourdomain.com`) -> Bấm **Add**.
3. Vercel sẽ cung cấp bản ghi DNS cần cấu hình:
   * Nếu dùng subdomain (`lms.yourdomain.com`):
     - **Type:** `CNAME`
     - **Name:** `lms`
     - **Value:** `cname.vercel-dns.com`
   * Nếu dùng apex domain (`yourdomain.com`):
     - **Type:** `A`
     - **Name:** `@`
     - **Value:** `76.76.21.21`
4. Vào trang quản lý DNS của bạn (Cloudflare, Namecheap, GoDaddy, v.v.) và thêm bản ghi tương ứng.
5. Vercel sẽ tự động xác thực và cấp chứng chỉ **SSL HTTPS miễn phí** trong vòng vài phút.

---

## VII. BƯỚC 6: KIỂM TRA VÀ NGHIỆM THU TOÀN DIỆN (CHECKLIST)

Sau khi deploy thành công, mở trang web trên Vercel và kiểm tra theo danh sách sau:

| STT | Luồng tính năng cần kiểm tra | Cách thực hiện | Kết quả mong đợi |
| :---: | :--- | :--- | :--- |
| **1** | **Tải trang chủ & Giao diện** | Truy cập `https://web-ielts.vercel.app` | Giao diện hiển thị sắc nét, CSS Tailwind nạp chuẩn, icon Lucide hiển thị đầy đủ |
| **2** | **Đăng nhập hệ thống (Auth)** | Vào `/login`, nhập `admin@ielts-lms.edu.vn` / `Admin@123456` | Đăng nhập thành công, lưu Token vào Cookie/Store và chuyển hướng sang Dashboard |
| **3** | **Bộ soạn thảo TinyMCE** | Vào trang Tạo đề thi `/teacher/question-bank/new` | Trình soạn thảo văn bản TinyMCE hiển thị mượt mà, không bị lỗi thiếu icon, skin hay styles |
| **4** | **Kho đề thi & Sửa đề thi** | Vào `/teacher/question-bank`, bấm nút **Sửa** đề thi | Mở ra trang `/teacher/question-bank/[testId]/edit`, tải đầy đủ các passage và câu hỏi; lưu nháp hoặc cập nhật đề thành công |
| **5** | **Giao diện làm bài IELTS** | Đăng nhập học viên, vào `/student/practice`, chọn 1 đề và bắt đầu làm bài | Giao diện 2 cột (Passage bên trái, Câu hỏi bên phải) cuộn độc lập mượt mà; phát âm thanh Listening chuẩn |
| **6** | **Nộp bài & Đáp án chi tiết** | Trả lời câu hỏi và bấm **Nộp bài** | Chấm điểm ngay lập tức, chuyển sang trang Kết quả `/student/exam/[attemptId]/result`; mở khóa xem đáp án chi tiết theo quy định |
| **7** | **Dịch Passage Reading** | Tại bài đọc đạt >= 70%, bấm **Dịch Passage ngay** | Nhập văn bản tiếng Việt và bấm **Nộp bản dịch**; hệ thống lưu thành công không báo lỗi 400 |
| **8** | **Xin gia hạn bài tập** | Vào `/student/extensions`, chọn bài tập và chọn ngày đề xuất mới | Ô chọn ngày click mở lịch tự nhiên, không bị snap ngược giá trị; gửi đơn gia hạn thành công |

---

## VIII. XỬ LÝ SỰ CỐ THƯỜNG GẶP (TROUBLESHOOTING)

### 1. Lỗi gọi API bị chặn CORS (`CORS policy: No 'Access-Control-Allow-Origin' header`)
* **Nguyên nhân:** Biến `NEXT_PUBLIC_API_BASE_URL` đang trỏ trực tiếp đến URL Render nhưng Render chưa khai báo domain Vercel trong `CORS_ALLOWED_ORIGINS`.
* **Khắc phục triệt để:**
  - Cách 1 (Khuyên dùng): Đặt `NEXT_PUBLIC_API_BASE_URL=/api/v1` và `BACKEND_INTERNAL_URL=https://ielts-lms-backend.onrender.com`. Next.js sẽ chuyển tiếp trên server Vercel, hoàn toàn không bị CORS.
  - Cách 2: Vào Backend trên Render, cập nhật biến `CORS_ALLOWED_ORIGINS` thêm URL Vercel của bạn (ví dụ: `https://web-ielts.vercel.app,http://localhost:3000`).

### 2. Trình soạn thảo TinyMCE bị lỗi hiển thị hoặc báo 404 icons/skins
* **Nguyên nhân:** Thư mục `public/tinymce` chưa có các file giao diện.
* **Khắc phục:** Đảm bảo trong `package.json` có script `"postinstall": "node scripts/copy-tinymce.js"`. Khi Vercel cài đặt dependencies, script này sẽ tự động sao chép các tài nguyên cần thiết từ `node_modules/tinymce` vào `public/tinymce`.

### 3. Sau khi sửa biến môi trường trên Vercel nhưng web vẫn dùng cấu hình cũ
* **Nguyên nhân:** Các biến có tiền tố `NEXT_PUBLIC_*` được nhúng trực tiếp vào mã JavaScript tại thời điểm **Build time**.
* **Khắc phục:** Sau khi sửa hoặc thêm biến môi trường trên Vercel, bạn **bắt buộc phải Redeploy**: Vào tab **Deployments** -> Bấm dấu 3 chấm cạnh bản deploy mới nhất -> Chọn **Redeploy** (không chọn Use existing build cache).
