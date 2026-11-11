# BÁO CÁO TRIỂN KHAI BACKEND PHASE 9: IELTS EXAM MODES, TEACHER QUESTION BANK, AUTO-GRADING & READING TRANSLATION UNLOCK

**Dự án:** IELTS Learning Management System (LMS) Backend  
**Thư mục làm việc:** `D:\WEB-IELTS`  
**Ngày hoàn thành:** 12/11/2026  
**Kiến trúc sư / Kỹ sư triển khai:** Senior Backend Architect  
**Tài liệu quy chuẩn:** `docs/EXAM_MODES_API_CONTRACT_V2.md`, `docs/FRONTEND_API_CONTRACT.md`, `docs/DECISIONS.md`, `docs/IMPLEMENTATION_STATUS.md`

---

## 1. TỔNG QUAN VÀ MỤC TIÊU PHASE 9

Phase 9 triển khai mở rộng năng lực khảo thí IELTS toàn diện cho hệ thống LMS, chuyển từ mô hình bài tập cơ bản sang nền tảng phòng luyện thi chuyên nghiệp chuẩn quốc tế:
1. **Ngân hàng đề thi giáo viên (Teacher Question Bank):** Cho phép giáo viên biên soạn, cấu trúc, xem trước, xác thực (validation) và phát hành (publish) đề thi Reading & Listening có cấu trúc chuẩn IELTS (Passages 1–3, Sections 1–4, Question Groups).
2. **Hai chế độ làm bài (Exam Modes):**
   - **Chế độ PART:** Làm từng bài đọc/phần nghe riêng lẻ, tính điểm độc lập theo phần thi đó.
   - **Chế độ FULL:** Thi toàn diện cả đề, đánh số câu hỏi liên tục toàn bài (1–40), bấm giờ tổng và tính điểm trên toàn bộ đề thi.
3. **Động cơ phiên làm bài (Exam Session Engine):** Quản lý phiên thi với đồng hồ đếm ngược (`expiresAt`, `remainingSeconds`), tự động lưu bài (autosave) an toàn với kiểm soát xung đột lạc quan (`answersRevision`).
4. **Hệ thống chấm điểm tự động Server-Side (Auto-Grading Engine):** Hỗ trợ đầy đủ **14 loại câu hỏi IELTS**, chuẩn hóa chuỗi và đối chiếu nghiêm ngặt ngưỡng PASS ≥ 70% không làm tròn (unrounded threshold).
5. **Cơ chế mở khóa bản dịch Reading (Reading Translation Unlock):** Mở khóa có điều kiện cho bài dịch tiếng Việt dựa trên kết quả thi thực tế của học viên:
   - Thi PART đạt ≥ 70% chỉ mở khóa Passage tương ứng.
   - Thi FULL đạt ≥ 70% mở khóa toàn bộ các Passage trong đề thi.
   - Học viên chưa đạt ≥ 70% bị chặn truy cập bản dịch với mã lỗi 403 `TRANSLATION_LOCKED`.
6. **Bảo mật tuyệt đối (Zero-Leakage Guarantee):** Không bao giờ rò rỉ đáp án đúng (`acceptedKeys`), quy tắc chấm (`grading`), hoặc lời giải thích (`explanation`) trong bất kỳ payload nào của học viên trước khi nộp bài.

---

## 2. KIẾN TRÚC VÀ CƠ SỞ DỮ LIỆU (SCHEMAS & DATA MODELS)

