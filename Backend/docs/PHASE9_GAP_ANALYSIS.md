# PHASE 9 — GAP ANALYSIS & ARCHITECTURAL SPECIFICATION

## 1. Tổng quan & Mục tiêu

Phân tích đối chiếu giữa hiện trạng Backend IELTS LMS (Phase 0–8) và yêu cầu mới trong **API Contract v2.0** (`IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md`):
- Hệ thống thi thử IELTS mô phỏng trải nghiệm STUDY4/YouPass.
- Hỗ trợ chế độ thi `PART` (từng passage Reading / section Listening) và `FULL` (toàn bài thi).
- Ngân hàng đề thi cấu trúc hoá cho giáo viên (Parts: Passages/Sections, QuestionGroups, Questions, Server-side Grading).
- Mở khoá bài dịch Reading theo từng passage chỉ khi đạt ngưỡng PASS ≥ 70%.
- Tích hợp trơn tru với hệ thống bài tập (`assignments`), hạn nộp, gia hạn và tính điểm phạt hiện hành.

---

## 2. Phân tích Hiện trạng & Đối chiếu (Gap Analysis)

### 2.1. Tính năng đã có và có thể tái sử dụng (Reusable Components)
1. **Hệ thống xác thực & Phân quyền (Auth & RBAC):**
   - `AuthGuard('jwt')`, `RolesGuard`, `@Roles(...)`, `@CurrentUser()` hoạt động ổn định với 3 roles: `student`, `teacher`, `admin`.
   - Redis-backed refresh token rotation và cơ chế thu hồi tức thì tài khoản bị suspended.
2. **Logic chuẩn hoá văn bản & So khớp đáp án (Grading Engine):**
   - Hàm `normalizeText` (trim, khoảng trắng thu gọn, lowercase), `normalizeTFNG` (so khớp T/F/NG, Y/N/NG) trong `submissions.service.ts` tái sử dụng hoàn toàn cho các dạng câu hỏi IELTS tương ứng.
   - Ngưỡng PASS 70% unrounded (đúng từ 70.0% trở lên là PASS, 69.999% là FAIL).
3. **Quy tắc bảo vệ đáp án (Zero Leakage Policy):**
   - Không để lộ `answerSpecification`, `grading`, `explanation`, `transcript` cho học viên trước khi đạt điều kiện PASS.
4. **Hệ thống khóa học & Giao bài (Courses & Assignments):**
   - Quản lý khoá học, ghi danh, snapshot bất biến (`exerciseSnapshot`) khi publish bài tập.
   - Múi giờ chuẩn Việt Nam `Asia/Ho_Chi_Minh` cho việc tính toán hạn chót hàng ngày.
5. **Hạ tầng bất đồng bộ (Redis, BullMQ & Notifications):**
   - Các queue xử lý thông báo và email nền sẵn sàng kết nối.

### 2.2. Tính năng cần mở rộng (Requiring Extension)
1. **Module `assignments`:**
   - Mở rộng `CreateAssignmentDto` và schema `Assignment` để hỗ trợ:
     - `requiredScope`: `'PART' | 'FULL'` (mặc định `'FULL'`).
     - `requiredPartId`: `string` (ObjectId của passage/section nếu giao `PART`).
     - `allowedModes`: `['PART']`, `['FULL']`, hoặc `['PART', 'FULL']`.
     - `durationSecondsOverride`: số giây thời lượng ghi đè.
2. **Schema `translation_submissions`:**
   - Schema cũ chỉ có unique compound index `{ studentAssignmentId: 1 }` (1 bản dịch cho cả assignment).
   - Khi hỗ trợ FULL Reading (gồm 3 passages), học viên dịch từng passage độc lập. Cần bổ sung `passageId`, `exerciseVersion`, `examAttemptId`, `sourceAttemptId`.
   - Cập nhật index sang `{ studentAssignmentId: 1, passageId: 1 }` sparse để tương thích ngược 100% với các bài dịch Phase 5 cũ.
3. **Quy trình dịch Reading (`TranslationsService` & `ReadingTranslationsService`):**
   - Giữ nguyên các route cũ `/assignments/:id/translation*` cho bài tập truyền thống.
   - Bổ sung nhóm route theo hợp đồng v2: `/reading-translations/eligibility`, `/reading-translations/:passageId`, `/reading-translations/:passageId/draft`, `/reading-translations/:passageId/submit`, `/teacher/reading-translations`, `/teacher/reading-translations/:translationId/review`.

