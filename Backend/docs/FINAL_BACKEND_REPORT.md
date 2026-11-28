# IELTS LMS Backend — Final Architecture & Production Readiness Report

**Dự án:** IELTS Learning Management System (LMS) Backend  
**Vị trí làm việc:** `D:\WEB-IELTS`  
**Ngày hoàn thành:** 2026-11-12  
**Phiên bản:** 1.0.0 (Production Ready)  
**Kiến trúc:** NestJS 10 + TypeScript Strict + MongoDB 7.0 Replica Set (`rs0`) + Redis 7.4 + BullMQ 5

---

## 1. Tổng quan Kiến trúc Hệ thống

Hệ thống backend được thiết kế theo kiến trúc module hóa chặt chẽ (Modular Architecture) của NestJS, tuân thủ các nguyên lý Domain-Driven Design (DDD) và Clean Architecture:

- **API Layer:** Quản lý giao thức HTTP RESTful qua Express adapter, áp dụng bảo mật tầng biên với Helmet, CORS whitelist nghiêm ngặt, cookie parser, và rate limiting qua `@nestjs/throttler`.
- **Validation & Transformation:** Tự động kiểm tra tính hợp lệ của DTO qua `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true, transform: true`), lọc và định dạng phản hồi chuẩn qua `TransformInterceptor` (`statusCode`, `data`, `timestamp`), và kiểm soát lỗi tập trung qua `GlobalExceptionFilter` (kèm mã định danh truy vết `X-Correlation-Id`).
- **Authentication & Authorization:** Hệ thống kép kết hợp JSON Web Token (JWT access token ngắn hạn 15m) và kho lưu trữ refresh token phân tán trên Redis (TTL 7 ngày). Kiểm soát truy cập dựa trên vai trò (RBAC) thông qua `@Roles()` và `RolesGuard` (`ADMIN`, `TEACHER`, `STUDENT`) kết hợp kiểm tra quyền sở hữu dữ liệu tài liệu (Document Ownership Validation).
- **Persistence Layer:** Sử dụng Mongoose 8 kết nối cụm MongoDB Replica Set (`rs0`), hỗ trợ các giao dịch ACID đa tài liệu (Multi-document ACID Transactions) cho các tác vụ nhạy cảm: ghi danh độc quyền 1-1, nộp bài thi, trừ hạn ngạch gia hạn, và xử lý điểm phạt.
- **Asynchronous & Background Workers:** Sử dụng BullMQ và Redis để xử lý hàng đợi bất đồng bộ. Tích hợp mô hình Transactional Outbox bền vững trên MongoDB (`email_deliveries`) giúp các giao dịch kinh doanh luôn thành công mà không phụ thuộc vào trạng thái tức thời của SMTP hay Redis.

---

## 2. Danh mục các NestJS Module đã triển khai