### 2.1 Enums mở rộng (`src/database/schemas/enums.ts`)
- `ExamSkill`: `READING`, `LISTENING`
- `ExamMode`: `PART`, `FULL`
- `PartType`: `PASSAGE`, `SECTION`
- `ExamTestStatus`: `DRAFT`, `PUBLISHED`, `ARCHIVED`
- `AttemptStatus`: `IN_PROGRESS`, `SUBMITTED`, `EXPIRED`, `ABANDONED`
- `ExamPreset`: `IELTS_ACADEMIC`, `IELTS_GENERAL_TRAINING`, `CUSTOM`
- `ExamQuestionType`: 14 loại câu hỏi chuẩn IELTS:
  - `MULTIPLE_CHOICE_SINGLE`, `MULTIPLE_CHOICE_MULTIPLE`
  - `TRUE_FALSE_NOT_GIVEN`, `YES_NO_NOT_GIVEN`
  - `MATCHING_HEADINGS`, `MATCHING_INFORMATION`, `MATCHING_FEATURES`, `MATCHING_SENTENCE_ENDINGS`
  - `SENTENCE_COMPLETION`, `SUMMARY_COMPLETION`, `NOTE_COMPLETION`, `TABLE_COMPLETION`, `FLOW_CHART_COMPLETION`, `SHORT_ANSWER`

### 2.2 Collection `exam_tests` (`src/database/schemas/exam-test.schema.ts`)
- Cấu trúc phân tầng linh hoạt:
  - `ExamTest`: Lưu trữ thông tin chung, kỹ năng (`skill`), chế độ cho phép (`allowedModes`), điểm chuẩn (`passScore`), thời lượng (`fullDurationSeconds`), trạng thái (`status`), phiên bản (`version`), và danh sách các phần (`parts`).
  - `ExamPart`: Đại diện cho một Passage hoặc Section, chứa tiêu đề, nội dung HTML (`contentHtml`), metadata âm thanh (`audioMetadata`), thời lượng làm bài (`durationSeconds`), và danh sách nhóm câu hỏi (`questionGroups`).
  - `QuestionGroup`: Chứa văn bản hướng dẫn/ngữ cảnh phụ (`instruction`, `passageSubsetHtml`), loại nhóm câu hỏi và danh sách câu hỏi (`questions`).
  - `ExamQuestion`: Chứa mã câu hỏi (`questionId`), số thứ tự hiển thị (`number`), lời dẫn (`prompt`), số điểm (`points`), các lựa chọn (`options`), và cấu hình chấm điểm bảo mật (`grading`).
- Chỉ mục: `{ createdBy: 1, status: 1 }`, `{ skill: 1, status: 1 }`, `{ status: 1 }`.

### 2.3 Collection `exam_attempts` (`src/database/schemas/exam-attempt.schema.ts`)
- Quản lý phiên làm bài của học viên:
  - `testId`, `studentId`, `mode` (`PART` hoặc `FULL`), `partId` (bắt buộc khi là PART, null khi là FULL).
  - `scopeQuestionIds`: Mảng ID các câu hỏi thuộc phạm vi chấm điểm của phiên làm bài này.
  - `startedAt`, `expiresAt`, `submittedAt`, `status`.
  - `answersRevision`: Số nguyên tăng dần phục vụ kiểm soát xung đột lạc quan (Optimistic Concurrency).
  - `savedAnswers`: Mảng câu trả lời đã lưu nháp `{ questionId, value, savedAt }`.
  - `gradingResult`: Kết quả chi tiết sau khi chấm điểm.
  - `idempotencyKey`: Khóa chống nộp trùng lặp (sparse unique index).
- Chỉ mục: `{ studentId: 1, testId: 1, status: 1 }`, `{ idempotencyKey: 1 }` (unique, sparse).

### 2.4 Cập nhật `translation_submissions` (`src/database/schemas/translation-submission.schema.ts`)
- Bổ sung `passageId`, `exerciseVersion`, `examAttemptId`, `sourceAttemptId`.
- Chỉ mục kết hợp chống trùng lặp theo Passage: `{ studentAssignmentId: 1, passageId: 1 }` (sparse unique) và `{ studentId: 1, testId: 1, passageId: 1 }`.

### 2.5 Cập nhật `assignments` (`src/database/schemas/assignment.schema.ts`)
- Mở rộng hỗ trợ giao bài kiểm tra IELTS: `requiredScope` (`PART` hoặc `FULL`), `requiredPartId`, `allowedModes`, `durationSecondsOverride`.

---

## 3. DANH MỤC MODULE VÀ ENDPOINTS MỚI

