# IELTS LMS Backend

Backend API cho hệ thống Quản lý Học tập IELTS (Learning Management System).

## Stack

- **Runtime:** Node.js LTS, TypeScript strict
- **Framework:** NestJS (Express adapter)
- **Database:** MongoDB (Mongoose) — cần Replica Set để hỗ trợ transaction
- **Cache/Queue:** Redis + BullMQ
- **Auth:** JWT (access token ngắn hạn) + Refresh token rotation (Argon2id)
- **Docs:** Swagger/OpenAPI tại `/api/v1/docs`

## Yêu cầu

- Node.js >= 20 LTS
- MongoDB 7.0+ (replica set)
- Redis 7+
- Docker + Docker Compose (khuyến nghị cho dev)

## Khởi động nhanh (Docker)

```powershell
# 1. Sao chép file env
Copy-Item .env.example .env
# Chỉnh sửa .env với các giá trị thực tế

# 2. Khởi động toàn bộ stack
docker compose up -d

# 3. Seed dữ liệu mẫu
docker compose exec api node dist/database/seed/seed.js
```

## Khởi động dev (không Docker)

### Bước 1 — Cài MongoDB Replica Set local

```powershell
# Chạy MongoDB với replica set (dùng Docker)
docker run -d --name mongo-rs `
  -p 27017:27017 `
  mongo:7.0 mongod --replSet rs0 --bind_ip_all

# Khởi tạo replica set
docker exec mongo-rs mongosh --eval "rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] })"
```

### Bước 2 — Cài Redis local

```powershell
docker run -d --name redis-local -p 6379:6379 redis:7.4-alpine
```

### Bước 3 — Cài dependencies và chạy

```powershell
cd d:\WEB-IELTS
Copy-Item .env.example .env
# Chỉnh MONGODB_URI, JWT secrets, SMTP, v.v. trong .env

npm install
npm run seed          # Seed admin + sample users
npm run start:dev     # API server với hot-reload
```

## Lệnh hữu ích

```powershell
npm run build         # Build TypeScript
npm run test          # Unit tests (16 suites, 110 tests)
npm run test:e2e      # E2E tests với MongoDB rs0 & Redis (8 suites, 102 tests)
npm run seed          # Seed admin + sample users
npm run init:indexes  # Đồng bộ và tạo toàn bộ MongoDB indexes có kiểm soát
npm run export:openapi# Xuất file đặc tả OpenAPI (docs/openapi.json)
```

## Tài liệu kiến trúc & Vận hành

