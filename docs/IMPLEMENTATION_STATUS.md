# IMPLEMENTATION STATUS

Cập nhật theo từng phase. Trạng thái: ✅ Done | 🚧 In Progress | ❌ Blocked | 📋 TODO

---

## Phase 0 — Foundation ✅

| Item | Status | Notes |
|------|--------|-------|
| NestJS project scaffold | ✅ | Manual scaffold (không dùng `nest new` để kiểm soát hoàn toàn) |
| `tsconfig.json` strict | ✅ | `noImplicitAny`, `strictNullChecks`, `strictBindCallApply` |
| `package.json` với đủ deps | ✅ | NestJS 10, Mongoose 8, BullMQ 5, Argon2, Passport-JWT |
| `.env.example` | ✅ | Không commit `.env` |
| `.gitignore` | ✅ | |
| Config module + Joi validation | ✅ | `src/config/configuration.ts` |
| MongoDB connection module | ✅ | `src/database/database.module.ts` |
| Redis config (env-ready) | ✅ | Env vars defined, BullMQ integration Phase 5 |
| Swagger/OpenAPI setup | ✅ | `/api/v1/docs` |
| Global prefix `/api/v1` | ✅ | |
| Global Exception Filter | ✅ | `GlobalExceptionFilter` |
| Global Validation Pipe | ✅ | whitelist, forbidNonWhitelisted, transform |
| Helmet, CORS, cookie-parser | ✅ | |
| Health endpoints | ✅ | `/api/v1/health/live`, `/api/v1/health/ready` |
| Dockerfile multi-stage | ✅ | Node 22 Alpine |
| docker-compose.yml | ✅ | MongoDB replica set + Redis + API |
| README.md (tiếng Việt) | ✅ | |
| Rate limiting | ✅ | ThrottlerModule (10 req/min login, 100 req/min default) |

---

## Phase 1 — Database Schemas ✅

| Schema | Status | Collection | Indexes |
|--------|--------|------------|---------|
| users | ✅ | `users` | email (unique), role+status |
| student_profiles | ✅ | `student_profiles` | userId (unique) |
| teacher_profiles | ✅ | `teacher_profiles` | userId (unique) |
| courses | ✅ | `courses` | code (unique), teacherId+status |
| enrollments | ✅ | `enrollments` | courseId+studentId (unique compound) |
| lessons | ✅ | `lessons` | courseId+startAt |
| exercises | ✅ | `exercises` | type+status, createdBy |
| assignments | ✅ | `assignments` | courseId+status, deadlineAt+status |
| student_assignments | ✅ | `student_assignments` | assignmentId+studentId (unique), status+effectiveDeadlineAt |
| submissions | ✅ | `submissions` | studentAssignmentId+attemptNo (unique) |
| translation_submissions | ✅ | `translation_submissions` | studentAssignmentId (unique) |
| extension_requests | ✅ | `extension_requests` | studentId+createdAt, partial unique pending |
| penalty_transactions | ✅ | `penalty_transactions` | idempotencyKey (unique), studentId+createdAt |
| notifications | ✅ | `notifications` | userId+createdAt, userId+isRead |
| email_deliveries | ✅ | `email_deliveries` | idempotencyKey (unique), status+createdAt |
| audit_logs | ✅ | `audit_logs` | actorId+createdAt, entityType+entityId+createdAt |
| **Enums** | ✅ | `src/database/schemas/enums.ts` | UserRole, UserStatus, CourseType, CourseStatus, LessonStatus, ExerciseType, QuestionType, ExerciseStatus, AssignmentStatus, StudentAssignmentStatus, EnrollmentStatus, TranslationSubmissionStatus, ExtensionRequestStatus, NotificationType, EmailDeliveryStatus |
| **Seed script** | ✅ | `src/database/seed/seed.ts` | Admin + Teacher + Student sample |

---

## Phase 2 — Auth + Users ✅

