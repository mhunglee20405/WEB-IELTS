# BÁO CÁO TRIỂN KHAI BACKEND PHASE 10: DAILY ASSIGNMENT SCHEDULING & TEACHER-CONFIGURABLE IELTS ASSIGNMENTS

**Dự án:** IELTS Learning Management System (LMS) Backend  
**Thư mục làm việc:** `D:\WEB-IELTS`  
**Ngày hoàn thành:** 14/11/2026  
**Kiến trúc sư / Kỹ sư triển khai:** Senior Backend Architect  
**Tài liệu quy chuẩn:** `docs/EXAM_MODES_API_CONTRACT_V2.md`, `docs/FRONTEND_API_CONTRACT.md`, `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`

---

## 1. TỔNG QUAN VÀ MỤC TIÊU PHASE 10

Phase 10 nâng cấp và chuẩn hóa toàn diện nghiệp vụ giao bài tập hằng ngày và cơ chế cấu hình bài tập IELTS linh hoạt của giáo viên, kế thừa toàn vẹn nền tảng ngân hàng đề thi Phase 9 và các quy chuẩn bảo mật Phase 0–8:
1. **Khung giờ giao bài tập hằng ngày cố định (Fixed Daily Assignment Window):**
   - Múi giờ chuẩn: `Asia/Ho_Chi_Minh` (+07:00).
   - Khung giờ: từ đúng `06:00:00` ngày giao (`assignedDate`) đến đúng `06:00:00` ngày hôm sau (khoảng thời gian hiệu lực `[availableAt, dueAt)`).
   - Thẩm quyền thời gian thuộc về server (Server Time Authority), lưu trữ chuẩn UTC Date trong MongoDB.
2. **Mô hình vòng đời trạng thái hai tầng (Dual-Track Status Lifecycle):**
   - Database schema duy trì các enum chữ thường (`draft`, `scheduled`, `published`, `closed`) để tương thích ngược 100%.
   - API serializer tính toán động và trả về các trạng thái chữ hoa chuẩn hóa: `DRAFT`, `SCHEDULED`, `AVAILABLE`, `EXPIRED`, `COMPLETED`.
3. **Bảo mật tuyệt đối nội dung bài tập lên lịch trước (Advance Scheduling & Zero-Leakage):**
   - Khi bài tập ở trạng thái `SCHEDULED` (`now < availableAt`), học viên xem danh sách (`/assignments/mine`) chỉ thấy metadata và thời gian đếm ngược (`remainingSeconds`, `isAvailable: false`).
   - Khi học viên truy vấn chi tiết (`GET /assignments/:id`), hệ thống bóc tách 100% `passage`, `questions`, `audioAssets`.
   - Bắt đầu làm bài trước `openAt` bị từ chối nghiêm ngặt với mã lỗi HTTP 403 `ASSIGNMENT_NOT_YET_AVAILABLE`.
4. **Cấu hình bài tập IELTS linh hoạt (Teacher-Configurable IELTS Assignments):**
   - Hỗ trợ chọn đề thi từ ngân hàng đề thi IELTS Phase 9 (`ExamTest`) hoặc bài tập kế thừa (`Exercise`).
   - Hỗ trợ phạm vi thi `requiredScope` (`PART` hoặc `FULL`), chọn part cụ thể `requiredPartId`.
   - Hỗ trợ lọc nhóm câu hỏi cụ thể (`selectedQuestionGroupIds`) và tự biên soạn nhóm câu hỏi trực tiếp (`customQuestionGroups`) với 14 loại câu hỏi chuẩn IELTS `ExamQuestionType`.
   - Ghi đè thời lượng làm bài (`durationSecondsOverride`) và điểm mục tiêu khóa học (`targetScorePercent`, mặc định 70%).
5. **Ràng buộc thời gian làm bài theo deadline bài tập (Deadline-Capped Attempt Timer):**
   - Phiên làm bài tự động giới hạn: `expiresAt = min(startedAt + duration, effectiveDeadlineAt)`.
6. **Tách rời điểm mục tiêu bài tập khỏi ngưỡng mở khóa dịch bài đọc (Decoupled Target Score vs. 70% Unlock):**
   - Đạt điểm mục tiêu do giáo viên cấu hình (`targetScorePercent`) giúp đạt trạng thái `isTargetAchieved = true`.
   - Ngưỡng mở khóa dịch bài đọc Reading duy trì bất biến tại 70% không làm tròn (unrounded threshold).