- [docs/SECURITY_AUDIT.md](file:///d:/WEB-IELTS/docs/SECURITY_AUDIT.md) — Báo cáo kiểm toán an ninh và khắc phục lỗ hổng
- [docs/FRONTEND_API_CONTRACT.md](file:///d:/WEB-IELTS/docs/FRONTEND_API_CONTRACT.md) — Đặc tả API chi tiết cho đội Next.js Frontend
- [docs/DEPLOYMENT_GUIDE.md](file:///d:/WEB-IELTS/docs/DEPLOYMENT_GUIDE.md) — Hướng dẫn triển khai Production và sao lưu thảm họa
- [docs/openapi.json](file:///d:/WEB-IELTS/docs/openapi.json) — OpenAPI v3 JSON Schema
- [docs/DECISIONS.md](file:///d:/WEB-IELTS/docs/DECISIONS.md) — Lịch sử quyết định kiến trúc hệ thống (A1 -> A27)
- [docs/IMPLEMENTATION_STATUS.md](file:///d:/WEB-IELTS/docs/IMPLEMENTATION_STATUS.md) — Bảng trạng thái tiến độ 8 phase hoàn tất

## Tài khoản seed mặc định

| Role    | Email                      | Mật khẩu          |
|---------|----------------------------|--------------------|
| Admin   | admin@ielts-lms.local      | Admin@123456       |
| Teacher | teacher@ielts-lms.local    | Teacher@123456     |
| Student | student@ielts-lms.local    | Student@123456     |

> ⚠️ Thay đổi mật khẩu ngay sau khi triển khai production!

## Cấu trúc thư mục

```
src/
  main.ts                    # Điểm vào ứng dụng
  app.module.ts              # Root module
  config/                    # Config và validation schema
  common/                    # Decorators, guards, filters, interceptors
  database/
    schemas/                 # 16 Mongoose schemas + enums
    seed/                    # Seed script
  modules/
    auth/                    # JWT auth, refresh token rotation
    users/                   # User CRUD, profiles
    courses/                 # (Phase 3)
    enrollments/             # (Phase 3)
    lessons/                 # (Phase 3)
    exercises/               # (Phase 4)
    assignments/             # (Phase 4)
    submissions/             # (Phase 4)
    translations/            # (Phase 4)
    extensions/              # (Phase 5)
    penalties/               # (Phase 5)
    notifications/           # (Phase 5)
    mail/                    # (Phase 5)
    jobs/                    # BullMQ processors/schedulers (Phase 5)
    audit/                   # (Phase 5)
    health/                  # Health check endpoints
test/                        # E2E tests
docs/                        # Tài liệu kỹ thuật
```

## API Endpoints (Phase 2)

| Method | Path                      | Auth        | Mô tả                     |
|--------|---------------------------|-------------|---------------------------|
| POST   | /api/v1/auth/login        | Public      | Đăng nhập                 |
| POST   | /api/v1/auth/refresh      | Public      | Làm mới access token      |
| POST   | /api/v1/auth/logout       | Public      | Đăng xuất                 |
| GET    | /api/v1/auth/me           | JWT         | Thông tin user hiện tại   |
| POST   | /api/v1/users             | Admin       | Tạo user mới              |
| GET    | /api/v1/users             | Admin       | Danh sách users           |
| GET    | /api/v1/users/me          | JWT         | Xem profile bản thân      |
| PATCH  | /api/v1/users/me          | JWT         | Cập nhật profile bản thân |
| GET    | /api/v1/users/:id         | Admin/Teacher | Xem user theo ID       |
| PATCH  | /api/v1/users/:id         | Admin       | Cập nhật user             |
| PATCH  | /api/v1/users/:id/status  | Admin       | Cập nhật trạng thái user  |
| GET    | /api/v1/health/live       | Public      | Liveness probe            |
| GET    | /api/v1/health/ready      | Public      | Readiness probe           |

## API Endpoints (Phase 3)

| Method | Path                                    | Auth                  | Mô tả                                              |
|--------|-----------------------------------------|-----------------------|----------------------------------------------------|
| POST   | /api/v1/courses                         | Admin                 | Tạo khóa học mới (band 0–9, bước 0.5)              |
| GET    | /api/v1/courses                         | Admin / Teacher       | Danh sách khóa học (Teacher chỉ thấy lớp của mình) |
| GET    | /api/v1/courses/mine                    | JWT                   | Khóa học của tôi (Student: đang học; Teacher: dạy) |
| GET    | /api/v1/courses/:id                     | Role-scoped           | Chi tiết khóa học                                  |
| PATCH  | /api/v1/courses/:id                     | Admin / Course Teacher| Cập nhật khóa học                                  |
| DELETE | /api/v1/courses/:id                     | Admin                 | Archive khóa học có lịch sử (không hard-delete)    |
| GET    | /api/v1/courses/:id/students            | Admin / Course Teacher| Danh sách học viên trong khóa học                  |
| POST   | /api/v1/courses/:id/students            | Admin / Course Teacher| Ghi danh học viên (ONE_TO_ONE tối đa 1 active)     |
| DELETE | /api/v1/courses/:id/students/:studentId | Admin / Course Teacher| Rút học viên khỏi khóa học (status = dropped)      |
| POST   | /api/v1/courses/:courseId/lessons       | Admin / Course Teacher| Tạo buổi học (UTC Date, validate startAt < endAt)  |
| GET    | /api/v1/courses/:courseId/lessons       | Role-scoped           | Lịch học theo khóa học (lọc from/to/status)        |
| GET    | /api/v1/lessons/mine                    | JWT                   | Lịch học của tôi (hiển thị thêm giờ VN +07:00)     |
| GET    | /api/v1/lessons/:id                     | Role-scoped           | Chi tiết buổi học                                  |
| PATCH  | /api/v1/lessons/:id                     | Admin / Course Teacher| Cập nhật buổi học / Google Meet URL                |
| PATCH  | /api/v1/lessons/:id/cancel              | Admin / Course Teacher| Hủy buổi học (soft-cancel)                         |
| DELETE | /api/v1/lessons/:id                     | Admin / Course Teacher| Hủy buổi học qua DELETE (soft-cancel)              |

## API Endpoints (Phase 4)

| Method | Path                                   | Auth                  | Mô tả                                                                          |
|--------|----------------------------------------|-----------------------|--------------------------------------------------------------------------------|
| POST   | /api/v1/exercises                      | Admin / Teacher       | Tạo bài tập mới trong ngân hàng đề (hỗ trợ 10 IELTS QuestionType)              |
| GET    | /api/v1/exercises                      | Admin / Teacher       | Danh sách bài tập trong ngân hàng đề (Student bị chặn 403)                     |
| GET    | /api/v1/exercises/:id                  | Role-scoped           | Chi tiết bài tập (Admin/Teacher thấy đáp án; Student bị ẩn đáp án hoàn toàn)   |
| PATCH  | /api/v1/exercises/:id                  | Admin / Teacher       | Cập nhật bài tập (tự động tăng version nếu đề đã PUBLISHED)                   |
| POST   | /api/v1/exercises/:id/publish          | Admin / Teacher       | Công bố bài tập (yêu cầu passage đối với bài Reading)                          |
| POST   | /api/v1/exercises/:id/archive          | Admin / Teacher       | Lưu trữ bài tập (soft-archive)                                                 |
| DELETE | /api/v1/exercises/:id                  | Admin / Teacher       | Lưu trữ bài tập qua DELETE                                                     |
| POST   | /api/v1/assignments                    | Admin / Course Teacher| Giao bài cho khóa học (tính giờ VN 00:00:00 -> 23:59:59, snapshot đề bất biến)|
| GET    | /api/v1/assignments                    | Admin / Course Teacher| Danh sách bài tập được giao theo phân quyền giáo viên                          |
| GET    | /api/v1/assignments/mine               | Student               | Danh sách bài tập được giao cho học viên đang đăng nhập                        |
| GET    | /api/v1/assignments/:id                | Role-scoped           | Chi tiết bài tập (Học viên nhận snapshot đã lọc sạch hoàn toàn đáp án)         |
| PATCH  | /api/v1/assignments/:id                | Admin / Course Teacher| Cập nhật tiêu đề, gia hạn deadline, đồng bộ effectiveDeadline học viên         |
| GET    | /api/v1/assignments/:id/students       | Admin / Course Teacher| Xem danh sách học viên và tiến độ làm bài của assignment                       |
| POST   | /api/v1/assignments/:id/backfill-students| Admin / Course Teacher| Bổ sung bài tập an toàn & idempotent cho học viên mới vào lớp sau khi publish  |

## API Endpoints (Phase 5)

| Method | Path                                   | Auth                  | Mô tả                                                                          |
|--------|----------------------------------------|-----------------------|--------------------------------------------------------------------------------|
| POST   | /api/v1/assignments/:id/submissions    | Student               | Nộp bài tập (chấm điểm tự động server-side, không bao giờ lộ đáp án trước PASS)|
| GET    | /api/v1/assignments/:id/submissions/mine| Student             | Xem lịch sử các lượt nộp bài của học viên cho assignment                       |
| GET    | /api/v1/assignments/:id/answers        | Role-scoped           | Endpoint chuyên biệt lấy đáp án & giải thích (Học viên bắt buộc phải có PASS)  |
| GET    | /api/v1/assignments/:id/submissions    | Admin / Course Teacher| Danh sách toàn bộ bài nộp của học viên trong assignment (kèm đáp án cho GV)    |
| GET    | /api/v1/submissions/:id                | Role-scoped           | Xem chi tiết một lượt nộp bài (Student chỉ xem bài của mình)                  |
| POST   | /api/v1/assignments/:id/translations   | Student               | Nộp bản dịch tiếng Việt cho bài đọc Reading                                    |
| GET    | /api/v1/assignments/:id/translations/mine| Student             | Xem bản dịch của mình kèm đoạn văn gốc tiếng Anh và nhận xét của giáo viên    |
| GET    | /api/v1/assignments/:id/translations   | Admin / Course Teacher| Danh sách bài dịch của học viên trong assignment                               |
| PATCH  | /api/v1/translations/:id/review        | Admin / Course Teacher| Đánh giá và nhận xét bản dịch của học viên (cập nhật trạng thái REVIEWED)       |

## API Endpoints (Phase 6)

| Method | Path                                   | Auth                  | Mô tả                                                                          |
|--------|----------------------------------------|-----------------------|--------------------------------------------------------------------------------|
| POST   | /api/v1/extension-requests             | Student               | Gửi đơn xin gia hạn deadline (tối đa 3 lần/tháng theo múi giờ `Asia/Ho_Chi_Minh`)|
| GET    | /api/v1/extension-requests/quota       | Student               | Kiểm tra hạn mức xin gia hạn trong tháng hiện tại (used, limit, remaining)     |
| GET    | /api/v1/extension-requests/mine        | Student               | Xem danh sách đơn xin gia hạn của bản thân                                    |
| POST   | /api/v1/extension-requests/:id/cancel  | Student               | Hủy đơn xin gia hạn khi đang ở trạng thái PENDING                              |
| GET    | /api/v1/extension-requests             | Admin / Teacher       | Danh sách đơn xin gia hạn (Teacher chỉ xem đơn từ các lớp được phân công)    |
| GET    | /api/v1/extension-requests/:id         | Role-scoped           | Xem chi tiết đơn xin gia hạn                                                  |
| PATCH  | /api/v1/extension-requests/:id/review  | Admin / Course Teacher| Phê duyệt (APPROVED) hoặc từ chối (REJECTED) đơn gia hạn (cập nhật atomic deadline)|
| GET    | /api/v1/penalties/mine                 | Student               | Xem tổng điểm phạt và sổ cái lịch sử giao dịch phạt cá nhân                    |
| GET    | /api/v1/penalties                      | Admin / Teacher       | Xem sổ cái giao dịch phạt toàn hệ thống hoặc theo lớp / học viên               |
| POST   | /api/v1/penalties/:id/reverse          | Admin / Teacher       | Hủy / miễn phạt với giải trình audit (tạo compensating transaction -1 điểm)   |
| POST   | /api/v1/deadlines/process-overdue      | Admin / Teacher       | Kích hoạt bộ quét bài tập quá hạn (chuyển OVERDUE, tạo phạt idempotent)       |
| GET    | /api/v1/deadlines/overdue              | Admin / Teacher       | Xem danh sách các bài tập của học viên đang bị quá hạn                        |

## API Endpoints (Phase 7 & 8)

| Method | Path                                   | Auth                  | Mô tả                                                                          |
|--------|----------------------------------------|-----------------------|--------------------------------------------------------------------------------|
| GET    | /api/v1/notifications                  | JWT                   | Danh sách thông báo in-app cá nhân (hỗ trợ phân trang, lọc chưa đọc/đã đọc)   |
| GET    | /api/v1/notifications/mine             | JWT                   | Alias của `/notifications` phục vụ tích hợp Next.js frontend                   |
| GET    | /api/v1/notifications/unread-count     | JWT                   | Lấy số lượng thông báo chưa đọc của người dùng hiện tại                       |
| PATCH  | /api/v1/notifications/:id/read         | JWT                   | Đánh dấu một thông báo là đã đọc (cập nhật `isRead: true`, `readAt`)           |
| PATCH  | /api/v1/notifications/read-all         | JWT                   | Đánh dấu toàn bộ thông báo của người dùng là đã đọc                            |
| GET    | /api/v1/audit-logs                     | Admin                 | Truy vấn nhật ký kiểm toán hệ thống (dữ liệu nhạy cảm được che `[REDACTED]`)   |
| POST   | /api/v1/jobs/deadlines/trigger         | Admin / Teacher       | Đưa tác vụ kiểm tra deadline vào hàng đợi BullMQ chạy nền ngay lập tức         |
| GET    | /api/v1/jobs/health                    | Admin                 | Kiểm tra trạng thái và số lượng job (waiting, active, failed) trên Redis BullMQ|
| GET    | /api/v1/health/live                    | Public                | Liveness probe kiểm tra process event-loop (độc lập với heap tạm thời)        |
| GET    | /api/v1/health/ready                   | Public                | Readiness probe kiểm tra kết nối trực tiếp tới MongoDB Replica Set và Redis    |
| GET    | /api/v1/health/memory                  | Public                | Giám sát bộ nhớ Heap độc lập theo ngưỡng `health.heapThresholdMb`             |

## API Endpoints (Phase 10 — Daily Scheduling & Teacher-Configurable Assignments)

| Method | Path                                   | Auth                  | Mô tả                                                                          |
|--------|----------------------------------------|-----------------------|--------------------------------------------------------------------------------|
| POST   | /api/v1/assignments/validate           | Admin / Teacher       | Xác thực cấu hình bài tập trước khi giao (kiểm tra scope, partId, date, v.v.)   |
| POST   | /api/v1/assignments/preview            | Admin / Teacher       | Xem trước cấu trúc bài tập, đoạn văn, danh sách câu hỏi và số lượng học viên  |
| GET    | /api/v1/assignments/:id/preview       | Admin / Teacher       | Xem trước toàn diện nội dung bài tập đã tạo                                   |
| POST   | /api/v1/assignments                   | Admin / Teacher       | Tạo bài tập theo ngày (06:00 VN) với `assignedDate`, lọc nhóm câu hỏi, idempotency |
| GET    | /api/v1/assignments/mine              | Student               | Xem danh sách bài tập cá nhân kèm đếm ngược và trạng thái vòng đời `SCHEDULED`|

## Swagger UI

Truy cập: http://localhost:3000/api/v1/docs

## Lưu ý quan trọng

- **MongoDB Transaction:** Yêu cầu chạy MongoDB ở chế độ Replica Set. Xem setup ở trên.
- **Không hardcode secret:** Mọi secret phải qua biến môi trường (`.env`).
- **Timezone:** Lưu timestamp UTC trong DB; nghiệp vụ deadline/gia hạn dùng `Asia/Ho_Chi_Minh`.
- **Answer Key:** Không bao giờ trả đáp án trước khi học viên PASS (>= 70%).