| Item | Status | Notes |
|------|--------|-------|
| JWT Strategy (passport-jwt) | ✅ | `src/modules/auth/strategies/jwt.strategy.ts` |
| Argon2id password hashing | ✅ | In AuthService.create + validateUser |
| Login endpoint | ✅ | `POST /api/v1/auth/login` |
| Refresh token (rotation) | ✅ | In-memory store (dev) — PROVISIONAL, needs Redis in prod |
| Logout (revoke) | ✅ | `POST /api/v1/auth/logout` |
| GET /auth/me | ✅ | Returns sanitized user, no passwordHash |
| Roles decorator | ✅ | `@Roles(UserRole.ADMIN)` |
| RolesGuard | ✅ | Checks user.role against @Roles() |
| CurrentUser decorator | ✅ | `@CurrentUser()` |
| GlobalExceptionFilter | ✅ | Consistent error shape |
| TransformInterceptor | ✅ | Wraps responses in `{statusCode, data, timestamp}` |
| POST /users (Admin) | ✅ | Creates user + profile |
| GET /users (Admin) | ✅ | Paginated list with filters |
| GET /users/me | ✅ | Self profile, no passwordHash |
| PATCH /users/me | ✅ | Whitelist: fullName, phone |
| GET /users/:id (Admin/Teacher) | ✅ | |
| PATCH /users/:id (Admin) | ✅ | |
| PATCH /users/:id/status (Admin) | ✅ | |
| Unit tests — AuthService | ✅ | `auth.service.spec.ts` |
| Unit tests — UsersService | ✅ | `users.service.spec.ts` (incl. scoring logic) |
| E2E test skeleton | ✅ | `test/auth.e2e-spec.ts` |

---

## Phase 3 — Courses + Lessons ✅

| Item | Status | Notes |
|------|--------|-------|
| CoursesModule | ✅ | `src/modules/courses/` — CRUD, band `0..9` (`0.5` step), archive-on-history |
| EnrollmentsModule | ✅ | `src/modules/enrollments/` — active-record, history array, atomic rejoin/drop, `ONE_TO_ONE` partial unique index |
| LessonsModule | ✅ | `src/modules/lessons/` — UTC storage, `Asia/Ho_Chi_Minh` display fields, date range & course filters, soft-cancel |
| Course CRUD API | ✅ | `POST/GET/PATCH/DELETE /api/v1/courses`, `GET /api/v1/courses/mine`, `GET /api/v1/courses/:id` |
| Enrollment API | ✅ | `GET/POST /api/v1/courses/:id/students`, `DELETE /api/v1/courses/:id/students/:studentId` |
| Lessons API | ✅ | `POST/GET /api/v1/courses/:courseId/lessons`, `GET /api/v1/lessons/mine`, `GET/PATCH/DELETE /api/v1/lessons/:id`, `PATCH /api/v1/lessons/:id/cancel` |
| Google Meet URL validation | ✅ | `@IsUrl({ protocols: ['https'], require_protocol: true })` |
| Bugfix (Phase 2 guard order) | ✅ | Removed misplaced global `RolesGuard` in `src/main.ts` so `AuthGuard('jwt')` runs before `RolesGuard` |
| Unit tests — Courses/Enrollments/Lessons | ✅ | `courses.service.spec.ts`, `enrollments.service.spec.ts`, `lessons.service.spec.ts` (43/43 unit tests Phase 0–3 PASS) |
| HTTP Integration tests — Phase 3 | ✅ | `test/phase3.e2e-spec.ts` (14/14 passed, Supertest + mocked services/JWT guard) |
| Real MongoDB Replica Set + Redis Runtime Validation | ✅ | Docker `ielts-lms-mongo` (`rs0`, healthy) & `ielts-lms-redis` (`PONG`); `npm run seed` OK; `npm run test:e2e -- --runInBand --forceExit` (`3/3 suites`, `27/27 tests PASS` gồm `phase3-real-mongo.e2e-spec.ts`, `auth.e2e-spec.ts`, `phase3.e2e-spec.ts`); kiểm tra `unique_active_one_to_one_course` partial unique index thực tế trên MongoDB |
| Runtime Fixes Applied | ✅ | 1) `docker/mongo-init.js` + `${MONGO_HOST_PORT:-27017}:27017` + sửa Redis `--requirepass` khi rỗng trong `docker-compose.yml`; 2) `Joi.string().email({ tlds: { allow: false } })` cho `.local` emails trong `configuration.ts`; 3) `OnApplicationBootstrap` gọi `model.createIndexes()` trong `DatabaseModule`; 4) Tăng memory heap threshold lên `768 MB` trong `HealthController` |

---

## Phase 4 — Exercise Bank & Assignment Management ✅ (Submissions/Grading reserved for Phase 5)

