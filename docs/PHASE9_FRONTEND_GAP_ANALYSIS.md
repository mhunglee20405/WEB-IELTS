# PHASE 9 FRONTEND GAP ANALYSIS — IELTS EXAM PRACTICE, QUESTION BANK & TRANSLATION WORKFLOW

**Ngày rà soát:** 2026-11-12  
**Workspace:** `d:\WORK\WEB-IELTS`  
**Stack hiện tại:** Next.js `16.4.6` (App Router), React `19.3.1`, TypeScript `strict: true` + `noUncheckedIndexedAccess: true`, Tailwind CSS v4, `@tanstack/react-query`, `react-hook-form`, `zod`, `dompurify`, Vitest + RTL, Playwright + `@axe-core/playwright`.

---

## 1. Kiểm kê Source of Truth & Trạng thái Backend

| Thứ tự ưu tiên | Tài liệu / Nguồn chuẩn | Trạng thái thực tế trong workspace | Ghi chú / Độ lệch |
|---|---|---|---|
| **1 (Cao nhất)** | Backend Phase 9 OpenAPI (`docs/openapi.json` hoặc live Swagger JSON) & verified API | **KHÔNG TỒN TẠI / BLOCKED** | `docs/openapi.json` không có trong repo. Kiểm tra `http://localhost:4000/api/v1/health`, `/api-json`, `/docs-json` bị timeout (không có backend NestJS chạy local hoặc mã nguồn backend trong `d:\WORK`). |
| **2** | `docs/PHASE9_FRONTEND_HANDOFF.md` / `docs/FRONTEND_API_CONTRACT.md` | **KHÔNG TỒN TẠI** | Hai file handoff không có trong `docs/`. |
| **3** | `docs/EXAM_MODES_API_CONTRACT_V2.md` (tên thực tế: `docs/IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md`) | **HIỆN DIỆN** (`PROPOSED / CONTRACT FOR IMPLEMENTATION`) | Định nghĩa đầy đủ mô hình `ExamTest` / `ExamPart` / `QuestionGroup` / `ExamQuestion` (15 `QuestionType`), `ExamAttempt`, `ReadingTranslationEligibility`, v2 Teacher Bank & Assignment scope. |
| **4 (Nền hiện tại)** | `docs/IELTS_LMS_FRONTEND_SYSTEM_DESIGN.md` & codebase hiện có | **HIỆN DIỆN & ĐANG CHẠY Ở MOCK MODE** | `.env.local` đặt `NEXT_PUBLIC_API_MODE=mock`. Giao diện v1 chạy ổn định với `/exercises`, `/assignments`, `/student-assignments`, `/translations`, `/media/audio/upload-init|complete|playback`. |

---

## 2. Xung đột & Khoảng trống Hợp đồng (v1 Codebase vs. v2 Exam Contract)

### 2.1 Mô hình đề thi & Câu hỏi
- **Hiện tại (v1 `src/lib/api/types.ts`):** `Exercise` dùng `type: "reading" | "listening"` (lowercase), mảng phẳng `questions: ExerciseQuestion[]`, 3 dạng câu hỏi (`mcq`, `fill_blank`, `true_false_ng`), 1 `passageHtml` hoặc 1 `audioAssetId`.
- **v2 Contract:** `ExamTest` phân cấp `ExamTest` -> `ExamPart[]` (`PASSAGE_1..3` hoặc `SECTION_1..4`, số part động theo API, không hardcode 3/4) -> `QuestionGroup[]` -> `ExamQuestion[]` với 15 `ExamQuestionType`:
  - `MULTIPLE_CHOICE_SINGLE`, `MULTIPLE_CHOICE_MULTIPLE`
  - `TRUE_FALSE_NOT_GIVEN`, `YES_NO_NOT_GIVEN`
  - `MATCHING_HEADINGS`, `MATCHING_INFORMATION`, `MATCHING_FEATURES`, `MATCHING_SENTENCE_ENDINGS`
  - `SENTENCE_COMPLETION`, `SUMMARY_COMPLETION`, `NOTE_COMPLETION`, `TABLE_COMPLETION`, `FLOW_CHART_COMPLETION`, `DIAGRAM_LABEL_COMPLETION`, `SHORT_ANSWER`
- **Gap & Giải pháp:** Giữ nguyên toàn bộ kiểu và endpoint `/exercises` cho legacy assignments; xây mới hệ kiểu + Zod sanitizer + endpoint `/exam-tests`, `/teacher/exam-tests` song song, không phá vỡ trang `/teacher/exercises` và `/student/assignments/[id]`.

