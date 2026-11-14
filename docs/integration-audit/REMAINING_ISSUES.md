# REMAINING ISSUES & FUTURE AUDIT ROADMAP

> **Dự án**: IELTS Academic Learning Management System (IELTS LMS)  
> **Workspace**: `D:\WEB-IELTS`  
> **Thời gian cập nhật**: 14/11/2026  
> **Đánh giá tổng quát**: **0 LỖI CHẶN (ZERO BLOCKING ISSUES)**  
> **Trạng thái tích hợp hiện tại**: **HOÀN TOÀN TƯƠNG THÍCH VÀ SẴN SÀNG SỬ DỤNG**

---

## 1. TÌNH TRẠNG LỖI CHẶN HIỆN TẠI (BLOCKING ISSUES STATUS)

Sau khi hoàn thành đợt kiểm toán và sửa lỗi toàn diện:
- Lỗi không thể đăng nhập trên giao diện Next.js đã được **khắc phục 100%**.
- Các yêu cầu gọi API rác `401 Unauthorized` và `400 Bad Request` khi khởi động trang web đã được **loại bỏ triệt để**.
- Xung đột cổng `3001` giữa Docker container và tiến trình Backend đã được **giải quyết triệt để**.
- Lỗi Zod Schema không khớp kiểu dữ liệu `expiresIn` đã được **đồng bộ hoàn toàn**.
- Tất cả các suite kiểm thử từ Unit test, E2E test, Typecheck, Lint, Production build và Browser E2E automation đều đạt **100% PASS**.

**Kết luận**: Hiện tại **KHÔNG CÒN LỖI CHẶN NÀO** cản trở việc đăng nhập, học tập, tạo bài tập, làm bài thi hoặc quản lý hệ thống.

---

## 2. CÁC HẠNG MỤC KHUYẾN NGHỊ VÀ TỐI ƯU HÓA TƯƠNG LAI (NON-BLOCKING / FUTURE ROADMAP)

Dưới đây là các hạng mục kỹ thuật không gây lỗi cho hệ thống hiện tại nhưng được khuyến nghị triển khai khi đưa sản phẩm lên môi trường Cloud Production:

---

### Hạng mục 1: Tích hợp Dịch vụ Lưu trữ Đám mây (Cloud Object Storage) cho Listening Audio
- **Mức độ ưu tiên**: Thấp (Low) / Kiến trúc mở rộng (Enhancement)
- **Thành phần ảnh hưởng**: `Backend/src/modules/media/`, `frontend/src/components/exam/`
- **Tình trạng hiện tại**:
  - Hệ thống đã cài đặt sẵn cơ chế Presigned URL thông qua các endpoint `POST /api/v1/media/audio/upload-intent` và `POST /api/v1/media/audio/upload-complete`.
  - Trên môi trường phát triển cục bộ (Local Dev), tệp âm thanh bài thi Listening đang được lưu tạm trên ổ đĩa nội bộ (`STORAGE_TYPE=disk`, `./uploads`).
- **Khuyến nghị tiếp theo**:
  - Khi triển khai lên AWS/GCP/Cloudflare, cấu hình `STORAGE_TYPE=s3` kèm các biến môi trường:
    - `AWS_S3_BUCKET`
    - `AWS_REGION`
    - `AWS_ACCESS_KEY_ID`
    - `AWS_SECRET_ACCESS_KEY`
  - Tích hợp CDN (Cloudflare / CloudFront) để tăng tốc độ phát audio mượt mà cho hàng nghìn học viên làm bài thi nghe đồng thời.

---

### Hạng mục 2: Tinh chỉnh Ngưỡng Rate Limiting & Kiểm thử Tải cao (Load & Stress Testing)
- **Mức độ ưu tiên**: Trung bình (Medium)
- **Thành phần ảnh hưởng**: `Backend/src/app.module.ts` (ThrottlerModule), Redis BullMQ Worker
- **Tình trạng hiện tại**:
  - ThrottlerModule đang được cấu hình giới hạn 100 requests/phút cho các API chung và 10 requests/phút cho endpoint `/auth/login`.
  - Hàng đợi BullMQ xử lý kiểm tra bài tập quá hạn (`deadlineQueue`) mỗi 60 giây một lần qua Redis.
- **Khuyến nghị tiếp theo**:
  - Sử dụng công cụ kiểm thử tải (như `k6` hoặc `Locust`) để mô phỏng kịch bản 500 – 1.000 học viên nộp bài thi cùng một thời điểm khi hết giờ làm bài CBT.
  - Tinh chỉnh `max_connections` của MongoDB Replica Set và tăng worker concurrency nếu tải cao.

---

### Hạng mục 3: Triển khai CI/CD Tự động hóa Chạy Playwright Headless
- **Mức độ ưu tiên**: Thấp (Low)
- **Thành phần ảnh hưởng**: `.github/workflows/`
- **Tình trạng hiện tại**:
  - Bộ script kiểm thử trình duyệt tự động `frontend/e2e/test-all-roles-login.mjs` chạy rất ổn định trên môi trường máy trạm nội bộ qua Microsoft Edge / Chromium.
- **Khuyến nghị tiếp theo**:
  - Cấu hình GitHub Actions runner cài đặt sẵn Linux Chromium để chạy tự động kiểm thử trình duyệt mỗi khi có Pull Request vào nhánh `main` hoặc `develop`.

---

## 3. TỔNG KẾT BẢO ĐẢM CHẤT LƯỢNG (QA GUARANTEE)

Toàn bộ hợp đồng dữ liệu, trạng thái xác thực và giao diện tương tác giữa Frontend Next.js và Backend NestJS trên nhánh phát triển cục bộ hiện tại đã đạt độ tin cậy tuyệt đối, tuân thủ đúng chuẩn thiết kế phần mềm doanh nghiệp.