### 2.3. Schema & Collection mới cần bổ sung (Missing Schemas)
1. **`exam_tests` (`ExamTestSchema`):**
   - Lưu trữ đề thi cấu trúc hoá cho giáo viên và thư viện luyện thi.
   - Hỗ trợ các thuộc tính: `skill` (`READING` | `LISTENING`), `title`, `description`, `examPreset` (`IELTS_ACADEMIC` | `CUSTOM`), `allowedModes` (`PART`, `FULL`), `passScore` (mặc định 70), `fullDurationSeconds`, `translationEnabled`, `version`, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `createdBy`.
   - Cấu trúc cây phân cấp:
     - `parts[]`: `id`, `type` (`PASSAGE` | `SECTION`), `ordinal`, `title`, `contentHtml`, `audioAssetId`, `durationSeconds`, `questionGroupIds`.
     - `questionGroups[]`: `id`, `partId`, `title`, `instruction`, `type`, `order`, `questionIds`, `sharedOptions`, `maxWords`.
     - `questions[]`: `id`, `partId`, `groupId`, `number` (số thứ tự toàn bài 1..40), `prompt`, `type`, `points`, `options`, `grading` (`select: false` đối với học viên).
2. **`exam_attempts` (`ExamAttemptSchema`):**
   - Quản lý phiên làm bài trực tuyến có trạng thái của học viên.
   - Thuộc tính: `studentId`, `testId`, `exerciseVersion`, `assignmentId`, `studentAssignmentId`, `skill`, `mode` (`PART` | `FULL`), `partId` (nullable nếu FULL), `status` (`IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`, `EXPIRED`), `startedAt`, `expiresAt`, `submittedAt`, `lastSavedAt`, `answersRevision`, `scopeQuestionIds`, `savedAnswers` (Map/Object lưu cặp `questionId -> value`), `idempotencyKey`.

### 2.4. Endpoints mới cần triển khai (Missing Endpoints)

#### A. Student Exam Exploration & Practice (`/exam-tests`, `/exam-attempts`)
- `GET /api/v1/exam-tests`: Danh sách đề thi đã PUBLISHED dành cho học viên (không chứa grading/lời giải).
- `GET /api/v1/exam-tests/:testId`: Chi tiết đề thi, danh sách parts, allowedModes, tổng số câu.
- `GET /api/v1/exam-tests/:testId/parts/:partId`: Nội dung chi tiết của một Part (sanitized DTO không có đáp án).
- `POST /api/v1/exam-attempts`: Khởi tạo phiên làm bài (PART/FULL) có idempotencyKey, tính toán `expiresAt` từ server.
- `GET /api/v1/exam-attempts/:attemptId`: Lấy trạng thái phiên làm bài, câu trả lời đã lưu, `remainingSeconds`.
- `PUT /api/v1/exam-attempts/:attemptId/answers`: Autosave với cơ chế kiểm soát phiên bản `baseRevision` / `answersRevision`.
- `POST /api/v1/exam-attempts/:attemptId/submit`: Nộp bài và chấm điểm server-side độc lập.
- `GET /api/v1/exam-attempts/:attemptId/result`: Kết quả thi, điểm số %, PASS/FAIL, danh sách passage được mở khoá dịch.
- `GET /api/v1/exam-attempts/:attemptId/review`: Xem lại đáp án và lời giải (bảo vệ nghiêm ngặt: chỉ trả lời khi PASS >= 70%).

#### B. Reading Translation Unlock & Review (`/reading-translations`)
- `GET /api/v1/reading-translations/eligibility`: Kiểm tra tính khả dụng của bài dịch theo từng passage (LOCKED vs UNLOCKED).
- `GET /api/v1/reading-translations/:passageId`: Lấy nội dung gốc bài đọc, bản dịch nháp hiện tại, feedback giáo viên.
- `PUT /api/v1/reading-translations/:passageId/draft`: Lưu bản dịch nháp tiếng Việt (chỉ cho phép khi passage đã UNLOCKED).
- `POST /api/v1/reading-translations/:passageId/submit`: Nộp bản dịch tiếng Việt để giáo viên chấm.
- `GET /api/v1/teacher/reading-translations`: Giáo viên xem danh sách các bài dịch cần nhận xét.
- `POST /api/v1/teacher/reading-translations/:translationId/review`: Giáo viên đánh giá và nhận xét bản dịch.

