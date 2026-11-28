# MASTER PROMPT — XÂY DỰNG BACKEND IELTS LMS TỪ ĐẦU

Bạn là Senior Backend Engineer / Software Architect. Hãy **thực sự tạo mã nguồn, cấu hình và test** cho một dự án Backend mang tên `ielts-lms-backend` trong workspace hiện tại. Đây là dự án mới, tôi CHƯA cung cấp System Design hay source code trước đó, vì vậy **toàn bộ đặc tả bên dưới là nguồn yêu cầu chính**. Không chỉ viết báo cáo hoặc giả lập kết quả.

## 0. Quy tắc làm việc

1. Kiểm tra workspace trước khi sửa. Nếu có code, phân tích và bảo toàn code hợp lệ; nếu trống, scaffold dự án NestJS mới. Không xóa dữ liệu tùy tiện.
2. Backend only; không tạo Next.js/React. Thiết kế REST JSON API cho frontend sẽ phát triển độc lập.
3. Dùng phiên bản stable tương thích hiện hành của Node.js LTS và các dependency, không tự đoán API của thư viện. Dùng npm và TypeScript strict.
4. Triển khai theo các phase bên dưới. **Ở lần chạy đầu, hoàn thành Phase 0–2 trước**, chạy build/test, báo cáo rõ file đã tạo và lỗi còn lại. Sau đó tiếp tục Phase 3–5 theo các prompt tiếp theo của tôi. Không sinh hàng loạt code chưa kiểm chứng.
5. Không hardcode secret, mật khẩu, MongoDB URI, access token. Tạo `.env.example`, không commit `.env`.
6. Dùng NestJS Modular Monolith: controller -> service -> repository/Mongoose model. DTO và validation ở API boundary, RBAC + kiểm tra ownership ở tầng nghiệp vụ.
7. Tài liệu API dùng Swagger/OpenAPI `/api/docs`; đặt prefix `/api/v1`; dùng UTC khi lưu timestamp và `Asia/Ho_Chi_Minh` cho ngày học / thời hạn nghiệp vụ.
8. Không khẳng định chạy thành công nếu chưa thực thi thật. Nếu môi trường thiếu Docker/MongoDB/Redis hoặc npm không truy cập mạng, nêu rõ blocker và chạy kiểm tra tối đa có thể.
9. Viết README tiếng Việt, code/type/name tiếng Anh. Không thay đổi business rule chưa rõ bằng cách âm thầm tự suy đoán; áp dụng quy định **provisional** được liệt kê ở cuối, cô lập chúng trong cấu hình và ghi rõ trong `docs/DECISIONS.md`.

## 1. Mục tiêu sản phẩm

IELTS Learning Management System (LMS) cho Student, Teacher, Admin, tập trung vào Reading, Listening, dịch bài Reading sang tiếng Việt, quản lý khóa học, lịch học (Google Meet URL), deadline hằng ngày, điểm PASS >=70%, xin gia hạn tối đa 3 lần mỗi học viên mỗi tháng, điểm phạt +1 cho bài quá hạn và thông báo email khi có bài mới/quá hạn/thêm khóa học.

- Student: đăng nhập; dashboard, danh sách khóa/lớp; lịch Google Meet; làm và nộp Reading/Listening; xem điểm; chỉ xem đáp án sau PASS; nộp bản dịch; xin gia hạn; xem số điểm phạt, lịch sử và thông báo.
- Teacher: dashboard phạm vi lớp được phân công; quản lý khóa/lớp, học viên được phân quyền, lịch học, ngân hàng đề, giao bài, kết quả, phản hồi bản dịch, xét duyệt gia hạn.
- Admin: quản lý toàn bộ hệ thống, tài khoản, role, phân công giáo viên, cấu hình quản trị và audit.
- Worker: tiến trình kỹ thuật nền, **không phải user role**, xử lý queue/email/deadline/penalty.

## 2. Stack và kiến trúc

