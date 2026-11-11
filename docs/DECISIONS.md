# DECISIONS.md — Quyết định kiến trúc và Business Rule

Tài liệu này ghi lại các quyết định thiết kế và business rule **provisional** (cần Product Owner xác nhận).

---

## PROVISIONAL Decisions (cần PO xác nhận)

### P1 — Trạng thái bài đã nộp nhưng chưa PASS trước deadline

**Quyết định:** Bài đã submit nhưng chưa đạt PASS (< 70%) trước deadline được tính là **chưa hoàn thành**
và có thể bị overdue + phạt điểm.

**Lý do:** Mục tiêu học tập yêu cầu đạt ngưỡng PASS. Submit không đồng nghĩa với hoàn thành.

**Cần PO xác nhận:** Có trường hợp ngoại lệ cho bài cuối cùng (hết lượt retry) không?

---

### P2 — Cho phép retake

**Quyết định:** Cho phép retake nếu `assignment.allowRetake = true` VÀ chưa vượt `maxAttempts`.
Không trả đáp án trước PASS, dù đã retry nhiều lần.

**Cần PO xác nhận:** Sau khi hết `maxAttempts` nhưng chưa PASS, hệ thống xử lý thế nào?

---

### P3 — Đếm yêu cầu gia hạn

**Quyết định:** Đếm **số yêu cầu được gửi** (bao gồm bị từ chối), không phải số được phê duyệt.
Quota 3 lần/tháng tính theo tháng lịch `Asia/Ho_Chi_Minh`.

**Cần PO xác nhận:** Nếu bị từ chối, học viên có được gửi lại (tiêu hao quota) không?

---

### P4 — Translation review

**Quyết định:** Bản dịch Reading được nộp thủ công, giáo viên đánh giá thủ công.
Chưa tích hợp AI auto-grade.

**Extension point:** `TranslationSubmission.status` có thể thêm state `ai_reviewed` trong tương lai.

---

### P5 — Phân phối assignment cho học viên

**Quyết định:** Assignment được tạo bản ghi `student_assignments` cho các học viên `active` tại thời điểm
assignment được publish. Ghi danh muộn cần API/backfill thủ công có kiểm soát, không tự động.

**Cần PO xác nhận:** SLA backfill cho ghi danh muộn?

---

### P6 — Tạo nội dung bài học

**Quyết định:** Giáo viên tạo exercise thủ công trước, lên lịch publish.
Chưa có tính năng tự động sinh nội dung Reading/Listening hàng ngày.

---

## Kiến trúc — Các quyết định kỹ thuật

### A1 — Refresh Token Store

**Hiện tại (MVP):** In-memory Map trong `AuthService`. Mất khi restart.

**Production:** Chuyển sang Redis với TTL hoặc collection `refresh_sessions` trong MongoDB.
Mỗi token thuộc một "family" để hỗ trợ rotation và revoke toàn bộ session.

**TODO Phase 2+:** Implement Redis-backed refresh token store.

---

### A2 — MongoDB Transaction

**Yêu cầu:** Replica Set. Dev local xem README để setup.

**Hiện tại:** Chưa sử dụng transaction ở Phase 0-2. Phase 5 sẽ implement transaction
cho extension request quota check và penalty deduplication.

**Risk:** Nếu chạy standalone MongoDB (không replica set), transaction sẽ fail.
Ghi rõ trong README.

---

### A3 — Answer Key Protection

**Quyết định:** `answerSpecification` trong Exercise schema dùng `select: false`,
nhưng cũng **bắt buộc** có response mapper riêng (ExerciseSanitizedDto) vì
`select: false` không bảo vệ nested subdocuments khi populate/lean.

**Implementation:** `ExercisesService` luôn dùng `sanitizeForStudent()` khi trả
exercise cho student, loại bỏ toàn bộ `answerSpecification` và `explanation`.

---

### A4 — Penalty Idempotency

**Quyết định:** Mỗi penalty transaction có `idempotencyKey` = `penalty:{studentAssignmentId}:{date}`.
BullMQ job retry an toàn vì MongoDB unique index trên `idempotencyKey` chống duplicate insert.

---

### A5 — Extension Quota Race Condition

**Quyết định:** Dùng MongoDB transaction (Phase 5):
1. Count extension requests của student trong tháng hiện tại (Asia/Ho_Chi_Minh).
2. Nếu < 3, insert mới trong cùng transaction.
3. Partial unique index ngăn 2 pending cùng lúc cho 1 student_assignment.

Không dùng `countDocuments` + insert riêng lẻ (race condition).

---