#### C. Teacher Question Bank & Management (`/teacher/exam-tests`)
- `GET /api/v1/teacher/exam-tests`: Danh sách đề thi do giáo viên quản lý.
- `POST /api/v1/teacher/exam-tests`: Tạo đề thi nháp (DRAFT).
- `GET /api/v1/teacher/exam-tests/:testId`: Xem chi tiết đề thi đầy đủ (bao gồm đáp án và cấu hình chấm).
- `PATCH /api/v1/teacher/exam-tests/:testId`: Cập nhật cấu hình đề thi DRAFT.
- `POST /api/v1/teacher/exam-tests/:testId/parts`: Thêm Passage/Section.
- `PATCH /api/v1/teacher/exam-tests/:testId/parts/:partId`: Chỉnh sửa nội dung Passage/Section khi ở trạng thái DRAFT.
- `DELETE /api/v1/teacher/exam-tests/:testId/parts/:partId`: Xoá Passage/Section khi ở trạng thái DRAFT.
- `POST /api/v1/teacher/exam-tests/:testId/parts/:partId/question-groups`: Thêm nhóm câu hỏi và câu hỏi chi tiết.
- `PATCH /api/v1/teacher/exam-tests/:testId/question-groups/:groupId`: Sửa nhóm câu hỏi và đáp án khi DRAFT.
- `POST /api/v1/teacher/exam-tests/:testId/validate`: Kiểm tra tính hợp lệ trước khi xuất bản.
- `GET /api/v1/teacher/exam-tests/:testId/preview`: Xem trước đề thi dưới góc nhìn học viên.
- `POST /api/v1/teacher/exam-tests/:testId/publish`: Xuất bản đề thi (chuyển sang bản bất biến).
- `POST /api/v1/teacher/exam-tests/:testId/new-version`: Nhân bản đề thi đã xuất bản sang bản DRAFT mới.

#### D. Media & Audio Asset Management (`/media/audio`)
- `GET /api/v1/media/audio/:assetId/playback`: Cấp signed playback URL hoặc stream audio cho học viên/giáo viên hợp lệ.
- `POST /api/v1/media/audio/upload-intent`: Cấp signed upload URL cho giáo viên tải file audio nghe lên hệ thống.

---

## 3. Quy tắc Nghiệp vụ Bắt buộc Không Đổi (Immutable Business Rules)

1. **Ngưỡng PASS 70% không làm tròn:**
   - `earnedPoints / totalPoints >= 0.70` là PASSED.
   - `scorePercent` làm tròn chỉ dùng để hiển thị trên UI; phép so sánh logic PASS luôn dùng tỷ lệ gốc chưa làm tròn.
2. **Quy tắc mở khoá bài dịch Reading:**
   - **Reading PART PASS:** Chỉ mở bài dịch đúng passage đó. Không mở các passage còn lại.
   - **Reading FULL PASS:** Mở bài dịch cho tất cả các passage trong đề thi.
   - **Reading PART/FULL FAIL:** Không mở bài dịch. Không mở answer keys.
   - **Listening:** Không có tính năng dịch bài trong bất kỳ trường hợp nào.
   - **Nguyên tắc bảo toàn quyền mở khoá:** Một passage đã được mở khoá qua attempt PASS hợp lệ sẽ **không bị khoá lại** bởi các lần làm bài sau bị FAIL.
3. **Phạm vi chấm điểm độc lập giữa PART và FULL:**
   - Làm PART Passage 2: mẫu số tính điểm chỉ gồm các câu hỏi thuộc Passage 2.
   - Việc PASS một PART không tự động hoàn thành assignment FULL.
4. **Bảo mật đáp án tuyệt đối (Zero Leakage):**
   - Tuyệt đối không trả về `grading`, `acceptedAnswers`, `answerSpecification`, `explanation` hay `transcript` trước khi học viên PASS attempt tương ứng.
5. **Đồng hồ server là nguồn sự thật (Server Authority):**
   - Server tính `startedAt` và `expiresAt`. Client không thể can thiệp vào thời gian thi.

---

## 4. Xung đột tiềm tàng & Chiến lược tương thích ngược (Backward Compatibility)