### 3.1 `ExamTestsModule` (`src/modules/exam-tests/`)
- Quản lý ngân hàng đề thi dành cho giáo viên và danh mục đề thi công khai cho học viên.
- **Endpoints dành cho Giáo viên (`TeacherExamTestsController`):**
  - `POST /api/v1/teacher/exam-tests`: Tạo bài thi mới (DRAFT).
  - `GET /api/v1/teacher/exam-tests`: Danh sách bài thi trong kho của giáo viên.
  - `GET /api/v1/teacher/exam-tests/:id`: Xem chi tiết toàn bộ đề thi (kèm đáp án và quy tắc chấm).
  - `PATCH /api/v1/teacher/exam-tests/:id`: Chỉnh sửa thông tin bài thi (chỉ áp dụng khi ở trạng thái DRAFT).
  - `POST /api/v1/teacher/exam-tests/:id/parts`: Thêm Passage/Section vào bài thi.
  - `POST /api/v1/teacher/exam-tests/:id/parts/:partId/question-groups`: Thêm nhóm câu hỏi và câu hỏi.
  - `GET /api/v1/teacher/exam-tests/:id/validate`: Xác thực tính toàn vẹn (tổng số câu, thứ tự câu, phân bổ điểm).
  - `POST /api/v1/teacher/exam-tests/:id/publish`: Phát hành bài thi chính thức (khóa bất biến).
  - `POST /api/v1/teacher/exam-tests/:id/new-version`: Nhân bản bài thi đã phát hành sang bản DRAFT mới (`version = current + 1`).
- **Endpoints dành cho Học viên (`ExamTestsController`):**
  - `GET /api/v1/exam-tests`: Xem danh mục các đề thi đã phát hành (`PUBLISHED`).
  - `GET /api/v1/exam-tests/:id`: Xem chi tiết bài thi (áp dụng `ExamTestMapper.toStudentTestView` lọc bỏ 100% grading).
  - `GET /api/v1/exam-tests/:id/parts/:partId`: Lấy nội dung chi tiết một phần thi để làm bài (lọc bỏ 100% grading).

### 3.2 `ExamAttemptsModule` (`src/modules/exam-attempts/`)
- Quản lý phiên làm bài thi và động cơ tự động chấm điểm.
- **Endpoints (`ExamAttemptsController`):**
  - `POST /api/v1/exam-attempts`: Bắt đầu phiên làm bài (hỗ trợ `PART` và `FULL`, xác thực quyền làm bài, tính toán `expiresAt`).
  - `GET /api/v1/exam-attempts/:id`: Lấy trạng thái phiên làm bài và thời gian còn lại (`remainingSeconds`).
  - `PUT /api/v1/exam-attempts/:id/answers`: Tự động lưu đáp án với khóa lạc quan (`baseRevision === currentRevision`).
  - `POST /api/v1/exam-attempts/:id/submit`: Nộp bài thi, tự động chấm điểm server-side theo phạm vi câu hỏi, đánh giá PASS/FAIL theo ngưỡng 70% unrounded.
  - `GET /api/v1/exam-attempts/:id/result`: Tóm tắt kết quả bài thi và danh sách các Passage được mở khóa dịch.
  - `GET /api/v1/exam-attempts/:id/review`: Xem lại chi tiết bài làm, đáp án chính thức và lời giải thích.

### 3.3 `ReadingTranslationsModule` (`src/modules/reading-translations/`)
- Quản lý luồng mở khóa bản dịch Reading, lưu nháp, nộp bài dịch và giáo viên chấm bài.
- **Endpoints Học viên (`ReadingTranslationsController`):**
  - `GET /api/v1/reading-translations/eligibility?testId=xxx`: Kiểm tra điều kiện mở khóa từng Passage trong đề.
  - `POST /api/v1/reading-translations/passages/:passageId/draft`: Lưu nháp bản dịch (chặn 403 `TRANSLATION_LOCKED` nếu chưa đạt ≥ 70%).
  - `POST /api/v1/reading-translations/passages/:passageId/submit`: Nộp bài dịch chính thức cho giáo viên.
  - `GET /api/v1/reading-translations/passages/:passageId/mine`: Xem bản dịch của bản thân và phản hồi của giáo viên.