- Runtime: Node.js LTS, TypeScript strict.
- API: NestJS trên HTTP adapter Express, REST JSON, Swagger, class-validator/class-transformer.
- Database: MongoDB + `@nestjs/mongoose` + Mongoose. Sử dụng ObjectId ref cho quan hệ và embedded subdocuments cho câu hỏi/đáp án. MongoDB là NoSQL.
- Authentication: Argon2id hash password; JWT access token ngắn hạn; refresh token rotation với hash/token-family hoặc session record có thể thu hồi; role/ownership guards. Không gửi passwordHash ra response/log.
- Redis + BullMQ: job queue gửi email, kiểm tra deadline, cập nhật điểm phạt, reminder. Có retries/backoff/idempotency; job failure log.
- Mail: Nodemailer SMTP abstraction qua env (có thể chuyển provider khác).
- Upload: lưu audio/file trên S3-compatible object storage hoặc disk dev; MongoDB chỉ giữ metadata/key, không nhét file lớn vào document.
- DevOps: Dockerfile multi-stage, docker-compose (MongoDB replica set cho transaction nếu triển khai transaction, Redis, API, Worker), health endpoints, seed script, CI cơ bản.
- Testing: Jest unit + e2e, Supertest, kiểm thử RBAC, chấm điểm, deadline, concurrency, duplicate jobs.

### Logical flow

Next.js frontend (tương lai) -> HTTPS REST `/api/v1` -> NestJS modules -> MongoDB.
NestJS API -> BullMQ queues in Redis -> Worker -> MongoDB / SMTP.
Scheduler enqueues scan tasks; worker kiểm tra **effective deadline** theo từng học viên, không giả định một deadline chung.

## 3. Mô hình dữ liệu — 16 collections bắt buộc

Tạo NestJS Mongoose schemas, TypeScript enums, validation, timestamps, indexes rõ ràng. Các `_id` dùng ObjectId; các *Id tham chiếu collection khác. Thiết kế field bổ sung cần thiết phải có giải thích.

1. `users`: fullName, email (lowercase unique), passwordHash (select:false), role [student,teacher,admin], status [active,inactive,suspended], phone?, createdAt, updatedAt.
2. `student_profiles`: userId (unique ref users), currentBand? 0..9, targetBand?, optional metadata. `penaltyPoints` nếu cache thì không làm nguồn sự thật; giao dịch phạt là authoritative.
3. `teacher_profiles`: userId (unique ref users), specialization?, bio?, phone?.
4. `courses`: code(unique), title, description?, startBand, targetBand, type [one_to_one,group], teacherId ref users, startAt?, endAt?, status [draft,active,completed,archived], createdBy.
5. `enrollments`: courseId, studentId, status [active,dropped,completed], joinedAt, leftAt?, unique compound `(courseId,studentId)` cho active-record model; nếu cần rejoin, cập nhật record có history thay vì tạo duplicate.
6. `lessons`: courseId, title, startAt, endAt, meetUrl?, content?, status [scheduled,cancelled,completed]. Index `(courseId,startAt)`; xác thực startAt<endAt và chỉ giáo viên có quyền chỉnh.
7. `exercises`: title, type [reading,listening], passage? (text/blocks), audioAssets? (object key, URL policy), questions[] subdocuments (stable questionId, type, prompt, options?, answerSpecification, points), passScore (default 70), version, status [draft,published,archived], createdBy. Các loại câu hỏi tối thiểu: multiple_choice, true_false_not_given, yes_no_not_given, matching, fill_blank, short_answer. Thiết kế answer specification theo loại câu, chấm tại server. **Không bao giờ lộ correct answers hoặc explanation trong endpoint phục vụ Student trước PASS**; query `select:false` không đủ nếu trả nguyên nested object, phải có response mapper riêng.
8. `assignments`: courseId, exerciseId, exerciseVersion/snapshot tham chiếu bản đề bất biến, assignedBy, title?, openAt, deadlineAt, allowRetake, maxAttempts?, status [draft,scheduled,published,closed,archived]. Chỉ giao exercise đã published. Một bài có thể dùng lại nhiều lần, mỗi assignment là một lần giao cụ thể.
9. `student_assignments`: assignmentId, studentId, effectiveDeadlineAt, status [not_started,in_progress,submitted,passed,overdue,excused], bestScore?, passedAt?, lastSubmittedAt?, penaltyAppliedAt?, unique `(assignmentId,studentId)`; index `(status,effectiveDeadlineAt)` để scan quá hạn. Tạo record khi giao bài cho các học viên eligible; xử lý ghi danh muộn có quy tắc rõ.
10. `submissions`: studentAssignmentId (ref), assignmentId, studentId, attemptNo, answers[] {questionId,value, awardedPoints?}, scorePercent, correctCount, totalQuestions, isPassed, submittedAt, exerciseVersion/snapshotId; unique `(studentAssignmentId,attemptNo)`; giữ toàn bộ lịch sử và không ghi đè attempt trước.
11. `translation_submissions`: studentAssignmentId, assignmentId, studentId, translatedText, status [draft,submitted,reviewed], submittedAt?, reviewedBy?, teacherComment?, reviewedAt?. Reading translation chỉ liên kết Reading assignment, giáo viên review thủ công (AI chỉ là hướng mở rộng).
12. `extension_requests`: studentAssignmentId, studentId, courseId, reason, requestedDeadlineAt, status [pending,approved,rejected,cancelled], reviewedBy?, reviewedAt?, reviewNote?, createdAt. Index phục vụ đếm yêu cầu theo tháng `studentId,createdAt`; chống nhiều pending cho cùng studentAssignment bằng partial unique index nếu được. Giới hạn tháng phải kiểm tra atomically/concurrency-safe.
13. `penalty_transactions`: studentId, studentAssignmentId, deltaPoints (thường +1, hoàn tác -1), reason, idempotencyKey unique, createdAt, actorId?, reversedTransactionId?; tổng điểm phạt = sum deltaPoints hoặc cache đồng bộ có reconciliation.
14. `notifications`: userId, type [new_assignment,overdue,course_enrolled,extension_reviewed,other], title, body, payload?, isRead, createdAt, readAt?; index `(userId,createdAt)`.
15. `email_deliveries`: notificationId?, recipientEmail, templateKey, payload?, status [queued,sending,sent,failed], providerMessageId?, attemptCount, sentAt?, errorMessage?, idempotencyKey unique.
16. `audit_logs`: actorId?, action, entityType, entityId?, metadata? (sanitized), createdAt; never log credentials/tokens or sensitive answer keys.