| Item | Status | Notes |
|------|--------|-------|
| ExercisesModule | ✅ | `src/modules/exercises/` — Ngân hàng đề, hỗ trợ đầy đủ 10 IELTS `QuestionType`, version bumping khi sửa đề published, soft-archive |
| AssignmentsModule | ✅ | `src/modules/assignments/` — Giao bài theo khóa, hỗ trợ ngày chuẩn Việt Nam (`targetDate` -> 00:00:00 đến 23:59:59.999 `Asia/Ho_Chi_Minh`) hoặc mốc UTC tùy biến, chụp `exerciseSnapshot` bất biến |
| Student Assignment Tracking | ✅ | Tự động tạo `student_assignments` cho toàn bộ học viên `ACTIVE` khi publish; hỗ trợ `POST /assignments/:id/backfill-students` an toàn và idempotent |
| Answer Key Protection (Zero Leakage) | ✅ | Triệt để loại bỏ `answerSpecification` và `explanation` khi học viên truy cập (`GET /exercises/:id` & `GET /assignments/:id`), cấm học viên duyệt danh sách ngân hàng đề (`GET /exercises` 403) |
| Reading Translation Preparation | ✅ | Bảo lưu trường `passage` trong snapshot để học viên đối chiếu văn bản gốc tiếng Anh, schema `translation_submissions` sẵn sàng cho Phase 5 |
| Unit Tests (Exercises & Assignments) | ✅ | `exercises.service.spec.ts` (10 tests), `assignments.service.spec.ts` (13 tests) -> Tổng 66/66 unit tests PASS |
| Real MongoDB E2E Tests | ✅ | `test/phase4.e2e-spec.ts` (18/18 tests PASS trên Docker MongoDB replica set `rs0`): kiểm tra CRUD đề, snapshot, VN timezone, tracking, backfill và zero-leakage guarantee |
| SubmissionsModule & Auto-Grading | ✅ | Hoàn thành ở Phase 5: Chấm điểm tự động 10 dạng câu hỏi, unlock đáp án sau PASS, nộp bài dịch Reading |

---

## Phase 5 — Submission, Auto-Grading & Reading Translation ✅

| Item | Status | Notes |
|------|--------|-------|
| SubmissionsModule | ✅ | `src/modules/submissions/` — Quản lý lượt nộp bài, attemptNo tăng tuần tự, lịch sử nộp bài đầy đủ |
| Server-Side Auto-Grading Engine | ✅ | Hỗ trợ đầy đủ 10 IELTS `QuestionType`, chuẩn hóa text (trim, space collapse), so sánh threshold unrounded (đúng 70% là PASS, 69.999% là NOT PASS) |
| Answer Key Unlocking Security | ✅ | Tuyệt đối không gửi đáp án trong kết quả nộp bài; endpoint chuyên biệt `GET /api/v1/assignments/:id/answers` bắt buộc kiểm tra điều kiện PASS (>= 70%) |
| Retake & Attempt Limit Policies | ✅ | Kiểm soát `allowRetake` và `maxAttempts`, bảo lưu `bestScore` và trạng thái `PASSED` lịch sử |
| Concurrency & MongoDB Transactions | ✅ | Chống trùng lặp lượt nộp qua index `{ studentAssignmentId: 1, attemptNo: 1 }` và cập nhật nguyên tử `student_assignments` trong transaction |
| TranslationsModule | ✅ | `src/modules/translations/` — Học viên nộp bản dịch tiếng Việt cho bài Reading (`POST /assignments/:id/translations`), xem lại kèm đoạn văn gốc tiếng Anh |
| Teacher Translation Review | ✅ | Giáo viên phụ trách khóa học đánh giá và để lại nhận xét (`PATCH /translations/:id/review`), cập nhật trạng thái `REVIEWED` |
| Unit Tests (Phase 5) | ✅ | `submissions.service.spec.ts` (7 tests), `translations.service.spec.ts` (5 tests) -> Tổng 78/78 unit tests PASS (9 suites) |
| Real MongoDB E2E Tests (Phase 5) | ✅ | `test/phase5.e2e-spec.ts` (13/13 tests PASS trên replica set `rs0`): kiểm tra auto-grading, threshold, retake limits, unlock key sau PASS và workflow bài dịch |
| **Toàn bộ Test Suite** | ✅ | **78/78 Unit Tests PASS**, **58/58 E2E Tests PASS**, `npm run build` PASS (0 errors) |

---

## Phase 6 — Deadline, Extension Requests & Penalty Management ✅