7. **Các endpoint xác thực và xem trước:**
   - `POST /api/v1/assignments/validate`: Kiểm tra cấu hình và trả về danh sách lỗi cụ thể (HTTP 200 `{ valid, errors }`).
   - `POST /api/v1/assignments/preview`: Xem trước nội dung bài tập, câu hỏi, tổng điểm, số học viên ghi danh mà không ghi vào DB.
   - `GET /api/v1/assignments/:id/preview`: Xem trước toàn diện bài tập đã tạo dành cho giáo viên/admin.

---

## 2. CHI TIẾT TRIỂN KHAI VÀ THAY ĐỔI MÃ NGUỒN

### 2.1 Tiện ích múi giờ (`src/common/utils/timezone.util.ts`)
- Thêm hàm `createVnDailyAssignmentBounds(targetDate)`:
  - Phân tích ngày `YYYY-MM-DD` theo múi giờ `Asia/Ho_Chi_Minh` (+07:00).
  - Tính toán `openAtUtcMs = Date.UTC(y, m-1, d, 6, 0, 0, 0) - 7h`.
  - Tính toán `deadlineAtUtcMs = openAtUtcMs + 24 * 3600 * 1000`.
  - Trả về `{ availableAt, dueAt, openAt, deadlineAt, assignedDate }`.
- Bảo lưu hàm `createVnDailyBounds(targetDate)` (từ `00:00:00` đến `23:59:59.999`) bảo đảm tương thích ngược tuyệt đối với Phase 4-8.

### 2.2 Schemas & Database Models
- `Assignment`:
  - Thêm trường `assignedDate: string` (`YYYY-MM-DD`).
  - Thêm trường `selectedQuestionGroupIds: string[]`.
  - Thêm trường `targetScorePercent: number` (mặc định 70).
  - Thêm trường `idempotencyKey: string` với sparse index.
- `StudentAssignment`:
  - Thêm trường `assignedDate: string`.
  - Thêm trường `targetScorePercent: number`.
  - Thêm trường `isTargetAchieved: boolean` (mặc định false).
- `enums.ts`:
  - Bổ sung các trạng thái vòng đời `AssignmentStatus.SCHEDULED`, `AVAILABLE`, `EXPIRED`, `COMPLETED`.

### 2.3 Assignments Module (`src/modules/assignments/`)
- `assignments.controller.ts`:
  - `POST /assignments/validate` (với `@HttpCode(HttpStatus.OK)`).
  - `POST /assignments/preview` (với `@HttpCode(HttpStatus.OK)`).
  - `GET /assignments/:id/preview`.
- `assignments.service.ts`:
  - Hàm `validateAssignment`: kiểm tra giáo viên, trạng thái khóa học, đề thi xuất bản, phạm vi hợp lệ, nhóm câu hỏi tồn tại, không trùng lặp số câu hỏi, thời lượng > 0, điểm mục tiêu 0..100, định dạng ngày `YYYY-MM-DD`.
  - Hàm `previewAssignment`: tính toán thời lượng, bóc tách đoạn văn, tổng hợp câu hỏi xem trước và đếm số lượng học viên đang ghi danh (`ACTIVE`).
  - Hàm `previewById`: cho phép giáo viên phụ trách hoặc admin xem trước đầy đủ nội dung bài tập đã giao.
  - Hàm `create`:
    - Hỗ trợ client idempotency qua `dto.idempotencyKey`.
    - Kiểm tra trùng lặp tự nhiên theo `(courseId, exerciseId, openAt)`.
    - Hỗ trợ snapshot từ nhóm câu hỏi được chọn `selectedQuestionGroupIds` hoặc câu hỏi tự biên soạn `customQuestionGroups`.
    - Phân định trạng thái ban đầu: `DRAFT` nếu hành động là draft; `SCHEDULED` nếu là bài tập tương lai; `PUBLISHED` nếu mở ngay.
  - Hàm `formatAssignmentForStudent` & `computeStudentAssignmentLifecycleStatus`:
    - Áp dụng Zero-Leakage: bóc tách 100% `passage`, `questions` khi bài tập ở trạng thái `SCHEDULED` (`isLocked`).
    - Trả về `scheduleStatus`, `isAvailable`, `remainingSeconds`, `isTargetAchieved`.