Mongoose relationships cần đăng ký đúng `ref` model names và indexes bằng `Schema.index(...)`. Giá trị band từ 0 đến 9 theo bước 0.5 nếu cần, validation hợp lệ; datetime dùng Date UTC. Tạo migration/index notes trong docs.

## 4. Module structure

`AuthModule`, `UsersModule`, `CoursesModule`, `EnrollmentsModule`, `LessonsModule`, `ExercisesModule`, `AssignmentsModule`, `SubmissionsModule`, `TranslationsModule`, `ExtensionsModule`, `PenaltiesModule`, `NotificationsModule`, `MailModule`, `JobsModule`, `AuditModule`, `HealthModule`, `DatabaseModule`, `ConfigModule`.

Gợi ý cấu trúc:

```text
src/
  main.ts
  app.module.ts
  common/{decorators,guards,filters,interceptors,pipes,constants}/
  config/
  database/{schemas,seed}/
  modules/
    auth/{dto,controllers,services,strategies}/
    users/{dto,controllers,services}/
    courses/{dto,controllers,services}/
    enrollments/
    lessons/
    exercises/
    assignments/
    submissions/
    translations/
    extensions/
    penalties/
    notifications/
    mail/
    jobs/{processors,schedulers}/
    audit/
    health/
  workers/ (nếu tách worker bootstrap)
test/
docs/{API_CONTRACT.md,DECISIONS.md,DB_SCHEMA.md,IMPLEMENTATION_STATUS.md}
```

Không bắt buộc tách repository class cho CRUD đơn giản, nhưng thống nhất cấu trúc và không để business logic trong controller.

## 5. API contract tối thiểu

Prefix `/api/v1`; JSON response và lỗi nhất quán; list có `page,limit,total,items`; swagger bearer auth, validation DTO.

Auth:
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`.
- Admin bootstrap bằng CLI/seed an toàn, không public đăng ký Admin.

Users:
- `POST /users` (admin), `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `PATCH /users/:id/status`.
- `GET /users/me`, `PATCH /users/me` (self fields whitelist); role-aware.

Courses / enrollment:
- `POST /courses`, `GET /courses`, `GET /courses/:id`, `PATCH /courses/:id`, `GET /courses/:id/students`, `POST /courses/:id/students`, `DELETE /courses/:id/students/:studentId`.
- `GET /courses/mine`.

Lessons:
- `POST /courses/:courseId/lessons`, `GET /courses/:courseId/lessons`, `PATCH /lessons/:id`, `DELETE /lessons/:id`, `GET /lessons/mine`.