| Item | Status | Notes |
|------|--------|-------|
| DeadlinesModule | ✅ | `src/modules/deadlines/` — Hàm kiểm tra hạn chót tập trung `isAssignmentOverdue`, bộ quét quét bài quá hạn idempotent `processOverdueAssignments` với MongoDB transactions |
| ExtensionsModule | ✅ | `src/modules/extensions/` — Hạn mức 3 lần/tháng dương lịch theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), chống trùng lặp đơn PENDING (409 Conflict), cập nhật atomic deadline khi duyệt |
| PenaltiesModule | ✅ | `src/modules/penalties/` — Sổ cái giao dịch phạt bất biến (thuần điểm phạt nguyên dương, không quy đổi tiền tệ), giao dịch bù trừ (compensating transaction) `-1 điểm` kèm lý do giải trình khi hủy phạt |
| Vietnam Timezone Bounds | ✅ | `src/common/utils/timezone.util.ts` — `createVnMonthBounds` tính chuẩn xác `00:00:00.000` ngày đầu tháng đến `23:59:59.999` ngày cuối tháng theo giờ Việt Nam |
| Unit Tests (Phase 6) | ✅ | `deadlines.service.spec.ts` (5 tests), `extensions.service.spec.ts` (6 tests), `penalties.service.spec.ts` (4 tests) |
| Real MongoDB E2E Tests (Phase 6) | ✅ | `test/phase6.e2e-spec.ts` (17/17 tests PASS trên replica set `rs0`): hạn mức 3 lần/tháng, chặn lần thứ 4, chặn trùng đơn pending, giáo viên duyệt/từ chối, học viên rút đơn, quét quá hạn idempotent, xem sổ cái phạt, hủy phạt bù trừ, hồi phục phạt tự động khi duyệt gia hạn, chống phạt trùng khi đổi deadline |

---

## Phase 7 — Redis, BullMQ, Background Workers & Email Notifications ✅

| Item | Status | Notes |
|------|--------|-------|
| Pre-implementation Audit | ✅ | Xóa bỏ quy đổi tiền tệ tạm tính `100k VND/point`, chuẩn hóa khóa xác định `penalty:overdue:${id}` chống phạt trùng khi đổi deadline, tự động hoàn phạt bù trừ khi duyệt gia hạn, khóa tài liệu `StudentProfile` chống race-condition quota |
| BullMQ & Redis Integration | ✅ | `@nestjs/bullmq` kết nối Redis qua `ConfigService`, retry exponential backoff (attempts 3, delay 1000ms), cấu hình lưu trữ 100 completed jobs, 500 failed jobs |
| JobsModule (Processors & Scheduler) | ✅ | `src/modules/jobs/` — `EmailProcessor` (concurrency 5), `DeadlineProcessor` (concurrency 1), `DeadlineScheduler` (repeatable job mỗi 60s), `JobsController` (`/jobs/deadlines/trigger`, `/jobs/health`) |
| MailModule (Nodemailer) | ✅ | `src/modules/mail/` — Tích hợp Nodemailer, bộ render template email chuyên biệt (`assignment-published`, `assignment-overdue`, `course-enrolled`, `extension-reviewed`), mock transport an toàn cho dev/test |
| NotificationsModule | ✅ | `src/modules/notifications/` — In-app notifications, đếm unread count, đánh dấu đã đọc đơn lẻ/hàng loạt, tự động enqueue email delivery với khóa chống gửi trùng `jobId = email-${notifId}` |
| AuditModule | ✅ | `src/modules/audit/` — Ghi vết nhật ký kiểm toán hệ thống `audit_logs`, tự động che dấu thông tin nhạy cảm (`password`, `token`, `answerSpecification`, `correctKey`) thành `[REDACTED]` |
| Cross-Module Integration Hooks | ✅ | Tích hợp tự động thông báo và audit log khi ghi danh học viên (`EnrollmentsService`), giao bài mới (`AssignmentsService`), quá hạn phạt điểm (`DeadlinesService`), duyệt gia hạn (`ExtensionsService`), hoàn điểm phạt (`PenaltiesService`) |
| Unit Tests (Phase 7) | ✅ | `mail.service.spec.ts` (4 tests), `audit.service.spec.ts` (2 tests), `notifications.service.spec.ts` (3 tests), `jobs.service.spec.ts` (4 tests) -> Tổng 106/106 unit tests PASS (16 suites) |
| Real MongoDB & Redis E2E Tests | ✅ | `test/phase7.e2e-spec.ts` (10/10 tests PASS): kiểm tra vòng đời in-app notifications, unread count, quyền hạn audit logs, kiểm tra health Redis BullMQ, kích hoạt trigger job, và xác nhận worker xử lý email nền thực tế |
| **Toàn bộ Test Suite** | ✅ | **106/106 Unit Tests PASS (16/16 suites)**, **85/85 E2E Tests PASS (7/7 suites)**, `npm run build` PASS (0 errors) |