### 2.4 Exam Attempts Module (`src/modules/exam-attempts/`)
- `exam-attempts.service.ts`:
  - Tự động phân giải `testId` từ `dto.assignmentId` hoặc `dto.studentAssignmentId` nếu học viên không truyền trực tiếp `testId`.
  - Kiểm tra mở bài tập: Nếu bài tập liên kết có `now < openAt` hoặc trạng thái `SCHEDULED`, trả về HTTP 403 `ASSIGNMENT_NOT_YET_AVAILABLE`.
  - Ràng buộc thời gian hết hạn phiên làm bài:
    `expiresAt = min(startedAt + duration, effectiveDeadlineAt)`.
  - Tích hợp liên kết `assignmentId` và `studentAssignmentId` vào phiên làm bài.

### 2.5 Global Exception Filter (`src/common/filters/global-exception.filter.ts`)
- Bảo lưu trường `code` (ví dụ: `ASSIGNMENT_NOT_YET_AVAILABLE`, `ASSIGNMENT_VALIDATION_FAILED`) và mảng `errors` từ exception response để client dễ dàng nhận diện lỗi theo hợp đồng API.

---

## 3. KẾT QUẢ KIỂM THỬ VÀ XÁC MINH TOÀN DIỆN

### 3.1 Unit Tests (19/19 Test Suites PASS)
- Tổng số: **135/135 tests PASS** (thời gian chạy ~25 giây).
- Bao phủ toàn diện: `users`, `courses`, `exercises`, `mail`, `reading-translations`, `translations`, `exam-tests`, `submissions`, `assignments` (12/12 tests PASS), `auth`, `exam-attempts`, `audit`, `notifications`, `jobs`, `lessons`, `deadlines`, `penalties`, `extensions`, `enrollments`.

### 3.2 Real MongoDB Replica Set & Redis E2E Tests (10/10 Test Suites PASS)
Toàn bộ **138/138 E2E tests** chạy trên môi trường Docker thực tế (`ielts-lms-mongo` replica set `rs0` và `ielts-lms-redis`) đạt kết quả 100% PASS:

| Test Suite | Số ca kiểm thử | Kết quả | Ghi chú |
|------------|:--------------:|:-------:|---------|
| `test/phase10.e2e-spec.ts` | 14/14 | ✅ PASS | Validation, Preview, 06:00 VN bounds, Zero-leakage scheduled, 403 start block, Question filtering, Idempotency, Deadline-capped timer, Decoupled 70% unlock |
| `test/phase4.e2e-spec.ts` | 18/18 | ✅ PASS | Exercise Bank, Assignment creation, Roster tracking, Backfill, Zero-leakage answer hiding |
| `test/phase5.e2e-spec.ts` | 13/13 | ✅ PASS | Submissions, Auto-grading, Retake limit, Translation submission & review |
| `test/phase6.e2e-spec.ts` | 16/16 | ✅ PASS | Deadlines, Extension requests, Overdue penalties, Ledgers, Compensating reversals |
| `test/phase7.e2e-spec.ts` | 10/10 | ✅ PASS | Redis BullMQ, Background workers, In-app notifications, Audit logs |
| `test/phase8.e2e-spec.ts` | 19/19 | ✅ PASS | Health probes (live/ready/memory), Correlation ID, Redis token rotation & replay attack protection, RBAC |
| `test/phase9.e2e-spec.ts` | 18/18 | ✅ PASS | Exam Tests, PART/FULL modes, 14 question types auto-grading, Reading translation unlock threshold |
| `test/phase3-real-mongo.e2e-spec.ts` | 12/12 | ✅ PASS | Courses, Enrollments, Lessons trên Replica Set thực tế |
| `test/phase3.e2e-spec.ts` | 15/15 | ✅ PASS | Courses, Enrollments, Lessons API contract |
| `test/auth.e2e-spec.ts` | 3/3 | ✅ PASS | JWT authentication, Liveness regression test |
| **TỔNG CỘNG** | **138/138** | ✅ **PASS** | **10/10 Suites đạt 100% PASS** |

### 3.3 TypeScript & Build
- `npx tsc --noEmit`: **0 errors**
- `npm run build`: **PASS** (Nest build hoàn tất sạch sẽ)
- `npm run export:openapi`: **PASS** (Xuất thành công `docs/openapi.json`)

---

## 4. KẾT LUẬN VÀ TRẠNG THÁI DỰ ÁN

Phase 10 đã được triển khai hoàn chỉnh, đáp ứng chính xác 100% các yêu cầu kỹ thuật và nghiệp vụ, đồng thời duy trì sự ổn định và tương thích ngược tuyệt đối với toàn bộ các tính năng từ Phase 0 đến Phase 9.
Mã nguồn sẵn sàng tích hợp với ứng dụng Frontend Next.js.