| STT | Module | Đường dẫn | Chức năng chính |
| :--- | :--- | :--- | :--- |
| 1 | **ConfigModule** | `src/config/` | Quản lý biến môi trường tập trung, xác thực schema nghiêm ngặt với Joi. |
| 2 | **DatabaseModule** | `src/database/` | Kết nối MongoDB Replica Set, kiểm soát tạo chỉ mục theo môi trường (bỏ auto-index ở production). |
| 3 | **AuthModule** | `src/modules/auth/` | Đăng nhập Argon2id, xác thực JWT, xoay vòng và thu hồi refresh token trên Redis, replay protection. |
| 4 | **UsersModule** | `src/modules/users/` | CRUD người dùng, hồ sơ học viên (`StudentProfile`), hồ sơ giáo viên (`TeacherProfile`), quản lý trạng thái. |
| 5 | **CoursesModule** | `src/modules/courses/` | Quản lý khóa học (band 0–9, bước 0.5), phân công giáo viên, lưu trữ soft-archive. |
| 6 | **EnrollmentsModule** | `src/modules/enrollments/` | Ghi danh, rút học viên, kiểm soát khóa học 1-1 tối đa 1 học viên active qua partial unique index. |
| 7 | **LessonsModule** | `src/modules/lessons/` | Lập lịch buổi học, kiểm tra hợp lệ link Google Meet, chuyển đổi hiển thị múi giờ Việt Nam (+07:00). |
| 8 | **ExercisesModule** | `src/modules/exercises/` | Ngân hàng đề thi Reading/Listening, hỗ trợ 10 dạng câu hỏi IELTS, snapshot đề thi, bảo mật ẩn đáp án tuyệt đối. |
| 9 | **AssignmentsModule** | `src/modules/assignments/` | Giao bài tập cho khóa học, tính mốc thời gian Việt Nam (00:00:00 -> 23:59:59.999), backfill học viên mới. |
| 10 | **SubmissionsModule** | `src/modules/submissions/` | Chấm điểm tự động server-side 10 dạng câu hỏi, bảo vệ ngưỡng PASS >= 70% unrounded, mở khóa đáp án sau PASS. |
| 11 | **TranslationsModule** | `src/modules/translations/` | Nộp bài dịch tiếng Việt cho bài đọc Reading, lưu vết đoạn văn gốc, giáo viên chấm điểm và nhận xét. |
| 12 | **DeadlinesModule** | `src/modules/deadlines/` | Quản lý hạn nộp hiệu lực (`effectiveDeadlineAt`), bộ quét tự động quá hạn định kỳ idempotent. |
| 13 | **ExtensionRequestsModule**| `src/modules/extensions/` | Quản lý xin gia hạn, hạn mức tối đa 3 lần/tháng dương lịch Việt Nam, tự động bù trừ điểm phạt khi duyệt. |
| 14 | **PenaltyModule** | `src/modules/penalties/` | Sổ cái phạt bất biến (chỉ tính điểm nguyên dương), giao dịch bù trừ (-1 điểm) kèm giải trình khi hủy phạt. |
| 15 | **MailModule** | `src/modules/mail/` | Tích hợp Nodemailer, bộ render HTML/text template, chế độ mock transport an toàn cho dev/test. |
| 16 | **NotificationsModule** | `src/modules/notifications/`| Quản lý thông báo in-app, đếm số lượng chưa đọc, đánh dấu đã đọc đơn lẻ/hàng loạt, tích hợp gửi email. |
| 17 | **JobsModule** | `src/modules/jobs/` | Bộ xử lý hàng đợi BullMQ: `EmailProcessor`, `DeadlineProcessor`, `DeadlineScheduler`, outbox sweeper. |
| 18 | **AuditModule** | `src/modules/audit/` | Ghi vết kiểm toán hành động hệ thống, tự động che dấu thông tin nhạy cảm thành `[REDACTED]`. |
| 19 | **HealthModule** | `src/modules/health/` | Liveness & Readiness probe cho Kubernetes/Docker Swarm (kiểm tra MongoDB, Redis, Heap memory). |

---

## 3. Danh mục 16 MongoDB Collections & Các Chỉ mục (Indexes)

Toàn bộ 16 collection đã được kiểm toán và tạo chỉ mục có kiểm soát qua script `npm run init:indexes`:

1. **`users`**: Unique `{ email: 1 }`, Compound `{ role: 1, status: 1 }`.
2. **`student_profiles`**: Unique `{ userId: 1 }`.
3. **`teacher_profiles`**: Unique `{ userId: 1 }`.
4. **`courses`**: Unique `{ code: 1 }`, Compound `{ teacherId: 1, status: 1 }`, Single `{ status: 1 }`.
5. **`enrollments`**: Compound Unique `{ courseId: 1, studentId: 1, status: 1 }` (partial `status = active`), Partial Unique `{ courseId: 1, type: 1 }` (partial `status = active, type = one_to_one`).
6. **`lessons`**: Compound `{ courseId: 1, startTime: 1 }`.
7. **`exercises`**: Compound `{ title: 1, type: 1, status: 1 }`, Single `{ status: 1 }`.
8. **`assignments`**: Compound `{ courseId: 1, status: 1 }`, Compound `{ deadlineAt: 1, status: 1 }`.
9. **`student_assignments`**: Unique Compound `{ assignmentId: 1, studentId: 1 }`, Compound `{ studentId: 1, status: 1 }`, Compound `{ effectiveDeadlineAt: 1, status: 1 }`.
10. **`submissions`**: Unique Compound `{ assignmentId: 1, studentId: 1, attemptNo: 1 }`, Compound `{ studentId: 1, submittedAt: -1 }`.
11. **`translation_submissions`**: Compound `{ studentAssignmentId: 1, studentId: 1 }`, Single `{ studentId: 1 }`.
12. **`extension_requests`**: Compound `{ studentId: 1, requestMonthVn: 1 }`, Compound `{ studentAssignmentId: 1, status: 1 }`.
13. **`penalty_transactions`**: Unique Partial `{ idempotencyKey: 1 }`, Compound `{ studentId: 1, createdAt: -1 }`, Single `{ studentAssignmentId: 1 }`.
14. **`notifications`**: Compound `{ userId: 1, isRead: 1, createdAt: -1 }`.
15. **`email_deliveries`**: Unique Partial `{ idempotencyKey: 1 }`, Compound `{ status: 1, createdAt: 1 }`.
16. **`audit_logs`**: Compound `{ entity: 1, entityId: 1 }`, Compound `{ actorId: 1, createdAt: -1 }`.

---

## 4. Kết quả Kiểm thử Toàn diện

Hệ thống đã trải qua quá trình kiểm thử nghiêm ngặt bao gồm cả Unit Tests cách ly và E2E Tests thực thi trên cụm dịch vụ thực tế (MongoDB Replica Set `rs0` + Redis Docker container):