### 2.2 Vòng đời Làm bài (Attempt Engine)
- **Hiện tại (v1):** Làm bài stateless phía client với `draft-storage.ts`, nộp một lần qua `POST /student-assignments/:id/submissions`. Không có `attemptId`, `baseRevision` concurrency, server countdown clock (`expiresAt`), hay `GET /exam-attempts/:id/review` tách biệt.
- **v2 Contract (§4.1, §4.2):**
  - `POST /exam-attempts`, `GET /exam-attempts`, `GET /exam-attempts/:attemptId`
  - `PUT /exam-attempts/:attemptId/answers` (`baseRevision`, trả `revision`, HTTP `409 ANSWERS_REVISION_CONFLICT` khi lệch revision)
  - `POST /exam-attempts/:attemptId/submit` (`expectedRevision`, `idempotencyKey`)
  - `GET /exam-attempts/:attemptId/result` & `GET /exam-attempts/:attemptId/review` (403/disabled nếu `answerReviewAvailable = false`)
- **Gap & Giải pháp:** Xây Session Engine dùng chung (`ExamShell`, `useExamTimer`, `useExamAutosave`) đọc chuẩn server offset (`expiresAt` / `remainingSeconds`), xử lý xung đột `409`, flush trước khi nộp bài, và tuyệt đối không gửi/tính điểm ở client.

### 2.3 Upload Audio (Listening)
- **Hiện tại (v1 `src/lib/api/endpoints/media.ts`):** Dùng `POST /media/audio/upload-init` -> upload nhị phân tới `uploadUrl` -> `POST /media/audio/upload-complete`, và phát qua `GET /media/audio/:assetId/playback`.
- **v2 Contract (§4.3):** Đề cập `POST /media/audio/upload-intent` và phát qua `playbackUrl` trên part audio hoặc playback endpoint.
- **Gap & Giải pháp:** Bảo toàn `upload-init` + `upload-complete` + `getAudioPlayback` đã verify trong v1; đồng thời bổ sung cảnh báo tích hợp nếu backend Phase 9 đổi route sang `upload-intent`.

### 2.4 Quy trình Bài dịch (Reading Translation Workflow)
- **Hiện tại (v1):** Gắn chặt 1-1 với `studentAssignmentId` (`/student-assignments/:id/translation`, trạng thái `not_started | draft | submitted | needs_revision | approved`) và teacher queue `/translations`.
- **v2 Contract (§4.1, §4.4):** Mở khóa **theo từng passage** dựa trên Reading PASS (>= 70%) qua `GET /reading-translations/eligibility`, làm bài tại `GET /reading-translations/:passageId`, `PUT .../draft` (`textVi`, `revision`), `POST .../submit`, teacher duyệt tại `GET /teacher/reading-translations` và `POST /teacher/reading-translations/:translationId/review` (`REVIEWED` + feedback), trạng thái `LOCKED | DRAFT | SUBMITTED | REVIEWED`.
- **Gap & Giải pháp:** Giữ nguyên `/student/assignments/[studentAssignmentId]/translation` cho bài tập cũ; bổ sung route `/student/reading/[testId]/translate/[passageId]` + mở rộng `/teacher/translations` hỗ trợ tab **Bài dịch theo Passage (v2)** và **Bài dịch theo Bài tập khóa học (v1)** trên cùng một quy trình.

### 2.5 Full Test Assembly & Giao bài tập (PART / FULL Scope)
- **v2 Contract (§4.3):** `POST /teacher/exam-tests/:testId/parts` nhận metadata + questionGroups. Contract chưa nêu endpoint `attach-existing-part` chuyên biệt để gắn part có sẵn bằng ID mà không sao chép payload.
- **Giải pháp:** Builder `Full Test` gửi payload chuẩn của part được chọn (kèm `sourcePartId` tùy chọn để backend có thể tái sử dụng hoặc clone sạch khi xuất bản).
- **Assignment Creation (§4.4):** Bổ sung `examTestId` (tùy chọn bên cạnh `exerciseId` v1), `requiredScope: "PART" | "FULL"`, `requiredPartId`, `allowedModes`, `durationSecondsOverride`, `maxAttempts` vào form `/teacher/assignments/new`.

