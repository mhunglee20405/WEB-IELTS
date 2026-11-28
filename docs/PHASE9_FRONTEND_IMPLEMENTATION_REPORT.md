# PHASE 9 FRONTEND IMPLEMENTATION REPORT — IELTS PRACTICE, CBT EXAM ENGINE, QUESTION BANK & PASSAGE TRANSLATION

**Ngày lập báo cáo:** 2026-11-12  
**Workspace:** `d:\WORK\WEB-IELTS`  
**Stack:** Next.js `16.4.6` (App Router, Turbopack), React `19.3.1`, TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`), Tailwind CSS v4, `@tanstack/react-query`, `react-hook-form`, `zod`, `dompurify`, Vitest + React Testing Library, Playwright + `@axe-core/playwright`.

---

## 1. Tóm tắt Trạng thái Source of Truth & Giới hạn Live Backend

| Nguồn | Trạng thái | Ghi chú thực tế |
|---|---|---|
| Live Backend (`http://localhost:4000/api/v1/health`) | **BLOCKED / UNVERIFIED** | Kiểm tra HTTP lúc `2026-11-12` đều hết thời gian chờ (*The operation has timed out*). Hiện chưa có tiến trình backend NestJS chạy local trong workspace. |
| `docs/openapi.json` | **MISSING / BLOCKED** | Tệp đặc tả OpenAPI không tồn tại trong kho mã nguồn. |
| `docs/PHASE9_FRONTEND_HANDOFF.md` & `docs/FRONTEND_API_CONTRACT.md` | **MISSING / BLOCKED** | Các tệp handoff bổ sung không có trong `docs/`. |
| `docs/IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md` | **HIỆN DIỆN (`PROPOSED`)** | Được sử dụng làm chuẩn thiết kế giao diện & lớp boundary tích hợp API v2, giữ tương thích toàn phần với codebase v1 hiện hữu. |
| `docs/PHASE9_FRONTEND_GAP_ANALYSIS.md` | **ĐÃ LẬP** | Tài liệu đối chiếu xung đột v1 ↔ v2 và phân tích bảo mật trước triển khai. |

> **Cam kết trung thực tích hợp:** Toàn bộ luồng Phase 9 trên `.env.local` hiện chạy qua adapter `NEXT_PUBLIC_API_MODE=mock` (chỉ phục vụ phát triển & kiểm thử giao diện cục bộ). Khi chuyển `NEXT_PUBLIC_API_MODE=live`, ứng dụng gọi trực tiếp API thật thông qua `src/lib/api/client.ts` và tuyệt đối **không** tự giả lập điểm số, kết quả mở khóa, hay fallback sang mock nếu backend lỗi hoặc chưa triển khai endpoint.

---

## 2. Danh mục Tệp đã Tạo mới và Cập nhật