### A6 — Exercise Immutability via Snapshotting

**Quyết định:** Khi tạo bài tập (`Assignment`), hệ thống chụp một bản snapshot bất biến (`exerciseSnapshot`) bao gồm toàn bộ nội dung bài đọc, file nghe, câu hỏi, điểm và version của bài tập tại thời điểm giao.
- Nếu giáo viên cập nhật bài tập đã `PUBLISHED` trong Exercise Bank, hệ thống tự động tăng `version` (`version = version + 1`).
- Các `assignments` đã tạo sử dụng snapshot để đảm bảo tính xác định (deterministic grading), không bị ảnh hưởng bởi những thay đổi tiếp theo trong Exercise Bank.

---

### A7 — Late-Enrollment Backfill Policy

**Quyết định:** Khi một bài tập được publish, `student_assignments` được tạo tự động cho tất cả học viên có trạng thái `ACTIVE` trong khóa học.
- Học viên ghi danh sau khi bài tập đã publish sẽ không tự động bị áp đặt bài tập cũ nhằm tránh quá hạn đột ngột.
- Giáo viên/Admin có thể gọi endpoint `POST /api/v1/assignments/:id/backfill-students` để bổ sung bài tập cho học viên mới một cách an toàn và idempotent (nhờ compound unique index `{ assignmentId: 1, studentId: 1 }`).

---

### A8 — Zero-Leakage Answer Protection

**Quyết định:** Tuyệt đối không để lộ đáp án (`answerSpecification`) và giải thích (`explanation`) cho học viên trước khi hoàn thành điều kiện mở khóa.
- Học viên bị chặn 403 khi gọi `GET /exercises` (không được duyệt ngân hàng đề).
- Khi học viên gọi `GET /exercises/:id` hoặc `GET /assignments/:id`, dữ liệu bài tập bắt buộc chạy qua `ExerciseMapper.toSanitized`, loại bỏ triệt để trường `answerSpecification` và `explanation`.
- Chỉ Admin và Giáo viên phụ trách khóa học mới nhận được toàn bộ đáp án và snapshot gốc.

---

---

### A9 — Server-Side Auto-Grading & Strict Unrounded Pass Comparison

**Quyết định:** Chấm điểm hoàn toàn tự động ở phía server dựa trên snapshot bất biến (`assignment.exerciseSnapshot`).
- Tuyệt đối không tin cậy điểm số hay kết quả do client gửi.
- Công thức: `rawScorePercent = earnedPoints / totalPossiblePoints * 100`.
- So sánh điều kiện PASS (`isPassed = rawScorePercent >= passScore`) thực hiện trên số thực nguyên bản chưa làm tròn. Đúng 70.0% là PASS, điểm 69.999% là NOT PASS.
- Điểm hiển thị được làm tròn 2 chữ số thập phân.

---

### A10 — Dedicated Authorized Endpoint for Answer Unlocking

**Quyết định:** Tuyệt đối không đính kèm đáp án đúng (`correctKey`, `acceptedAnswers`) và giải thích (`explanation`) vào phản hồi nộp bài (`POST /submissions`) hay chi tiết bài tập (`GET /assignments/:id`).
- Để xem đáp án, học viên phải gọi endpoint riêng biệt `GET /api/v1/assignments/:id/answers`.
- Endpoint này kiểm tra điều kiện tiên quyết ở server-side: học viên phải có bài nộp đạt `isPassed === true` (hoặc `studentAssignment.status === 'passed'`). Nếu chưa đạt PASS, hệ thống từ chối `403 Forbidden`.

---

### A11 — Concurrency & Atomic Progress via MongoDB Transactions

**Quyết định:** Quá trình lưu lượt nộp (`submissions`) và cập nhật tiến độ học viên (`student_assignments`) được thực thi bên trong một MongoDB Session / Transaction.
- Compound unique index `{ studentAssignmentId: 1, attemptNo: 1 }` chống trùng lặp lượt nộp khi client bấm nhiều lần hoặc retry do mạng chập chờn.
- Xung đột đồng thời được chuyển hóa thành mã lỗi `409 Conflict`.

---

### A12 — Reading Translation Manual Review

**Quyết định:** Bản dịch tiếng Việt cho bài đọc Reading được nộp qua `POST /api/v1/assignments/:id/translations` và được giáo viên phụ trách khóa học đánh giá, nhận xét thủ công qua `PATCH /api/v1/translations/:id/review`.
- Không sử dụng chấm điểm tự động bằng AI (tuân thủ mục tiêu sư phạm của IELTS LMS).

---