---

## Phase 8 — Security Audit, System Integration Testing & Production Readiness ✅

| Item | Status | Notes |
|------|--------|-------|
| Security Audit & Hardening | ✅ | `docs/SECURITY_AUDIT.md` — Rà soát toàn diện 10 danh mục rủi ro từ SEC-01 đến SEC-10, khắc phục triệt để mọi rủi ro High & Critical |
| Redis-Backed Refresh Token Store | ✅ | `src/modules/auth/auth.service.ts` — Lưu trữ Redis TTL (7d), xoay vòng nguyên tử qua Lua script (`getdel`), chống replay attack (401), thu hồi khi logout, fallback in-memory an toàn cho unit test |
| Account Suspension Enforcement | ✅ | `src/modules/auth/strategies/jwt.strategy.ts` — Truy vấn `status: UserStatus.ACTIVE` trên mọi request, từ chối ngay lập tức token của tài khoản bị khóa/treo (401) |
| Controlled Production Indexing | ✅ | `src/database/scripts/init-indexes.ts` — Bỏ tự động tạo index trên bootstrap khi `NODE_ENV=production`, cung cấp lệnh `npm run init:indexes` đồng bộ 16 collection có kiểm soát |
| Durable Transactional Outbox | ✅ | `src/modules/jobs/processors/deadline.processor.ts` — Cơ chế Outbox Sweeper định kỳ quét và đẩy lại các email `QUEUED` bị tồn đọng do gián đoạn Redis/mạng, không làm ảnh hưởng giao dịch chính |
| Multi-Probe Observability & Correlation ID | ✅ | `src/common/middleware/correlation-id.middleware.ts` (`X-Correlation-Id`), `HealthModule` tách rời Liveness (`/health/live`), Readiness (`/health/ready` đa điểm MongoDB + Redis) và Dedicated Memory Monitoring (`/health/memory`) |
| Production Containerization & Config | ✅ | Multi-stage `Dockerfile` (chạy quyền `appuser` unprivileged), `.env.production.example` bảo mật, Docker Compose healthcheck |
| OpenAPI Schema Export | ✅ | `npm run export:openapi` — Xuất đặc tả chuẩn `docs/openapi.json` (98KB) tự động từ metadata NestJS |
| Frontend API Integration Contract | ✅ | `docs/FRONTEND_API_CONTRACT.md` — Tài liệu tích hợp hoàn chỉnh dành cho đội ngũ phát triển Next.js 14/15 App Router |
| Production Operations Guide | ✅ | `docs/DEPLOYMENT_GUIDE.md` — Hướng dẫn triển khai, cấu hình bảo mật, quy trình sao lưu và phục hồi thảm họa `mongodump`/`mongorestore` |
| Real MongoDB & Redis Integration Tests | ✅ | `test/phase8.e2e-spec.ts` (19/19 tests PASS): kiểm tra chi tiết liveness/readiness/memory, áp lực heap không làm sập liveness, correlation ID, xoay vòng và replay token, thu hồi khi logout, chặn tài khoản bị đình chỉ, RBAC, auto-grading 70% threshold, khóa/mở đáp án sau PASS, thông báo in-app |
| **Toàn bộ Test Suite** | ✅ | **110/110 Unit Tests PASS (16/16 suites)**, **106/106 E2E Tests PASS (8/8 suites)**, `npm run build` PASS (0 errors) |

---

## Phase 9 — IELTS Exam Modes, Teacher Question Bank, Auto-Grading & Reading Translation Unlock ✅