- **Endpoints Giáo viên (`TeacherReadingTranslationsController`):**
  - `GET /api/v1/teacher/reading-translations`: Danh sách các bài dịch cần chấm theo lớp/bài thi.
  - `PATCH /api/v1/teacher/reading-translations/:id/review`: Chấm điểm bản dịch và để lại nhận xét (`status: REVIEWED`).

### 3.4 `MediaModule` (`src/modules/media/`)
- Tích hợp tải lên và phát audio bảo mật cho đề thi Listening.
- **Endpoints (`MediaController`):**
  - `POST /api/v1/media/audio/upload-intent`: Khởi tạo intent tải lên file âm thanh (cấp presigned upload URL).
  - `GET /api/v1/media/audio/:assetId/playback`: Lấy URL phát âm thanh có chữ ký giới hạn thời gian.

---

## 4. QUY TRÌNH CHẤM ĐIỂM TỰ ĐỘNG & QUY TẮC MỞ KHÓA BẢN DỊCH

### 4.1 Động cơ chấm điểm tự động (Auto-Grading Engine)
Được triển khai tập trung tại `src/common/utils/exam-grading.util.ts`:
1. **Chuẩn hóa đáp án:**
   - Cắt tỉa khoảng trắng đầu/cuối (trim).
   - Rút gọn khoảng trắng thừa giữa các từ (`\s+` thành một dấu cách).
   - Chuyển chữ hoa/chữ thường thông minh dựa trên thuộc tính `caseSensitive`.
2. **Đối chiếu đáp án:**
   - So khớp với mảng đáp án chấp nhận (`acceptedKeys`).
   - Xử lý các dạng câu hỏi chọn nhiều đáp án (`MULTIPLE_CHOICE_MULTIPLE`): chấm điểm từng phần hoặc theo tập hợp.
   - Xử lý câu hỏi điền từ (`COMPLETION`, `SHORT_ANSWER`): hỗ trợ nhiều biến thể từ đồng nghĩa được giáo viên định nghĩa trong `acceptedKeys`.
3. **Ngưỡng đạt chuẩn IELTS (Pass Threshold):**
   - Áp dụng so sánh điểm thực tế không làm tròn:
     $$\text{scorePercent} = \frac{\text{earnedPoints}}{\text{totalPoints}} \times 100$$
   - `passed = scorePercent >= passScore` (mặc định 70).
   - Ví dụ: 7/10 điểm = 70.0% $\rightarrow$ **PASS**. 6.99/10 điểm = 69.9% $\rightarrow$ **FAIL**.

### 4.2 Logic mở khóa bản dịch Reading (Scope-Aware Translation Unlock)
Được tính toán động qua phương thức `isPassageUnlockedForStudent` trong `ReadingTranslationsService`:
1. **Trường hợp làm bài chế độ PART:**
   - Tìm kiếm các lượt làm bài `exam_attempts` của học viên có `mode === ExamMode.PART` và `partId === targetPassageId`.
   - Nếu tồn tại ít nhất 1 attempt có `status === SUBMITTED` và `passed === true` ($\ge 70\%$) $\rightarrow$ **Mở khóa Passage đó**.
2. **Trường hợp làm bài chế độ FULL:**
   - Tìm kiếm các lượt làm bài có `mode === ExamMode.FULL` và `testId === targetTestId`.
   - Nếu tồn tại ít nhất 1 attempt có `status === SUBMITTED` và `passed === true` ($\ge 70\%$) $\rightarrow$ **Mở khóa TẤT CẢ Passages trong đề thi**.
3. **Bảo vệ quyền truy cập:**
   - Mọi thao tác ghi nháp hoặc nộp bài dịch đều kiểm tra điều kiện trên.
   - Nếu không thỏa mãn, ném ngoại lệ `ForbiddenException` kèm thông điệp chuẩn quy chuẩn:
     `TRANSLATION_LOCKED: Passage translation is locked. Student must score at least 70% on this passage or the full test to unlock.`

---

## 5. BẢNG ĐỐI CHIẾU TIÊU CHÍ CHẤP NHẬN (TRACEABILITY MATRIX)