```
================================================================================
TEST EXECUTION SUMMARY
================================================================================
Unit Tests:
  Test Suites: 16 passed, 16 total
  Tests:       110 passed, 110 total
  Time:        8.212 s

E2E Integration Tests (against real MongoDB rs0 & Redis):
  Test Suites: 8 passed, 8 total
  Tests:       102 passed, 102 total
  Time:        14.37 s

Total Verified Tests: 212 / 212 (100% PASS)
Build Status:         PASS (0 compilation errors)
================================================================================
```

---

## 5. Kết quả Kiểm toán An ninh & Gia cố Hệ thống

Báo cáo chi tiết được lưu trữ tại [docs/SECURITY_AUDIT.md](file:///d:/WEB-IELTS/docs/SECURITY_AUDIT.md). Các điểm gia cố quan trọng:
1. **Khắc phục triệt để lưu trữ RAM:** Toàn bộ refresh token được lưu trữ tại Redis TTL với cơ chế xoay vòng nguyên tử (Atomic Lua script). Loại bỏ hoàn toàn nguy cơ replay token đã sử dụng (trả về ngay 401).
2. **Khóa tài khoản tức thời:** `JwtStrategy` kiểm tra trạng thái hoạt động (`status === ACTIVE`) trên từng request. Khi tài khoản bị đình chỉ, toàn bộ access token đang hiệu lực đều bị từ chối ngay lập tức.
3. **Bảo mật tuyệt đối đáp án:** Đáp án (`answerSpecification`) và giải thích (`explanation`) bị lọc sạch khỏi mọi query của học viên. Học viên chỉ có thể mở khóa đáp án sau khi đã đạt điểm PASS (>= 70%) qua endpoint có bảo vệ.
4. **Chống Race-Condition hạn ngạch gia hạn:** Áp dụng khóa ghi tài liệu (document write lock) trên `StudentProfile` bên trong transaction, buộc các request đồng thời phải xếp hàng, đảm bảo không thể vượt quá hạn mức 3 lần/tháng.
5. **Transactional Outbox bền vững:** Email thông báo được ghi nhận vào MongoDB trước khi đưa vào BullMQ, có bộ quét định kỳ tự động dispatch lại các email tồn đọng khi kết nối Redis được khôi phục.
6. **Che giấu lỗi hệ thống:** Mọi lỗi 500 ở môi trường production đều được chuẩn hóa thành "Internal server error" kèm mã `X-Correlation-Id`, ngăn chặn việc rò rỉ cấu trúc database ra phía client.

---

## 6. Hướng dẫn Tích hợp Next.js Frontend

Chi tiết hợp đồng giao tiếp API được trình bày tại [docs/FRONTEND_API_CONTRACT.md](file:///d:/WEB-IELTS/docs/FRONTEND_API_CONTRACT.md) và đặc tả OpenAPI tại [docs/openapi.json](file:///d:/WEB-IELTS/docs/openapi.json).

### Quy trình tích hợp khuyến nghị:
1. **Base URL:** Cấu hình biến môi trường `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`.
2. **Tự động làm mới Token:** Thiết lập Axios Interceptor hoặc Fetch Client wrapper: khi gặp lỗi `401 Unauthorized`, tự động gọi `POST /api/v1/auth/refresh` với `refreshToken` lưu trong HTTP-only cookie hoặc Secure Storage. Nếu thành công, cập nhật `accessToken` mới và retry request gốc.
3. **Xử lý Response Envelope:**
   - Dữ liệu trả về thành công nằm trong `res.data.data`.
   - Danh sách phân trang có cấu trúc `{ items: [...], total, page, limit }`.
4. **Kiểm tra quyền truy cập:**
   - Học viên chỉ truy cập các trang bài tập cá nhân (`/assignments/mine`, `/courses/mine`).
   - Giáo viên quản lý các lớp học được phân công và chấm bài dịch.
   - Admin quản trị người dùng, khóa học và xem nhật ký audit log.

---

## 7. Đánh giá Mức độ Sẵn sàng Triển khai (Production Readiness)

Hệ thống IELTS LMS Backend hiện tại đạt mức độ **READY FOR PRODUCTION**:
- Đáp ứng đầy đủ 100% các yêu cầu nghiệp vụ từ Phase 0 đến Phase 8.
- Toàn bộ 212 ca kiểm thử unit và E2E chạy thành công trên cụm replica set thực tế.
- Bộ Docker Compose và Dockerfile đạt chuẩn multi-stage với người dùng không đặc quyền (`appuser`).
- Có đầy đủ tài liệu kiến trúc, hợp đồng API frontend, và hướng dẫn vận hành sao lưu phục hồi thảm họa.