| Vấn đề xung đột | Phân tích | Giải pháp tương thích |
| :--- | :--- | :--- |
| **Index `translation_submissions`** | Index hiện tại `{ studentAssignmentId: 1 }` là unique, chặn việc nộp nhiều bản dịch cho các passages khác nhau trong cùng 1 bài giao. | Giữ index cũ dạng sparse nếu tồn tại, hoặc chuyển đổi an toàn sang compound unique index `{ studentAssignmentId: 1, passageId: 1 }` (với `passageId` default `null` cho bản ghi cũ). Dữ liệu cũ Phase 5 tiếp tục đọc/ghi bình thường. |
| **Tồn tại song song giữa `exercises` và `exam_tests`** | `exercises` hiện tại quản lý các bài tập đơn lẻ dạng phẳng (không chia part). `exam_tests` quản lý các bộ đề thi IELTS chuẩn (chia Passages/Sections, Groups). | Giữ nguyên toàn bộ `ExercisesModule` và các route cũ. Tạo mới hoàn toàn `ExamTestsModule` và `ExamAttemptsModule`. Module `assignments` hỗ trợ liên kết linh hoạt: nếu `exerciseId` trỏ đến `exercises` thì dùng flow cũ, nếu trỏ đến `exam_tests` thì áp dụng logic mới. |
| **API dịch thuật cũ vs mới** | Route cũ: `/assignments/:id/translations`. Route mới v2: `/reading-translations/*`. | Cung cấp cả hai hệ thống controller. Route cũ tiếp tục phục vụ bài tập Phase 5; route mới phục vụ tính năng mở khoá passage của Phase 9. |

---

## 5. Kế hoạch triển khai kỹ thuật

1. **Bước 1 — Schemas & Enums:**
   - Cập nhật `src/database/schemas/enums.ts` (ExamSkill, ExamMode, PartType, AttemptStatus, ExamTestStatus, ExamPreset, ExamQuestionType).
   - Tạo `src/database/schemas/exam-test.schema.ts`.
   - Tạo `src/database/schemas/exam-attempt.schema.ts`.
   - Cập nhật `src/database/schemas/translation-submission.schema.ts` (bổ sung `passageId`, `exerciseVersion`, `examAttemptId`, `sourceAttemptId`).
   - Cập nhật `src/database/schemas/assignment.schema.ts` (bổ sung `requiredScope`, `requiredPartId`, `allowedModes`, `durationSecondsOverride`).
2. **Bước 2 — Module `exam-tests` (Teacher Question Bank & Student Catalog):**
   - DTOs, Mongoose Schema, Service, Controller, Swagger, RBAC.
   - Hỗ trợ đầy đủ CRUD, part, group, question, validation, preview, publish, new-version.
3. **Bước 3 — Module `exam-attempts` (Session Engine & Auto-Grading):**
   - DTOs, State Machine (`IN_PROGRESS` -> `SUBMITTED`), Autosave revision conflict detection, Server-side Grading engine cho 14 dạng câu hỏi.
   - Phân tích điểm và tính toán mở khoá bản dịch Reading.
4. **Bước 4 — Module `reading-translations` (Passage-scoped Translation Workflow):**
   - Kiểm tra eligibility dựa trên lịch sử `exam_attempts` đã PASSED.
   - Lưu nháp, nộp bản dịch, giáo viên nhận xét.
5. **Bước 5 — Module `media` (Audio playback & upload intent):**
   - Xử lý mock signed URL / playback an toàn cho Listening sections.
6. **Bước 6 — Tích hợp Module `assignments`:**
   - Hỗ trợ giao bài tập theo scope `PART` hoặc `FULL`.
7. **Bước 7 — Kiểm thử Tự động (Unit & E2E Tests):**
   - Unit tests cho `ExamTestsService`, `ExamAttemptsService`, `ReadingTranslationsService`.
   - Test E2E toàn diện `test/phase9.e2e-spec.ts` kiểm chứng toàn bộ AC-01 đến AC-20 trên MongoDB replica set thật.
8. **Bước 8 — Tài liệu & OpenAPI:**
   - Xuất `docs/openapi.json`, cập nhật `docs/FRONTEND_API_CONTRACT.md`, `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`, tạo `docs/PHASE9_FRONTEND_HANDOFF.md` và `docs/PHASE9_IMPLEMENTATION_REPORT.md`.