| Mã AC | Tiêu chí chấp nhận | Trạng thái | Minh chứng kiểm thử |
|---|---|---|---|
| **AC-01** | Giáo viên tạo đề thi Reading bản nháp gồm 2 Passage và các nhóm câu hỏi; validate hợp lệ và publish thành công | **PASS** | `test/phase9.e2e-spec.ts` (test case 1, 3) |
| **AC-02** | Khởi tạo intent tải lên audio và phát audio an toàn có giới hạn thời gian qua Media endpoints | **PASS** | `test/phase9.e2e-spec.ts` (test case 5) |
| **AC-03** | Học viên bắt đầu phiên thi chế độ PART cho Passage 1, nhận `scopeQuestionIds` tương ứng với phần đó | **PASS** | `test/phase9.e2e-spec.ts` (test case 8) |
| **AC-04** | Học viên làm bài chế độ FULL, hệ thống liên kết tất cả câu hỏi toàn đề với số thứ tự liên tục | **PASS** | `test/phase9.e2e-spec.ts` (test case 17) |
| **AC-05** | Tự động chấm điểm server-side chính xác cho các dạng câu hỏi IELTS, tính điểm và % hoàn thành | **PASS** | `src/common/utils/exam-grading.util.ts`, unit test & e2e |
| **AC-06** | Ngưỡng PASS 70% không làm tròn; so sánh chính xác điều kiện biên 70% và 69.9% | **PASS** | `test/phase9.e2e-spec.ts` (test case 10, 11) |
| **AC-07** | Endpoint kiểm tra điều kiện mở khóa dịch (`/eligibility`) phản ánh chính xác trạng thái từng Passage | **PASS** | `test/phase9.e2e-spec.ts` (test case 12, 17) |
| **AC-08** | Học viên thi PART < 70% bị từ chối mở khóa bản dịch (HTTP 403 `TRANSLATION_LOCKED`) | **PASS** | `test/phase9.e2e-spec.ts` (test case 10, 13) |
| **AC-09** | Học viên thi FULL đạt ≥ 70% tự động mở khóa bản dịch cho TOÀN BỘ các Passages trong đề | **PASS** | `test/phase9.e2e-spec.ts` (test case 17) |
| **AC-10** | Học viên lưu nháp bản dịch và nộp bài dịch chính thức; giáo viên chấm bài và để lại nhận xét | **PASS** | `test/phase9.e2e-spec.ts` (test case 15, 16) |
| **AC-11** | Chế độ làm bài FULL chấm điểm trên 20 câu hỏi, đạt 16/20 (80%) mở khóa cả 2 Passage | **PASS** | `test/phase9.e2e-spec.ts` (test case 17) |
| **AC-12** | Tạo phiên bản mới (`POST .../new-version`) từ bài thi đã phát hành để chỉnh sửa an toàn | **PASS** | `test/phase9.e2e-spec.ts` (test case 4) |
| **AC-13** | Zero-Leakage: Endpoint học viên xem đề thi tuyệt đối không để lộ đáp án (`acceptedKeys`, `grading`) | **PASS** | `test/phase9.e2e-spec.ts` (test case 7) |
| **AC-14** | Tự động lưu bài (`PUT .../answers`) với kiểm soát xung đột qua `answersRevision` | **PASS** | `test/phase9.e2e-spec.ts` (test case 9) |
| **AC-15** | Phân quyền RBAC nghiêm ngặt: Giáo viên khác không được chỉnh sửa đề thi của giáo viên tạo đề (403) | **PASS** | `test/phase9.e2e-spec.ts` (test case 2) |
| **AC-16** | Học viên khác không được truy cập vào bài thi hoặc bản dịch của học viên đã mở khóa (403) | **PASS** | `test/phase9.e2e-spec.ts` (test case 14) |
| **AC-17** | Hỗ trợ đầy đủ 14 loại câu hỏi IELTS với cấu hình scoringStrategy linh hoạt | **PASS** | `src/common/utils/exam-grading.util.ts` & unit tests |
| **AC-18** | Giáo viên giao bài thi IELTS cho lớp học với phạm vi yêu cầu `requiredScope` PART/FULL | **PASS** | `test/phase9.e2e-spec.ts` (test case 18) |
| **AC-19** | Chuẩn hóa định dạng trạng thái chữ hoa (`DRAFT`, `SUBMITTED`, `REVIEWED`, `LOCKED`) | **PASS** | `reading-translations.service.ts` & DTO transformers |
| **AC-20** | Xuất đặc tả OpenAPI v3 tự động và đồng bộ tài liệu tích hợp Frontend | **PASS** | `docs/openapi.json`, `npm run export:openapi` |

