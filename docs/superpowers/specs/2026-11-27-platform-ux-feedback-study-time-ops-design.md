# Phase 12 — Platform UX, Anonymous Feedback, Study Time, Admin Password Reset & Teacher Reminders Design

**Date:** 2026-11-27  
**Contract SSOT:** [docs/contract/09-platform-ux-feedback-study-time-ops.md](../../contract/09-platform-ux-feedback-study-time-ops.md)

## 1. Intent & Scope
Nâng cấp trải nghiệm vận hành và theo dõi học tập cho cả 3 cổng (**Student**, **Teacher**, **Admin**) với đúng **6 hạng mục đã chốt**:
1. **Header Live Clock:** Thay badge `GMT+7 (Asia/Ho_Chi_Minh)` bằng đồng hồ thời gian thực hiển thị `Giờ • Thứ • Tuần • Ngày` (theo giờ VN).
2. **Full-System Light / Dark Theme:** Chuyển đổi giao diện Sáng / Tối (và Theo hệ thống) xuyên suốt toàn bộ ứng dụng.
3. **Anonymous Student Feedback:** Học viên gửi góp ý ẩn danh; Admin đọc, lọc và cập nhật trạng thái xử lý mà không thấy danh tính người gửi.
4. **Student Online Study Time:** Ghi nhận thời gian học viên thực sự online học trên web và hiển thị tổng thời gian + 7 ngày gần nhất trên màn hình quản lý học viên của Giảng viên (`/teacher/students` và `/teacher/students/[id]`).
5. **Admin Student Password Reset:** Khi học viên quên mật khẩu, Admin cấp lại 1 mật khẩu mới (xem 1 lần duy nhất), thu hồi toàn bộ phiên cũ và ghi `AuditLog`.
6. **Teacher 1-Week Scheduling Reminder:** Hệ thống tự động nhắc giảng viên trước 1 tuần nếu khóa học đang mở (`ACTIVE`) chưa có bài tập được lên lịch cho 7 ngày tới.

## 2. Non-Goals & Anti-Goals
- **Non-Goals (để sang đợt sau):** Mở rộng dạng bài `Vocabulary`/`Grammar`, cải tiến Listening authoring, Sổ từ vựng Reading.
- **Anti-Goals:**
  - Tuyệt đối **không** lưu mật khẩu dạng plaintext hoặc mã hóa giải ngược.
  - Tuyệt đối **không** lưu `studentId` hay IP vào bản ghi góp ý ẩn danh.
  - Không để học viên mở 5 tab cùng lúc hoặc treo tab cả đêm làm phồng ảo thời gian học.

## 3. Key Architectural Approaches & Decisions

| Hạng mục | Phương án đã chọn | Vì sao chọn (so với phương án thay thế) |
| :--- | :--- | :--- |
| **Quên mật khẩu học viên** | **Admin cấp lại mật khẩu mới (xem 1 lần)**, hash `argon2id`, tăng `tokenVersion`, revoke Redis refresh tokens, gắn `mustChangePassword: true` | Thay thế hoàn toàn việc lưu plaintext hay AES vault (rủi ro lộ toàn bộ mật khẩu nếu lộ env key), vẫn giải quyết ngay nhu cầu "Admin có mật khẩu đưa lại cho học sinh khi quên". |
| **Góp ý ẩn danh** | Schema `Feedback` **không chứa `studentId`**, chống spam qua Redis hash key theo ngày (`5/ngày`) | Đảm bảo ẩn danh thực sự kể cả ở tầng DB/Admin query, thay vì chỉ ẩn trên UI. |
| **Thời gian học online** | Client heartbeat 60s (chỉ khi `visibilityState === 'visible'` & active < 3 phút) + Server min-gap 15s & cap 90s + lưu `StudentStudyDaily` + cache `StudentProfile.totalStudySeconds` | Chính xác hơn tính theo login/logout session (vốn dễ sai khi đóng trình duyệt đột ngột) và chống nhân đôi khi mở nhiều tab. |
| **Nhắc lịch giao bài 1 tuần** | BullMQ repeatable job hằng ngày 08:00 giờ VN trong `JobsModule` + `NotificationType.ASSIGNMENT_SCHEDULE_REMINDER` + idempotency key theo `isoWeek` | Tái sử dụng hoàn toàn hạ tầng `JobsModule`, `NotificationsService` và `MailService` sẵn có, không tạo cron tách rời. |
| **Dark / Light Mode** | Tailwind v4 `@custom-variant dark` + semantic CSS tokens trong `globals.css` + `ThemeProvider` (`localStorage` + inline anti-FOUC script) | Không cần thêm thư viện nặng, tương thích Next.js 16 App Router và giữ nguyên độ tương phản WCAG AA. |

## 4. Constraints
- Tuân thủ toàn bộ quy ước trong `docs/contract/README.md` và `docs/contract/08-extension-and-versioning-guide.md`.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` bật toàn cục.
- Duy trì tương thích `NEXT_PUBLIC_API_MODE=mock` trên Frontend.