Exercises:
- `POST /exercises`, `GET /exercises`, `GET /exercises/:id`, `PATCH /exercises/:id`, `POST /exercises/:id/publish`.
- Teacher/Admin get answer key; Student gets sanitized exercise DTO only when assigned.

Assignments:
- `POST /assignments`, `GET /assignments`, `GET /assignments/mine`, `GET /assignments/:id`, `GET /assignments/:id/students`, `PATCH /assignments/:id` with safe constraints.

Submissions:
- `POST /student-assignments/:id/submissions`, `GET /student-assignments/:id/submissions`, `GET /student-assignments/:id/result`, `GET /student-assignments/:id/answer-key` (only after PASS; admin/teacher rights appropriately).

Translations:
- `POST /student-assignments/:id/translation`, `GET /student-assignments/:id/translation`, `PATCH /translation-submissions/:id/review`.

Extensions:
- `POST /student-assignments/:id/extension-requests`, `GET /extension-requests/mine`, `GET /extension-requests`, `PATCH /extension-requests/:id/decision`.

Penalties / Notifications:
- `GET /penalties/mine`, `GET /users/:id/penalties` (authorized), `GET /notifications/mine`, `PATCH /notifications/:id/read`.

Health:
- `GET /health/live`, `GET /health/ready`.

API phải trả 400 cho validation, 401 chưa xác thực, 403 không có quyền, 404 không thấy đối tượng hoặc cần tránh enumeration, 409 trùng, 422 khi nghiệp vụ không cho phép.

## 6. Business rules bắt buộc

### Chấm điểm

- Tính điểm server-side trên phiên bản đề immutable; không nhận `score/isPassed/correctAnswer` do client gửi.
- `scorePercent = earnedPoints / totalPossiblePoints * 100`, làm tròn để hiển thị, so PASS theo giá trị chưa làm tròn để không có trường hợp 69.995 bị PASS nhầm.
- PASS khi score >=70%; chỉ sau PASS mới unlock answer key và giải thích. Trả score và kết quả đúng/sai theo chính sách disclosure nhưng tuyệt đối không lộ correct answers trước PASS.
- Mỗi lần nộp tạo `submission` mới, `attemptNo` tăng tuần tự chống trùng khi concurrency; `bestScore` là maximum; không đổi `passed` về fail nếu retake thấp hơn.

### Deadline

- Bài hằng ngày mở 00:00, hạn kết thúc 23:59 giờ Asia/Ho_Chi_Minh. Thống nhất mốc chính xác: 23:59:59.999 local cuối ngày (stored UTC), không dùng giả định 23:59:00 khiến mất 59 giây.
- Mọi trạng thái overdue xét `student_assignments.effectiveDeadlineAt`, không xét deadline chung sau khi gia hạn.
- Scheduler có thể quét theo batch (ví dụ mỗi phút). Kiểm tra lần cuối trong transaction/atomic update để tránh race với submit/gia hạn; không claim đúng tuyệt đối 23:59 nếu worker chạy trễ.
- Điểm phạt +1 khi bài thật sự quá hạn theo chính sách provisional bên dưới; chống phạt trùng bằng unique idempotency key, khả năng retry và reconcile.

### Gia hạn

- Mỗi học viên tối đa 3 yêu cầu gia hạn mỗi tháng theo lịch Việt Nam, tính theo timestamp lúc gửi.
- Chặn race-condition với cơ chế atomic quota (có thể dùng collection counter bổ sung nếu thực sự cần, hoặc transaction + locking) và nói rõ tại docs. Không chỉ `countDocuments` rồi insert không khóa.
- Chỉ teacher quản lý course (hoặc admin) mới phê duyệt. Approved cập nhật effective deadline, lưu audit, gửi notification. Không sửa lịch sử submission.

### Phân quyền

- Student chỉ truy cập khóa đang ghi danh, bài của mình, bài dịch và thông báo của mình.
- Teacher chỉ quản lý khóa được phân công và học viên thuộc khóa đó, không mặc định được sửa account admin.
- Admin quản lý toàn hệ thống; event worker dùng internal service context, không giả làm role `worker`.

### Email

- Gửi email có bài mới, quá hạn, được thêm vào khóa học; tránh gửi trùng bằng delivery idempotency.
- API không chờ SMTP; enqueue job -> worker. Retry/backoff, giữ failed state để kiểm tra.

## 7. Quyết định provisional, phải ghi trong `docs/DECISIONS.md`