| Item | Status | Notes |
|------|--------|-------|
| Teacher Question Bank & Test Authoring | ✅ | `src/modules/exam-tests/` — Quản lý bài thi đa kỹ năng (READING / LISTENING), hỗ trợ phân cấp Test -> Parts (Passages 1-3, Sections 1-4) -> Question Groups -> Questions. Hỗ trợ preview đầy đủ đáp án cho giáo viên, kiểm tra tính toàn vẹn (validate) và phát hành bất biến (publish). Tạo phiên bản mới (`DRAFT`) từ bài thi đã phát hành. |
| Media Audio Integration | ✅ | `src/modules/media/` — Endpoints `/api/v1/media/audio/upload-intent` và `/api/v1/media/audio/:assetId/playback` ký URL phát âm thanh có thời hạn cho bài thi Listening. |
| Student Catalog & Zero-Leakage Projection | ✅ | Học viên xem danh sách bài thi đã phát hành (`GET /api/v1/exam-tests`). Endpoint chi tiết phần thi (`GET /api/v1/exam-tests/:id/parts/:partId`) lọc bỏ 100% `grading` (acceptedKeys, scoringStrategy, explanation) qua `ExamTestMapper`. |
| Exam Modes Engine (PART & FULL) | ✅ | `src/modules/exam-attempts/` — Khởi tạo phiên làm bài thi (`POST /api/v1/exam-attempts`) với chế độ `PART` (giới hạn câu hỏi theo phần, tính điểm theo phần) hoặc `FULL` (đầy đủ các phần, đánh số câu hỏi liên tục toàn bài). |
| Realtime Autosave & Optimistic Concurrency | ✅ | `PUT /api/v1/exam-attempts/:id/answers` hỗ trợ lưu nháp đáp án kèm kiểm soát xung đột qua `answersRevision` (`baseRevision === currentRevision`, trả về 409 Conflict nếu xung đột). |
| Server-Side Auto-Grading Engine (14 IELTS Types) | ✅ | `src/common/utils/exam-grading.util.ts` — Hỗ trợ 14 loại câu hỏi IELTS: Multiple Choice, True/False/Not Given, Yes/No/Not Given, Matching Headings/Information/Features/Sentence Endings, Summary/Sentence/Note/Table/Flowchart/Diagram Completion, Short Answer. Chấm điểm server-side, bảo lưu ngưỡng đạt PASS ≥ 70% không làm tròn (unrounded). |
| Dynamic Reading Translation Unlock Engine | ✅ | `src/modules/reading-translations/` — Học viên thi đạt PASS (≥ 70%) mở khóa quyền dịch bài đọc Reading: chế độ `PART` mở khóa DUY NHẤT Passage đã đạt; chế độ `FULL` mở khóa TOÀN BỘ Passages trong bài. Chưa đạt trả về 403 `TRANSLATION_LOCKED`. |
| Reading Translation Submission & Teacher Review | ✅ | Học viên lưu nháp (`POST .../draft`) và nộp bài dịch (`POST .../submit`). Giáo viên phụ trách xem danh sách bài dịch cần chấm (`GET /api/v1/teacher/reading-translations`) và chấm điểm/để lại nhận xét nhận diện trạng thái `REVIEWED`. |
| Course Assignment Integration | ✅ | `src/modules/assignments/` — Giáo viên có thể giao bài thi IELTS cho khóa học với phạm vi yêu cầu `requiredScope` (`PART` hoặc `FULL`), chỉ định `requiredPartId` và ghi đè thời lượng làm bài `durationSecondsOverride`. |
| Unit Tests (Phase 9) | ✅ | `exam-tests.service.spec.ts` (10 tests), `exam-attempts.service.spec.ts` (7 tests), `reading-translations.service.spec.ts` (6 tests) -> **133/133 Unit Tests PASS (19/19 suites)**. |
| Real MongoDB & Redis E2E Tests (Phase 9) | ✅ | `test/phase9.e2e-spec.ts` (18/18 tests PASS trên replica set `rs0`): bao phủ trọn vẹn từ AC-01 đến AC-20. |
| **Toàn bộ Test Suite** | ✅ | **133/133 Unit Tests PASS (19/19 suites)**, **124/124 E2E Tests PASS (9/9 suites)**, `npm run build` PASS (0 errors), `npx tsc --noEmit` PASS (0 errors). |

---

## Phase 10 — Daily Assignment Scheduling & Teacher-Configurable IELTS Assignments ✅