### A13 — Quota 3 Extension Requests per Month in Vietnam Timezone

**Quyết định:** Giới hạn mỗi học viên tối đa 3 lần gửi yêu cầu xin gia hạn (`ExtensionRequest`) trong một tháng dương lịch theo múi giờ `Asia/Ho_Chi_Minh` (`createVnMonthBounds`).
- Đếm tất cả yêu cầu học viên đã tạo trong tháng (`createdAt` nằm trong khoảng đầu tháng `00:00:00.000` đến cuối tháng `23:59:59.999` giờ Việt Nam).
- Mọi đơn xin đã gửi đều được tính vào hạn mức nhằm chống việc gửi rồi rút liên tục để lách luật.
- Áp dụng partial unique index `{ studentAssignmentId: 1, status: 1 }` với điều kiện `{ status: 'pending' }` để chống gửi 2 đơn đang chờ duyệt cùng lúc cho một bài tập (trả về `409 Conflict`).

---

### A14 — Idempotent Overdue Assignment Processing & Deterministic Penalty Ledger

**Quyết định:** Quá trình quét và đánh dấu bài tập quá hạn (`DeadlinesService.processOverdueAssignments`) hoạt động hoàn toàn idempotent dựa trên cơ chế sổ cái giao dịch phạt (`penalty_transactions`).
- Điều kiện quá hạn tập trung: `studentAssignment.effectiveDeadlineAt <= now` và chưa `PASSED`, `EXCUSED` hay `OVERDUE`.
- Khi quá hạn, hệ thống chuyển trạng thái sang `OVERDUE` và ghi nhận một bản ghi phạt tăng `+1 point` với khóa đơn nhất xác định `idempotencyKey = penalty:${studentAssignment._id}:${effectiveDeadlineAt.toISOString()}`.
- Cơ chế `idempotencyKey` với MongoDB Unique Index đảm bảo bộ quét có thể chạy định kỳ nhiều lần hoặc retry mà không bao giờ bị cộng điểm phạt trùng lặp.

---

### A15 — Compensating Ledger Transactions for Penalty Reversals

**Quyết định:** Tuyệt đối không xóa cứng (hard-delete) giao dịch phạt khi giáo viên/admin hủy phạt cho học viên.
- Thực thi theo mô hình Sổ cái kế toán bất biến (Immutable Ledger): khi hủy phạt qua `POST /api/v1/penalties/:id/reverse`, hệ thống sinh một giao dịch bù trừ (compensating transaction) với `deltaPoints: -1`, tham chiếu `reversedTransactionId: original._id`, kèm lý do giải trình bắt buộc (`reason`) và `createdBy`.
- `StudentProfile.penaltyPointsCache` được cập nhật đồng bộ qua toán tử nguyên tử `$inc: { penaltyPointsCache: -1 }`.
- Giao dịch gốc được gắn cờ `isReversed = true` để ngăn chặn việc hoàn phạt trùng lặp (`400 Bad Request`).

---

### A16 — Effective Deadline Decoupling & Status Restoration on Late Approval

**Quyết định:** Mỗi học viên sở hữu hạn nộp hiệu lực riêng biệt (`effectiveDeadlineAt`) trên từng `student_assignments`.
- Việc xin gia hạn và duyệt gia hạn được áp dụng độc lập cho từng học viên mà không làm thay đổi hạn nộp gốc (`deadlineAt`) của cả khóa học.
- Nếu giáo viên phê duyệt yêu cầu gia hạn cho một bài tập đang bị `OVERDUE`, hệ thống tự động cập nhật `effectiveDeadlineAt = requestedDeadlineAt` và khôi phục trạng thái về `NOT_STARTED` (hoặc `SUBMITTED` nếu đã từng nộp bài), cho phép học viên tiếp tục làm bài mà không bị khóa.

---

### A17 — Pure Penalty Points Model (Removal of Provisional Monetary Conversions)

**Quyết định:** Hệ thống chỉ quản lý và tính toán điểm phạt nguyên dương thuần túy (`deltaPoints: 1`).
- Xóa bỏ giả định provisional `1 điểm = 100,000 VND` và trường `totalVnd` trong phản hồi API.
- Sổ cái `penalty_transactions` và bộ đệm `StudentProfile.penaltyPointsCache` lưu trữ số điểm nguyên vẹn, bảo toàn toàn bộ lịch sử điểm số mà không kèm quy đổi tài chính.

---

### A18 — Overdue Penalty Idempotency Scoping Against Changed Deadlines