### 2.1 Tầng Hợp đồng API, Bảo mật DTO & Dev Mock Adapter
- **Cập nhật [src/lib/api/error.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/error.ts):** Bổ sung đầy đủ thông báo tiếng Việt thân thiện trong `CODE_MESSAGES_VI` cho bộ mã lỗi Phase 9 (`INVALID_EXAM_SCOPE`, `INVALID_QUESTION_ANSWER`, `EXAM_ACCESS_DENIED`, `TRANSLATION_LOCKED`, `ASSIGNMENT_SCOPE_LOCKED`, `EXAM_NOT_FOUND`, `ATTEMPT_ALREADY_IN_PROGRESS`, `ANSWERS_REVISION_CONFLICT`, `ATTEMPT_ALREADY_SUBMITTED`, `EXAM_VERSION_CONFLICT`, `EXAM_PUBLISH_VALIDATION_FAILED`, `RATE_LIMITED`, `ATTEMPT_EXPIRED`, `ANSWER_REVIEW_LOCKED`).
- **Cập nhật [src/lib/api/types.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/types.ts):** Bổ sung hệ kiểu v2 (`ExamSkill`, `ExamMode`, `ExamPartType`, `ExamQuestionType` 15 dạng, `ExamTestSummary`, `ExamTestDetailStudent`, `ExamTestDetailAuthoring`, `ExamAttemptDetail`, `ExamResultResponse`, `ExamReviewResponse`, `ReadingTranslationEligibilityResponse`, `ReadingTranslationDetail`, `TeacherReadingTranslationItem`, `ValidateExamTestResponse`) cùng các trường mở rộng tùy chọn (`examTestId`, `requiredScope`, `requiredPartId`, `allowedModes`, `durationSecondsOverride`, `maxAttempts`) trên `Assignment`, `StudentAssignmentSummary`, `CreateAssignmentRequest`.
- **Cập nhật [src/lib/api/schemas.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/schemas.ts):** Bổ sung `ExamQuestionPublicSchema`, `ExamQuestionGroupPublicSchema`, `ExamPartPublicSchema`, `ExamTestDetailStudentSchema`, `ExamAttemptDetailSchema` dùng `.strip()` để loại bỏ hoàn toàn `correctAnswer`, `acceptedAnswers`, `explanation`, `transcript` khỏi payload học viên; bổ sung `ExamResultResponseSchema`, `ReadingTranslationDraftSchema`, `ReadingTranslationReviewSchema`, `TeacherExamTestFormSchema` và mở rộng `CreateAssignmentFormSchema`.
- **Cập nhật [src/lib/api/query-keys.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/query-keys.ts):** Bổ sung `examKeys` cho React Query invalidation nhất quán giữa Library, Attempt, Result, Review, Reading Translation, Teacher Question Bank và Teacher Passage Queue.
- **Tạo mới lớp Endpoint Typed Boundary:**
  - [src/lib/api/endpoints/exam-tests.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/endpoints/exam-tests.ts) (`examTestsApi`)
  - [src/lib/api/endpoints/exam-attempts.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/endpoints/exam-attempts.ts) (`examAttemptsApi`)
  - [src/lib/api/endpoints/reading-translations.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/endpoints/reading-translations.ts) (`readingTranslationsApi`)
  - [src/lib/api/endpoints/teacher-exam-tests.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/endpoints/teacher-exam-tests.ts) (`teacherExamTestsApi`)
  - Export tập trung tại [src/lib/api/endpoints/index.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/endpoints/index.ts).