| Item | Status | Notes |
|------|--------|-------|
| Fixed Daily Assignment Window (06:00 VN) | ✅ | `src/common/utils/timezone.util.ts` — `createVnDailyAssignmentBounds(assignedDate)` tạo khung giờ `[06:00:00, 06:00:00 ngày hôm sau)` theo múi giờ `Asia/Ho_Chi_Minh` (+07:00), lưu trữ chuẩn UTC Date. Giữ nguyên `createVnDailyBounds(targetDate)` (`00:00:00` đến `23:59:59.999`) tương thích ngược Phase 4-8. |
| Status Lifecycle Architecture | ✅ | `src/database/schemas/assignment.schema.ts` & `student-assignment.schema.ts` — Dual-track status: lưu trữ DB lowercase (`draft`, `scheduled`, `published`, `closed`), tính toán và trả về API chuẩn hóa chữ hoa (`DRAFT`, `SCHEDULED`, `AVAILABLE`, `EXPIRED`, `COMPLETED`). |
| Advance Scheduling & Zero-Leakage | ✅ | Bài tập `SCHEDULED` (`now < openAt`) chỉ hiển thị metadata và đếm ngược trên dashboard/lịch (`GET /assignments/mine`, `GET /assignments/:id`). Bóc tách 100% `passage`, `questions`, `audioAssets`. Bắt đầu làm bài trước `openAt` bị từ chối nghiêm ngặt với mã lỗi HTTP 403 `ASSIGNMENT_NOT_YET_AVAILABLE`. |
| Teacher Assignment Validation & Preview | ✅ | `POST /api/v1/assignments/validate` (HTTP 200 `{ valid, errors }`), `POST /api/v1/assignments/preview` (dry-run không ghi DB), `GET /api/v1/assignments/:id/preview` (xem trước toàn bộ nội dung bài tập cho giáo viên/admin). |
| Question Bank Scope & Custom Question Groups | ✅ | Hỗ trợ lọc nhóm câu hỏi `selectedQuestionGroupIds` và biên soạn câu hỏi trực tiếp `customQuestionGroups` với 14 loại câu hỏi IELTS `ExamQuestionType`, tự động tính toán số câu hỏi và tổng điểm. |
| Client Idempotency Protection | ✅ | Hỗ trợ `idempotencyKey` khi tạo bài tập, tự động trả về bản ghi hiện hữu nếu key đã tồn tại; kiểm tra chống trùng lặp theo `(courseId, exerciseId, openAt)`. |
| Deadline-Capped Attempt Expiration | ✅ | `src/modules/exam-attempts/exam-attempts.service.ts` — Thời gian hết hạn phiên làm bài tự động bị giới hạn theo deadline bài tập: `expiresAt = min(startedAt + duration, effectiveDeadlineAt)`. |
| Decoupled Target Score vs 70% Unlock | ✅ | Cho phép giáo viên cấu hình điểm mục tiêu hoàn thành khóa học `targetScorePercent` (mặc định 70%). Quy tắc mở khóa bài dịch Reading bảo lưu tuyệt đối ngưỡng đạt 70% unrounded (đạt 60% khi target 50% vẫn không mở khóa bản dịch). |
| Unit Tests (Phase 10) | ✅ | `assignments.service.spec.ts` (12 tests) -> **135/135 Unit Tests PASS (19/19 suites)**. |
| Real MongoDB Replica Set & Redis E2E Tests | ✅ | `test/phase10.e2e-spec.ts` (14/14 tests PASS trên replica set `rs0`): bao phủ trọn vẹn AC-01 đến AC-11b. |
| **Toàn bộ Test Suite Tổng thể** | ✅ | **135/135 Unit Tests PASS (19/19 suites)**, **138/138 E2E Tests PASS (10/10 suites)**, `npm run build` PASS (0 errors), `npx tsc --noEmit` PASS (0 errors). |

---

## Blockers & Trạng thái giải quyết

1. **MongoDB Replica Set:** Yêu cầu replica set để hỗ trợ multi-document transactions. Đã cung cấp sẵn cấu hình tự động khởi tạo `rs0` qua `docker-compose.yml` và `docker/mongo-init.js`.
2. **Refresh Token Store:** ✅ **ĐÃ GIẢI QUYẾT TRỌNG VẸN (Phase 8)** — Chuyển đổi thành công sang kho lưu trữ Redis TTL kèm xoay vòng nguyên tử và phòng chống replay attack.
3. **SMTP Service:** Hỗ trợ chế độ Mock Transport an toàn trong môi trường test/dev, sẵn sàng kết nối SendGrid/SES khi cấu hình `.env.production`.