**Quyết định:** Chuẩn hóa khóa xác định điểm phạt quá hạn thành `idempotencyKey = penalty:overdue:${studentAssignment._id}` và bổ sung kiểm tra giao dịch dương `{ studentAssignmentId: sa._id, deltaPoints: { $gt: 0 } }`.
- Ngăn chặn triệt để tình trạng một bài tập bị phạt 2 lần nếu `effectiveDeadlineAt` thay đổi (do giáo viên sửa deadline hoặc gia hạn trễ).
- Một bài tập của học viên chỉ có thể phát sinh tối đa 1 bản ghi phạt quá hạn trong toàn bộ vòng đời.

---

### A19 — Automatic Compensating Penalty Reversal upon Approved Extension

**Quyết định:** Khi giáo viên phê duyệt gia hạn (`ExtensionRequestStatus.APPROVED`) cho bài tập đang bị `OVERDUE`:
- Hệ thống tự động tạo giao dịch bù trừ (compensating transaction) với `deltaPoints: -1` và `reversedTransactionId` trỏ đến giao dịch phạt gốc.
- Đánh dấu `isReversed = true` trên giao dịch gốc và giảm điểm bộ đệm `StudentProfile.penaltyPointsCache` qua `$inc: { penaltyPointsCache: -1 }`.
- Khôi phục trạng thái `student_assignments.status` về `NOT_STARTED` (hoặc `SUBMITTED`), đảm bảo công bằng cho học viên.

---

### A20 — Strict Extension Quota Serialization via StudentProfile Document Lock

**Quyết định:** Khắc phục triệt để race condition khi học viên gửi nhiều yêu cầu gia hạn đồng thời.
- Bên trong transaction của `create`, hệ thống thực hiện cập nhật ghi vết `StudentProfile.updateOne` trên document của học viên.
- Khóa tài liệu (document write lock) của MongoDB buộc các transaction đồng thời của cùng học viên phải xếp hàng tuần tự. Transaction thứ hai chỉ được thực hiện sau khi transaction đầu tiên đã commit, do đó thấy được số lượng yêu cầu cập nhật và chặn vượt hạn ngạch 3 lần/tháng.

---

### A21 — Asynchronous Processing via BullMQ with Deterministic Job IDs

**Quyết định:** Tách biệt hoàn toàn luồng API người dùng khỏi các tác vụ nền nặng (gửi email, quét deadline) bằng cách sử dụng BullMQ và Redis.
- Queue `email-delivery` xử lý gửi email bất đồng bộ với cơ chế retry tối đa 3 lần kèm exponential backoff (`delay: 1000ms`).
- Khóa định danh công việc xác định `jobId = email-${notification._id}` (dùng gạch nối `-`, không dùng `:` để tránh xung đột namespace Redis của BullMQ) kết hợp bảng `email_deliveries` để đảm bảo chống gửi email trùng lặp tuyệt đối.
- Giữ lại 100 jobs thành công và 500 jobs thất bại gần nhất phục vụ việc kiểm tra và khắc phục sự cố.

---

### A22 — Automatic Credential & Answer Key Redaction in Audit Logging