Yêu cầu gốc chưa xác nhận hết. Cho MVP dùng các giả định **có thể cấu hình** sau, đánh dấu `PROVISIONAL`:

1. Bài đã submit nhưng chưa đạt PASS trước deadline được tính là chưa hoàn thành và có thể bị quá hạn/phạt. Đây là giả định, cần Product Owner xác nhận.
2. Cho retake nếu `allowRetake=true` và chưa vượt `maxAttempts`, không trả đáp án trước PASS.
3. Đếm **số yêu cầu gia hạn được gửi** (bao gồm từ chối), không phải số được duyệt. Mỗi tháng theo `Asia/Ho_Chi_Minh`.
4. Bản dịch Reading được nộp và giáo viên đánh giá thủ công; chưa có AI auto-grade.
5. Nếu enrollment thay đổi, assignment được phân phối cho học viên active tại thời điểm publish; ghi danh muộn có API/backfill có kiểm soát, không tự động sửa lịch sử.
6. Chưa xây cơ chế tự động sinh nội dung bài Reading/Listening mỗi ngày; giáo viên tạo trước và lên lịch publish.

## 8. Bảo mật, chất lượng

- Argon2id, rate-limit login, CORS theo origin, Helmet, request size limit, DTO validation/whitelist/forbidNonWhitelisted, config env validation.
- Access JWT guard + Roles guard + ownership check trong service. Không đưa passwordHash, refresh token hash, đáp án trước PASS vào response.
- Refresh token rotation có revoke và logout; cookie HttpOnly Secure SameSite hoặc response token theo quyết định API rõ ràng, hướng dẫn CSRF/XSS cho frontend.
- Không hard-delete dữ liệu quan trọng có lịch sử; dùng status/archive. Validate unique email/code; idempotent transactional updates.
- Mongo transaction yêu cầu replica set; nêu setup dev trong README. Nếu chưa thể dùng transaction, không giả vờ atomic cross-collection.
- API integration test: student A không xem submission B; teacher A không sửa course B; điểm 69% fail và 70% pass; chưa PASS không lộ key; duyệt gia hạn update deadline; duplicate penalty job chỉ +1; submit lúc sát deadline; refresh token bị revoke.

## 9. Thứ tự triển khai (bắt buộc)

**Phase 0 — Foundation:** scaffold NestJS, config, Mongo connection, Redis config, Swagger, lint/test/build scripts, Docker compose, README, env, health.

**Phase 1 — Database:** 16 schemas + enums, indexes, relations, DTO serialization, seed initial admin & sample teacher/student, docs DB.

**Phase 2 — Auth + Users:** JWT access/refresh, Argon2, RBAC, user/profile CRUD scoped, tests unit/e2e.

**Phase 3 — Courses + Lessons:** course CRUD, enrollment, ownership, calendar, Google Meet URL, tests.

**Phase 4 — Exercises + Assignments + Submission:** question schema flexible, sanitization answers, publish & assign, per-student assignments, grading >=70, multiple attempts, translations, tests.

**Phase 5 — Extensions + Penalties + Notifications:** quota, review, Redis BullMQ workers, deadline jobs, email SMTP, audit, tests; Docker CI, OpenAPI review.

Tại mỗi phase:
- Tạo code chạy được, cập nhật `docs/IMPLEMENTATION_STATUS.md` với TODO/Done/Blocked.
- Chạy `npm run build`, `npm test`, e2e nếu môi trường sẵn sàng; sửa lỗi phát hiện được.
- Nêu ngắn gọn files tạo/sửa, endpoints hoạt động, lệnh chạy, điểm chưa xác nhận.
- Không chạm vào Frontend.

## 10. Nhiệm vụ NGAY BÂY GIỜ

**Hãy bắt đầu thực thi Phase 0, 1, 2 trong workspace hiện tại**. Không chỉ đề xuất kế hoạch. Tạo thật code và file cần thiết; nếu một phase lớn quá, hoàn tất substep với build/test trước khi mở rộng. Sau đó xuất:

1. Cây thư mục các file đã tạo.
2. Danh sách API triển khai ở Phase 2.
3. Các lệnh khởi động bằng PowerShell và Docker.
4. Kết quả kiểm tra thực tế, blocker nếu có.
5. Phase 3 kế tiếp với nhiệm vụ cụ thể.

Duy trì tài liệu này như single source of truth cho Backend IELTS LMS, không tự ý thay stack.