---

## 6. KẾT QUẢ KIỂM THỬ TOÀN DIỆN (SYSTEM VERIFICATION METRICS)

Toàn bộ hệ sinh thái kiểm thử được thực thi trên môi trường thực tế (Node.js LTS, MongoDB Replica Set `rs0`, Redis 7):

1. **Kiểm tra cú pháp TypeScript:**
   ```bash
   npx tsc --noEmit
   # Kết quả: EXIT 0 (Không phát hiện bất kỳ lỗi kiểu dữ liệu nào)
   ```

2. **Biên dịch mã nguồn ứng dụng (Build):**
   ```bash
   npm run build
   # Kết quả: EXIT 0 (Biên dịch thành công toàn bộ dist/)
   ```

3. **Kiểm thử đơn vị (Unit Tests):**
   ```bash
   npm test -- --forceExit
   # Kết quả:
   Test Suites: 19 passed, 19 total
   Tests:       133 passed, 133 total
   Snapshots:   0 total
   Time:        10.213 s
   ```
   *Bao gồm các bộ test mới cho Phase 9: `exam-tests.service.spec.ts` (10 tests), `exam-attempts.service.spec.ts` (7 tests), `reading-translations.service.spec.ts` (6 tests).*

4. **Kiểm thử tích hợp đầu-cuối (E2E Tests trên MongoDB Replica Set & Redis):**
   ```bash
   npm run test:e2e -- --runInBand --forceExit
   # Kết quả:
   PASS test/phase9.e2e-spec.ts (18/18 tests PASS)
   PASS test/phase8.e2e-spec.ts (19/19 tests PASS)
   PASS test/phase7.e2e-spec.ts (10/10 tests PASS)
   PASS test/phase6.e2e-spec.ts (17/17 tests PASS)
   PASS test/phase5.e2e-spec.ts (13/13 tests PASS)
   PASS test/phase3-real-mongo.e2e-spec.ts (11/11 tests PASS)
   PASS test/phase4.e2e-spec.ts (16/16 tests PASS)
   PASS test/auth.e2e-spec.ts (10/10 tests PASS)
   PASS test/phase3.e2e-spec.ts (10/10 tests PASS)

   Test Suites: 9 passed, 9 total
   Tests:       124 passed, 124 total
   Snapshots:   0 total
   Time:        16.311 s
   ```

5. **Xuất khẩu OpenAPI Specification:**
   ```bash
   npm run export:openapi
   # Kết quả: Xuất thành công file docs/openapi.json với đầy đủ schemas và endpoints Phase 9.
   ```

---

## 7. KẾT LUẬN & SẴN SÀNG BÀN GIAO

Giai đoạn Phase 9 đã được hoàn thành trọn vẹn 100% mục tiêu kiến trúc và nghiệp vụ khảo thí. Toàn bộ tính năng từ Phase 0 đến Phase 8 được bảo toàn nguyên vẹn, không có bất kỳ xung đột hay hồi quy nào.

Hệ thống đã sẵn sàng kết nối trực tiếp với Frontend Next.js 14/15 App Router theo tài liệu [docs/PHASE9_FRONTEND_HANDOFF.md](file:///d:/WEB-IELTS/docs/PHASE9_FRONTEND_HANDOFF.md) và hợp đồng API chuẩn xác [docs/FRONTEND_API_CONTRACT.md](file:///d:/WEB-IELTS/docs/FRONTEND_API_CONTRACT.md).
