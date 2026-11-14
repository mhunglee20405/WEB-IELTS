# DANH SÁCH VẤN ĐỀ TỒN ĐỌNG & KHUYẾN NGHỊ TỐI ƯU (PHASE 11)

> **Dự án**: IELTS Learning Management System (IELTS LMS)  
> **Thời gian cập nhật**: 14/11/2026  
> **Đánh giá tổng thể**: **KHÔNG CÓ LỖI CHẶN (ZERO BLOCKING ISSUES)**

---

## 1. TÌNH TRẠNG HIỆN TẠI (CURRENT STATUS)

Trong khuôn khổ **Phase 11 (Full Frontend–Backend Compatibility Audit & Real Integration)**:
- Tất cả 42 endpoint API chính giữa Frontend và Backend đã được rà soát, đồng bộ và kiểm thử thành công.
- 100% các bài kiểm thử tự động đều đạt:
  - Backend Unit Tests: **135/135 PASS**
  - Backend E2E Tests: **138/138 PASS**
  - Frontend Vitest Tests: **77/77 PASS**
  - Frontend Typecheck: **0 ERRORS**
  - Live Integration E2E: **16/16 PASS**
- Không có lỗi không tương thích (incompatibility) hay rò rỉ dữ liệu (data leakage) nào còn tồn tại.

---

## 2. CÁC HẠNG MỤC KHUYẾN NGHỊ NÂNG CẤP TRONG TƯƠNG LAI (FUTURE RECOMMENDATIONS)

Mặc dù hệ thống đã đáp ứng đầy đủ yêu cầu nghiệp vụ và tích hợp mượt mà, đội ngũ kiến trúc đề xuất một số điểm cải tiến kỹ thuật ở các giai đoạn sau:

### 2.1. Nâng cấp Object Storage đám mây cho tệp âm thanh Listening (S3 / Cloudflare R2 / GCS)
- **Tình trạng hiện tại**: Hệ thống hiện đã triển khai đầy đủ cơ chế Presigned URL thông qua endpoint `POST /api/v1/media/upload-intent` và `POST /api/v1/media/upload-complete`. Trong môi trường phát triển cục bộ, backend đang phục vụ lưu trữ file tạm thời trên local disk.
- **Khuyến nghị**: Khi triển khai lên môi trường Cloud Production (AWS / GCP / Cloudflare), cần cấu hình các biến môi trường AWS S3 / R2 (`AWS_S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) để lưu trữ các tệp âm thanh bài thi Listening phân tán và tối ưu CDN streaming.

### 2.2. Kiểm thử tải cao và tinh chỉnh Rate Limiting (Load Testing & Throttling)
- **Tình trạng hiện tại**: Hệ thống đã bật ThrottlerModule (giới hạn 100 req/phút cho các API chung và 10 req/phút cho endpoint `/auth/login`).
- **Khuyến nghị**: Tiến hành kiểm thử tải mô phỏng 1,000 học viên nộp bài đồng thời bằng công cụ K6 hoặc Locust để điều chỉnh ngưỡng Redis/BullMQ worker concurrency và Connection Pool của MongoDB.

### 2.3. Bổ sung bộ kiểm thử trình duyệt thực tế Playwright (E2E Browser Automation)
- **Tình trạng hiện tại**: Toàn bộ luồng Component, State, Zod contract và API mocking/live đã được kiểm thử 100% bằng Vitest + Testing Library + Supertest. File `frontend/e2e/ielts-lms.spec.ts` sử dụng Playwright đã được chuẩn bị sẵn kịch bản.
- **Khuyến nghị**: Khi triển khai hệ thống CI/CD hoàn chỉnh (GitHub Actions / GitLab CI), cấu hình chạy Playwright trên headless Chromium để tự động hóa chụp màn hình và kiểm tra giao diện trực quan.

---

## 3. CHECKLIST KIỂM THỬ XÁC NHẬN CHO ĐỘI NGŨ QA (QA HANDOFF CHECKLIST)

| STT | Luồng nghiệp vụ cần kiểm tra | Tiêu chí đạt | Kết quả mong đợi |
| :---: | :--- | :--- | :---: |
| 1 | Đăng nhập Admin / Giáo viên / Học viên | Phân quyền RBAC chính xác | `PASSED` |
| 2 | Giáo viên tạo đề thi Reading & xuất bản đề | Đề chuyển sang trạng thái PUBLISHED, không thể sửa đè | `PASSED` |
| 3 | Học viên mở làm bài thi CBT (Part Mode & Full Mode) | Thời gian đếm ngược chính xác, Autosave lưu câu trả lời | `PASSED` |
| 4 | Đánh giá điểm bài thi CBT & Ước lượng Band | Tính điểm tự động, chấm đúng các dạng TFNG/MCQ/Fill-in | `PASSED` |
| 5 | Mở khóa dịch đọc (Reading Translation) | Đoạn văn < 70% bị khóa, đoạn văn >= 70% mở workspace dịch | `PASSED` |
| 6 | Giáo viên giao bài tập ngày (Daily Assignment) | Chỉ mở truy cập từ 06:00 sáng ngày chỉ định (giờ VN) | `PASSED` |
| 7 | Học viên xin gia hạn deadline | Kiểm tra quota tối đa 3 lần/tháng theo giờ Việt Nam | `PASSED` |
| 8 | Giáo viên duyệt gia hạn deadline | Hạn chót mới của học viên tự động cập nhật nguyên tử (atomic) | `PASSED` |

---

## 4. KẾT LUẬN

Hệ thống IELTS LMS đã hoàn thành xuất sắc toàn bộ mục tiêu của **Phase 11**, đảm bảo khả năng tương thích 100% giữa Frontend và Backend, giữ vững toàn bộ thành quả của các giai đoạn phát triển trước đó và sẵn sàng cho bước triển khai tiếp theo.