- **Cập nhật [src/lib/sanitize/html.ts](file:///d:/WORK/WEB-IELTS/src/lib/sanitize/html.ts):** Bổ sung `isSafeAudioStreamUrl(rawUrl, allowMockDataUrl)` cho phép URL tương đối `/...` và `http(s):` trong mọi môi trường, và chỉ cho phép `data:audio/*;base64,...` hợp lệ khi `isMockApiMode()` bật (chặn tuyệt đối `javascript:` và `data:` trong production).
- **Tạo mới & Tích hợp Mock Adapter (`NEXT_PUBLIC_API_MODE=mock`):**
  - [src/lib/api/mocks/exam-v2.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/mocks/exam-v2.ts): Seed đầy đủ `exam-read-full-01` (3 Passages, 15 câu thuộc nhiều dạng IELTS), `exam-list-full-01` (4 Sections kèm transcript giáo viên + `audioAsset`), `exam-read-part-02`, `exam-read-draft-01`, lượt đạt mẫu `att-seed-r1-p1-pass`, bản dịch `mtr-seed-01`; thực thi kiểm tra `409 ANSWERS_REVISION_CONFLICT`, idempotency khi submit, ngưỡng 70% mở khóa review & dịch theo passage, CRUD/validate/preview/publish/new-version/archive cho giáo viên.
  - Cập nhật [src/lib/api/mocks/data.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/mocks/data.ts) & [src/lib/api/mocks/router.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/mocks/router.ts): Nạp state `examV2`, xử lý route v2 và mở rộng `POST /assignments` nhận scope `PART`/`FULL`.

### 2.2 Exam Session Engine, Renderers & Navigation
- **Engine Hooks & Helpers:**
  - [src/lib/exam/question-meta.ts](file:///d:/WORK/WEB-IELTS/src/lib/exam/question-meta.ts): Nhãn tiếng Việt cho 15 `ExamQuestionType`, hàm chuẩn hóa `serializeAttemptAnswers`, `isAnsweredValue`, `countAnsweredQuestions`, `countWords`, `formatExamDurationSeconds`.
  - [src/lib/exam/use-exam-timer.ts](file:///d:/WORK/WEB-IELTS/src/lib/exam/use-exam-timer.ts): Đồng bộ lệch đồng hồ client với `serverTime` / `expiresAt` / `remainingSeconds` từ backend và tự động kích hoạt callback `onExpire`.
  - [src/lib/exam/use-exam-autosave.ts](file:///d:/WORK/WEB-IELTS/src/lib/exam/use-exam-autosave.ts): Hàng đợi lưu nháp có debounce, backup cục bộ `sessionStorage` theo `attemptId`, phục hồi tự động khi gặp `409 ANSWERS_REVISION_CONFLICT` mà không làm mất câu trả lời chưa đồng bộ ở tab hiện tại, và `flushBeforeSubmit`.
- **Exam UI Components:**
  - [src/components/exam/question-renderer-v2.tsx](file:///d:/WORK/WEB-IELTS/src/components/exam/question-renderer-v2.tsx) (`ExamQuestionGroupRenderer` hỗ trợ trọn vẹn 15 dạng câu hỏi IELTS Academic).
  - [src/components/exam/exam-shell.tsx](file:///d:/WORK/WEB-IELTS/src/components/exam/exam-shell.tsx) (`ExamShell`, `ExamTimer`, `ExamProgress`, `AutosaveIndicator`, `QuestionNavigator`, `SubmitConfirmationDialog`, `AttemptResumeDialog`, `ExamErrorBoundary`).
  - [src/components/exam/exam-listening-player.tsx](file:///d:/WORK/WEB-IELTS/src/components/exam/exam-listening-player.tsx) (`ExamListeningPlayer` tuân thủ chính sách `allowSeek`, `allowPause`, `maxPlayCount`, kiểm tra URL phát an toàn qua `isSafeAudioStreamUrl`).
  - [src/components/exam/reading-exam-view.tsx](file:///d:/WORK/WEB-IELTS/src/components/exam/reading-exam-view.tsx) & [src/components/exam/listening-exam-view.tsx](file:///d:/WORK/WEB-IELTS/src/components/exam/listening-exam-view.tsx).
  - Cập nhật [src/components/student/signed-audio-player.tsx](file:///d:/WORK/WEB-IELTS/src/components/student/signed-audio-player.tsx) dùng chung `isSafeAudioStreamUrl` để phát audio an toàn ở cả v1 `sa-02` mock mode lẫn signed URL `live`.
  - Cập nhật [src/components/ui/button.tsx](file:///d:/WORK/WEB-IELTS/src/components/ui/button.tsx) (bổ sung `size: "lg"` và `loading?: boolean`).
- **Điều hướng & Shell:**
  - Cập nhật [src/lib/auth/roles.ts](file:///d:/WORK/WEB-IELTS/src/lib/auth/roles.ts) (`Luyện thi IELTS` `/student/practice`, `Kho đề thi IELTS` `/teacher/question-bank`, bảng tiêu đề route & `getDocumentTitleForPathname`), [src/components/layout/portal-shell.tsx](file:///d:/WORK/WEB-IELTS/src/components/layout/portal-shell.tsx) & [src/components/student/student-portal-shell.tsx](file:///d:/WORK/WEB-IELTS/src/components/student/student-portal-shell.tsx) (ẩn sidebar trái tại phòng thi tập trung `/student/exam/[attemptId]` trong khi vẫn giữ nguyên `RoleGuard` và giữ sidebar đầy đủ tại `/result` & `/translate`).

### 2.3 Các Trang Học viên & Giảng viên
- **Student Routes:**
  - [src/app/student/practice/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/student/practice/page.tsx) — Thư viện luyện thi IELTS (lọc kỹ năng Reading/Listening, tìm kiếm, phạm vi `PART`/`FULL`).
  - [src/app/student/practice/[testId]/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/student/practice/[testId]/page.tsx) — Chi tiết đề, chọn mode động theo `allowedModes`, khôi phục attempt đang làm dở.
  - [src/app/student/exam/[attemptId]/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/student/exam/[attemptId]/page.tsx) — Phòng thi máy tính CBT thống nhất cho Reading & Listening.
  - [src/app/student/exam/[attemptId]/result/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/student/exam/[attemptId]/result/page.tsx) — Kết quả chấm từ backend, cổng 70% PASS mở đáp án chi tiết (`answerReviewAvailable`), CTA dịch đối chiếu có điều kiện chỉ dành cho Reading (`translationEligible`).
  - [src/app/student/reading/[testId]/translate/[passageId]/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/student/reading/[testId]/translate/[passageId]/page.tsx) — Không gian dịch đa Passage song ngữ, thanh chọn Passage theo `eligibility`, xử lý `403 TRANSLATION_LOCKED`, lưu nháp kèm revision, nộp bài và xem nhận xét giảng viên.
  - Cập nhật [src/app/student/assignments/[studentAssignmentId]/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/student/assignments/[studentAssignmentId]/page.tsx) — Bổ sung banner mở phòng thi CBT khi bài tập gắn `examTestId` mà vẫn giữ nguyên luồng nộp bài v1.
- **Teacher Routes & Builder:**
  - [src/components/teacher/exam-test-builder.tsx](file:///d:/WORK/WEB-IELTS/src/components/teacher/exam-test-builder.tsx) — Trình biên soạn Passage/Section, 15 dạng câu hỏi, đáp án/biến thể, giải thích, audio upload và transcript chỉ dành cho giáo viên.
  - [src/app/teacher/question-bank/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/question-bank/page.tsx) — Kho đề thi IELTS v2 (tìm kiếm, lọc trạng thái, validate, publish, new version, archive).
  - [src/app/teacher/question-bank/new/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/question-bank/new/page.tsx), [src/app/teacher/question-bank/[testId]/edit/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/question-bank/[testId]/edit/page.tsx), [src/app/teacher/question-bank/[testId]/preview/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/question-bank/[testId]/preview/page.tsx), [src/app/teacher/question-bank/full-test-builder/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/question-bank/full-test-builder/page.tsx).
  - Mở rộng [src/app/teacher/assignments/new/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/assignments/new/page.tsx) (chọn đề v2, phạm vi `PART` / `FULL`, `requiredPartId`, ghi đè thời lượng và số lượt làm).
  - Mở rộng [src/app/teacher/translations/page.tsx](file:///d:/WORK/WEB-IELTS/src/app/teacher/translations/page.tsx) (bổ sung bộ chuyển `Theo Passage IELTS v2` song song chế độ v1 `Theo Bài tập khóa học`).

### 2.4 Kiểm thử Tự động (Unit, Contract, Component & E2E)
- [src/lib/api/exam-v2-contracts.test.ts](file:///d:/WORK/WEB-IELTS/src/lib/api/exam-v2-contracts.test.ts) — Kiểm tra strip DTO học viên, kiểm soát ngưỡng 70%, optimistic revision conflict `409`, idempotency submit, lifecycle tạo/publish/versioning của giáo viên.
- [src/components/exam/exam-v2.test.tsx](file:///d:/WORK/WEB-IELTS/src/components/exam/exam-v2.test.tsx) — Kiểm tra render tương tác cả 15 `ExamQuestionType`, luồng Học viên (Library -> Mode -> CBT Exam -> Result -> Multi-passage Translation + Audio Player), luồng Giảng viên (Question Bank -> Create -> Preview -> Full Test Builder -> Assignment v2 -> Passage Review) và khôi phục `409 ANSWERS_REVISION_CONFLICT` trên `useExamAutosave`.
- Mở rộng [e2e/ielts-lms.spec.ts](file:///d:/WORK/WEB-IELTS/e2e/ielts-lms.spec.ts) — Bổ sung kịch bản E2E Phase 9 đầy đủ qua trình duyệt Microsoft Edge headless, kiểm tra Axe WCAG 2.1 AA và kiểm tra không tràn ngang trên viewport desktop (`1280x800`) lẫn mobile (`390x844`).

---

## 3. Kỹ thuật Modern Web & Khả năng Tiếp cận (Accessibility) đã Áp dụng
- Native `<dialog>` top-layer (`showModal()`, ESC close, backdrop click) qua `ConfirmDialog` và `ModalDialog` kết hợp bẫy tiêu điểm và focus return.
- Native `<progress>` trong `ExamProgress` với style tách biệt chuẩn WebKit/Moz và thuộc tính `aria-label`.
- Media HTML5 `<audio controls>` không dùng `loading="lazy"`, tự làm mới URL ký số an toàn (`SignedAudioPlayer`) và ràng buộc `allowSeek`/`allowPause`/`maxPlayCount` trên `ExamListeningPlayer`.
- CSS Layout `scrollbar-gutter: stable`, grid linh hoạt (`minmax(...)`) chống giật layout giữa trang ngắn/dài và chia đôi đọc/câu hỏi không tràn ngang (`overflow-x`).
- DOM sanitization chặt chẽ qua `SafeHtml` (`Element.prototype.setHTML` fallback `DOMPurify` với `ALLOW_ARIA_ATTR: false`, `ALLOW_DATA_ATTR: false`, `KEEP_CONTENT: false`).
- Kiểm tra tương phản màu WCAG 2.1 AA bằng `@axe-core/playwright` (phát hiện và nâng độ tương phản badge đếm số câu ở tab Passage/Section từ `bg-blue-500` lên `bg-blue-800` đạt > 8.5:1).