### 2.6 Bảo mật & Không rò rỉ đáp án / transcript
- Mọi schema Zod dành cho học viên (`ExamTestDetailStudentSchema`, `ExamPartPublicSchema`, `ExamAttemptDetailSchema`) phải **strip hoàn toàn** các trường nhạy cảm (`correctAnswer`, `acceptedAnswers`, `answerSpecification`, `grading`, `explanation`, `transcript`, `transcriptHtml`, `isCorrect`) ngay từ tầng parse DTO giống cơ chế `ExerciseQuestionPublicSchema` của v1.
- Mọi nội dung HTML Passage/Câu hỏi đi qua `SafeHtml` / `sanitizeHtml(..., "richText")` với `ALLOW_ARIA_ATTR: false`, `ALLOW_DATA_ATTR: false`, `KEEP_CONTENT: false`.

---

## 3. Ma trận Route Frontend & Trạng thái Tích hợp Live Backend

| Route | Loại | Mô tả | Phụ thuộc API | Live Backend Status |
|---|---|---|---|---|
| `/student/practice` | **MỚI** | Thư viện luyện đề Reading/Listening, tìm kiếm, filter difficulty/scope | `GET /exam-tests` | **BLOCKED** (chưa có live BE) |
| `/student/practice/[testId]` | **MỚI** | Chi tiết đề, chọn mode PART/FULL động, khôi phục attempt dở | `GET /exam-tests/:testId`, `GET /exam-attempts`, `POST /exam-attempts` | **BLOCKED** |
| `/student/exam/[attemptId]` | **MỚI** | Phòng thi máy tính CBT (Reading split-pane & Listening player, Session Engine) | `GET/PUT/POST /exam-attempts/:attemptId*`, `GET /media/audio/:assetId/playback` | **BLOCKED** |
| `/student/exam/[attemptId]/result` | **MỚI** | Kết quả authoritative từ BE, ngưỡng PASS 70%, review có điều kiện, nút Translate Passage | `GET .../result`, `GET .../review`, `GET /reading-translations/eligibility` | **BLOCKED** |
| `/student/reading/[testId]/translate/[passageId]` | **MỚI** | Dịch đa passage (tab Passage 1..N theo eligibility, lưu draft revision, nộp bài, xem feedback) | `GET /reading-translations/eligibility`, `GET/PUT/POST /reading-translations/:passageId*` | **BLOCKED** |
| `/student/assignments/[studentAssignmentId]` & `.../translation` | **CẬP NHẬT NHẸ** | Bảo toàn luồng v1 + hỗ trợ khởi chạy `ExamAttempt` nếu assignment gắn `examTestId` / `requiredScope` | v1 `/student-assignments/*` + v2 `/exam-attempts` | v1 Mock verified; v2 Live **BLOCKED** |
| `/teacher/question-bank` | **MỚI** | Dashboard ngân hàng đề v2 (tab Reading/Listening, search, filter, validate, publish, archive, new version) | `GET/POST /teacher/exam-tests*` | **BLOCKED** |
| `/teacher/question-bank/new` & `[testId]/edit` | **MỚI** | Trình soạn Passage Reading / Section Listening (15 loại câu hỏi, audio upload, transcript riêng giáo viên) | `POST/PATCH /teacher/exam-tests*`, `.../parts`, `.../question-groups`, `/media/audio/*` | **BLOCKED** |
| `/teacher/question-bank/full-test-builder` | **MỚI** | Ghép Full Test từ nhiều Passage/Section, đánh số tuần tự, kiểm tra validate | `POST /teacher/exam-tests`, `POST .../parts`, `POST .../validate`, `POST .../publish` | **BLOCKED** |
| `/teacher/question-bank/[testId]/preview` | **MỚI** | Xem trước đề dưới góc nhìn học viên (ẩn đáp án/transcript) | `GET /teacher/exam-tests/:testId/preview` | **BLOCKED** |
| `/teacher/assignments/new` | **MỞ RỘNG** | Thêm scope `PART`/`FULL`, chọn `requiredPartId`, `allowedModes`, `durationSecondsOverride`, `maxAttempts` | `POST /assignments` + `GET /teacher/exam-tests` | v1 Mock verified; v2 Live **BLOCKED** |
| `/teacher/translations` | **MỞ RỘNG** | Giữ nguyên chấm bài dịch khóa học v1 + thêm tab chấm bài dịch theo passage v2 | v1 `/translations*` + v2 `/teacher/reading-translations*` | v1 Mock verified; v2 Live **BLOCKED** |

