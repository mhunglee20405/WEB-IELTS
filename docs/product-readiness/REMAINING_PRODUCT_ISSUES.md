# Danh mục Lưu ý Kỹ thuật & Định hướng Mở rộng (Remaining Product Considerations & Roadmap)

**Dự án:** IELTS Academic Learning Management System (WEB-IELTS)  
**Nhánh:** `connect`  
**Ngày lập:** 15/11/2026  

---

## 1. Các Đánh đổi Kỹ thuật Có chủ đích (Intentional Architectural Trade-offs)

1. **Bộ nhớ đệm Lựa chọn Chế độ Lịch (`localStorage`):**
   - *Hiện trạng:* Chế độ xem lịch Tuần (`week`) hoặc Tháng (`month`) được lưu trữ tại `localStorage` của trình duyệt thay vì lưu trên cơ sở dữ liệu hồ sơ người dùng (`User.preferences`).
   - *Lý do đánh đổi:* Giúp người dùng trải nghiệm tức thời không có độ trễ mạng khi chuyển trang, tránh phát sinh thêm API call không cần thiết.
   - *Hạn chế:* Tùy chọn này chỉ tồn tại trên từng trình duyệt/thiết bị cục bộ của người dùng, không tự đồng bộ khi học viên đổi sang máy tính khác.

2. **Cơ chế Bootstrap Một lần Duy nhất (One-Time Bootstrap):**
   - *Hiện trạng:* Sau khi tạo tài khoản Admin đầu tiên, endpoint `/system/bootstrap-admin` bị khóa vĩnh viễn với mã lỗi `409 Conflict`.
   - *Lý do đánh đổi:* Đảm bảo an toàn tối đa cho khách hàng, ngăn chặn hoàn toàn nguy cơ chiếm quyền quản trị.
   - *Hạn chế:* Nếu tổ chức muốn tạo thêm các quản trị viên thứ hai, thứ ba, việc này bắt buộc phải do chính Admin đầu tiên thực hiện thông qua Cổng Quản trị `/admin/users` (hoặc can thiệp trực tiếp bởi DBA vào database).

3. **Cơ chế Dọn dẹp Database (`clean-database.ts`):**
   - *Hiện trạng:* Hàng rào bảo vệ đa tầng cấm tuyệt đối việc chạy script dọn dẹp nếu phát hiện `NODE_ENV=production` hoặc tên database chứa từ khóa `prod/live/staging`.
   - *Lý do đánh đổi:* Bảo vệ an toàn dữ liệu khách hàng thật.
   - *Hạn chế:* Nếu trong tình huống đặc biệt kỹ sư muốn dọn dẹp cơ sở dữ liệu trên máy chủ từ xa cho mục đích demo, bắt buộc phải chỉ định cờ `ALLOW_REMOTE_DESTRUCTIVE_SEED=true` và `CUSTOM_ALLOWED_DESTRUCTIVE_DB`.

---

## 2. Các Trường hợp Biên Cần Lưu ý khi Vận hành (Operational Edge Cases)

1. **Lệch Múi giờ Giữa Client và Server:**
   - Hệ thống chuẩn hóa toàn bộ ngày tháng tính theo múi giờ `Asia/Ho_Chi_Minh` (GMT+7) thông qua module [vn-time.ts](file:///d:/WEB-IELTS/frontend/src/lib/time/vn-time.ts).
   - Nếu học viên học tập tại nước ngoài (ví dụ: Nhật Bản GMT+9, Anh GMT+0), các mốc deadline vẫn sẽ tính theo 23:59 giờ Việt Nam. Cần hướng dẫn học viên lưu ý điều này trên giao diện.

2. **Dịch vụ Gửi Email SMTP Mặc định:**
   - Trong môi trường local, cấu hình SMTP đang trỏ tới `smtp.example.com` nên các email thông báo sẽ được lưu vào hàng đợi `email_deliveries` nhưng không gửi ra ngoài thật trừ khi quản trị viên cập nhật thông tin nhà cung cấp SMTP (Gmail, SendGrid, Amazon SES, Mailgun) trong file `.env`.

---

## 3. Lộ trình Đề xuất Mở rộng (Future Product Enhancements)

1. **Xác thực Đa yếu tố (MFA / 2FA via TOTP):** Bổ sung xác thực 2 bước cho các tài khoản Quản trị viên và Giảng viên bằng Google Authenticator.
2. **Tích hợp Lưu trữ Đám mây (S3 / Cloudflare R2 / Google Cloud Storage):** Hiện tại hệ thống hỗ trợ lưu trữ tệp tin trên đĩa cục bộ (`STORAGE_TYPE=disk`). Trong tương lai có thể kích hoạt driver lưu trữ S3 tương thích.
3. **WebRTC Video Call Tích hợp:** Bổ sung phòng học trực tuyến nhúng trực tiếp vào giao diện thay vì mở link Google Meet ngoài trình duyệt.