**Quyết định:** Tất cả các hành động ghi nhật ký hệ thống qua `AuditService.log()` đều tự động chạy qua bộ lọc đệ quy `sanitizeObject`.
- Tự động thay thế bằng `[REDACTED]` đối với mọi trường nhạy cảm không phân biệt chữ hoa/thường: `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `secret`, `answerSpecification`, `correctKey`, `acceptedAnswers`.
- Đảm bảo tuyệt đối không rò rỉ thông tin đăng nhập hoặc đáp án bài thi vào collection `audit_logs`.

---

### A23 — Redis-Backed Refresh Token Store with Atomic Rotation & Replay Protection

**Quyết định:** Thay thế toàn bộ Map lưu trữ refresh token tạm thời trong RAM bằng kho lưu trữ Redis TTL có cấu trúc:
- Key định dạng `auth:refresh:${tokenId}`, payload JSON chứa `{ userId, tokenHash, family }`.
- Thời gian tồn tại (TTL) cấu hình theo `jwt.refreshExpiresIn` (mặc định 7 ngày).
- Cơ chế xoay vòng nguyên tử (Atomic Token Rotation): sử dụng Redis Lua script thực hiện lệnh `GET` và `DEL` trong cùng 1 transaction nguyên tử tại Redis.
- Bất kỳ hành vi gửi lại (replay attack) token đã xoay vòng hoặc token bị thu hồi đều lập tức nhận phản hồi `401 Unauthorized`.
- Hỗ trợ fallback sang bộ nhớ đệm nội bộ kèm kiểm tra timestamp hết hạn phục vụ unit test độc lập không cần Redis.

---

### A24 — Request Correlation ID Tracking across Middleware & Exception Filter

**Quyết định:** Mọi yêu cầu HTTP gửi đến hệ thống đều được cấp mã định danh duy nhất (UUIDv4) hoặc kế thừa từ header `X-Correlation-Id` / `X-Request-Id`.
- Middleware `CorrelationIdMiddleware` tự động gắn `X-Correlation-Id` vào response header.
- `GlobalExceptionFilter` tự động trích xuất mã này và đính kèm vào payload phản hồi lỗi của người dùng, đồng thời ghi log chi tiết mã định danh này cùng stack trace giúp đội vận hành dễ dàng tra cứu truy vết.
- Trong môi trường `production`, lỗi 500 được chuẩn hóa thành message an toàn "Internal server error" để không làm lộ cấu trúc cơ sở dữ liệu.

---

### A25 — Controlled Database Indexing Migration Script (`npm run init:indexes`)

**Quyết định:** Tách biệt hoàn toàn việc tạo và đồng bộ index MongoDB khỏi quá trình khởi động ứng dụng trong môi trường production.
- Trong `DatabaseModule`, khi `NODE_ENV === 'production'`, hệ thống bỏ qua việc tự động chạy `model.createIndexes()` trên bootstrap để tránh gây nghẽn collection hoặc lock tài nguyên khi scale nhiều container.
- Cung cấp script chuyên dụng `src/database/scripts/init-indexes.ts` chạy qua `npm run init:indexes` để đồng bộ chỉ mục có kiểm soát cho toàn bộ 16 collection trước khi mở luồng tải.

---

### A26 — Durable Transactional Outbox Pattern for Background Email Delivery

**Quyết định:** Đảm bảo tính bền vững của các thông báo và email mà không làm đứt gãy luồng xử lý chính trong MongoDB nếu Redis hoặc SMTP gặp sự cố.
- Mọi email thông báo được lưu trữ bền vững trước hết vào collection `email_deliveries` ở trạng thái `QUEUED` với khóa xác thực `idempotencyKey`.
- Bên cạnh việc đẩy vào BullMQ queue `email-delivery` ngay khi phát sinh, hệ thống tích hợp cơ chế Outbox Sweeper định kỳ trong `DeadlineProcessor` để quét các bản ghi `QUEUED` quá 5 giây và đẩy lại vào hàng đợi.
- Đảm bảo 100% giao dịch kinh doanh thành công không bị rollback do lỗi kết nối SMTP/Redis.

---

### A27 — Multi-Probe Observability with MongoDB & Redis Health Indicators

**Quyết định:** Mở rộng module sức khỏe hệ thống (`HealthModule`) phục vụ điều phối vùng chứa (Kubernetes / Docker Swarm):
- Endpoint Liveness (`/health/live`): kiểm tra độ phản hồi của process và bộ nhớ heap Node.js theo ngưỡng cấu hình (`health.heapThresholdMb`, mặc định 768MB).
- Endpoint Readiness (`/health/ready`): kiểm tra trực tiếp trạng thái kết nối tới cả MongoDB Replica Set và Redis Server, trả về mã 200 OK khi cả hai sẵn sàng và 503 Service Unavailable khi một trong hai gặp sự cố.

---

## Thay đổi lịch sử

| Ngày       | Quyết định | Người quyết định |
|------------|------------|-----------------|
| 2026-11-11 | Khởi tạo tài liệu, Phase 0-2 | Backend Architect |
| 2026-11-12 | Phase 3: Course, Enrollment, Lessons | Backend Architect |
| 2026-11-12 | Phase 4: A6 Immutability, A7 Backfill, A8 Zero-Leakage | Backend Architect |
| 2026-11-12 | Phase 5: A9 Auto-Grading, A10 Answer Unlocking, A11 Transactions, A12 Translation Review | Backend Architect |
| 2026-11-12 | Phase 6: A13 Quota VnMonth, A14 Idempotent Overdue & Ledger, A15 Compensating Reversal, A16 Effective Deadline Decoupling | Backend Architect |
| 2026-11-12 | Phase 7: A17 Pure Points, A18 Overdue Scoping, A19 Auto Reversal, A20 Quota Concurrency Lock, A21 BullMQ Async, A22 Audit Redaction | Backend Architect |
| 2026-11-12 | Phase 8: A23 Redis Refresh Store, A24 Correlation ID, A25 Controlled Indexing, A26 Transactional Outbox Sweeper, A27 Multi-Probe Readiness | Backend Architect |

