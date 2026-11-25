# 07 — BE ↔ FE Contract Drift Audit Report

**Verified Date:** 2026-11-25  
**Resolution Status:** **14/14 actionable drifts RESOLVED** (`DRIFT-01`..`DRIFT-13`, `DRIFT-16`); 3 architectural/documentation notes (`DRIFT-14`, `DRIFT-15`, `DRIFT-17`) intentionally retained.  
**Scope:** Đối chiếu trực tiếp toàn bộ **22 Backend controllers + DTOs + 18 Mongoose schemas** với **19 Frontend endpoint modules + Zod schemas + `client.ts`**.  
**Mức độ ưu tiên:**
- **P0 (Breaking):** Gây lỗi `400`/`404` thực tế trên runtime (đặc biệt do `ValidationPipe({ forbidNonWhitelisted: true })` bật toàn cục).
- **P1 (Type/Shape/Enum Mismatch):** Sai lệch enum, MIME type, hoặc schema validation có thể gây crash/reject ở edge case.
- **P2 (Redundant / Unused / Overlap):** Endpoint đã tồn tại ở BE nhưng FE chưa dùng (waterfall), hoặc route thừa/legacy overlap.
- **P3 (Doc / Tooling Drift):** Tài liệu cũ hoặc script export OpenAPI chưa khớp runtime.

---

## 1. P0 — Breaking Drifts (Cần ưu tiên xử lý sớm)

| ID | Thành phần | Thực trạng Backend | Thực trạng Frontend | Tác động & Hướng xử lý đề xuất |
| :--- | :--- | :--- | :--- | :--- |
| **DRIFT-01** | `POST /lessons` (`courseId` trong body) | `LessonsController.createDirect` dùng `@Body() dto: CreateLessonDto & { courseId?: string }` (`lessons.controller.ts:439`), nhưng `CreateLessonDto` (`create-lesson.dto.ts`) **không có field `courseId`**. | `lessonsApi.create()` (`lessons.ts:248`) gửi `POST /lessons` với `courseId` trong body. | **400 Bad Request** do `forbidNonWhitelisted: true` loại/chặn property không có decorator. **Fix:** Thêm `@IsOptional() @IsMongoId() courseId?: string` vào `CreateLessonDto` hoặc đổi FE sang gọi `POST /courses/:courseId/lessons`. |
| **DRIFT-02** | `PATCH /assignments/:id` (`dueAt` & `status`) | `UpdateAssignmentDto` (`update-assignment.dto.ts`) nhận `deadlineAt` (không có `dueAt`) và `AssignmentStatus` (không có `'active'`). | `assignmentsApi.update()` (`assignments.ts:377`) gửi `UpdateAssignmentRequest` (`{ title?, dueAt?, status?: "scheduled" | "active" | "closed" }`). | **400 Bad Request** khi FE gửi `dueAt` hoặc `status: "active"`. **Fix:** Thêm alias `@IsOptional() @IsDateString() dueAt?: string` ở BE hoặc map `dueAt → deadlineAt` & chuẩn hóa enum `status` ở FE. |
| **DRIFT-03** | `GET /assignments/mine` (`assignedDate` query) | `AssignmentQueryDto` (`assignment-query.dto.ts`) chỉ cho phép `page, limit, courseId, status, from, to` — **không có `assignedDate`**. | `assignmentsApi.listMine({ assignedDate })` (`assignments.ts:342`) truyền `assignedDate` lên query string. | **400 Bad Request** mỗi khi FE filter theo ngày giao bài. **Fix:** Thêm `@IsOptional() @IsString() assignedDate?: string` vào `AssignmentQueryDto`. |
| **DRIFT-04** | `GET /teacher/reading-translations` (`testId` query) | `TeacherTranslationQueryDto` (`reading-translation.dto.ts:1068`) chỉ cho phép `courseId, status, page, limit` — **không có `testId`**. | `readingTranslationsApi.listTeacherQueue({ testId })` (`reading-translations.ts:48`) truyền `testId` lên query string. | **400 Bad Request** khi giáo viên lọc hàng đợi bài dịch theo `testId`. **Fix:** Thêm `@IsOptional() @IsMongoId() testId?: string` vào `TeacherTranslationQueryDto` và filter trong service. |
| **DRIFT-05** | `POST /auth/forgot-password` & `POST /auth/reset-password` | `AuthController` (`auth.controller.ts`) **không có** 2 route này. | `authApi.forgotPassword` và `authApi.resetPassword` (`auth.ts:591-607`) gọi trực tiếp 2 route này. | **404 Not Found** trên live backend. **Fix:** Implement 2 endpoint ở BE hoặc ẩn/vô hiệu hóa flow quên mật khẩu trên UI cho đến khi có mail token flow. |
| **DRIFT-06** | `POST /exercises/:id/versions` | `ExercisesController` (`exercises.controller.ts`) **không có** route `/:id/versions` (chỉ tăng `version` trong `PATCH /exercises/:id`). | `exercisesApi.createVersion(id)` (`exercises.ts:55`) gọi `POST /exercises/:id/versions`. | **404 Not Found** nếu UI gọi tạo version mới cho legacy exercise. **Fix:** Chuyển hẳn sang Exam V2 (`POST /teacher/exam-tests/:testId/new-version`) hoặc bổ sung alias nếu vẫn dùng legacy. |
| **DRIFT-07** | `client.ts` tự chèn `idempotencyKey` vào JSON body | `ValidationPipe({ forbidNonWhitelisted: true })` từ chối mọi field dư không khai báo trong DTO. Hiện chỉ một số DTO (`CreateAssignmentDto`, `CreateExamAttemptDto`, `SubmitAttemptDto`, `CreateNotificationDto`) có `idempotencyKey`. | `frontend/src/lib/api/client.ts:158-168` tự động chèn `idempotencyKey` vào JSON body **bên cạnh** header `Idempotency-Key`. | Bất kỳ endpoint mới/cũ nào có truyền `idempotencyKey` mà DTO chưa khai báo field này sẽ bị **400 Bad Request**. **Fix:** Chuẩn hóa chỉ gửi qua header `Idempotency-Key` (hoặc tạo base DTO/decorator chuẩn cho mọi mutating endpoint cần idempotency). |

---

## 2. P1 — Type, Validation & Enum Mismatches

| ID | Thành phần | Thực trạng Backend | Thực trạng Frontend | Tác động & Hướng xử lý đề xuất |
| :--- | :--- | :--- | :--- | :--- |
| **DRIFT-08** | Audio upload MIME types (`POST /media/audio/upload-intent`) | `AudioUploadIntentDto` (`media.dto.ts:11`) chỉ cho phép: `audio/mpeg`, `audio/mp3`, `audio/wav`, `audio/ogg`, `audio/m4a`. | `teacher-exam-tests.ts:31-41` cho phép thêm `audio/x-wav`, `audio/mp4` (mặc định của `.m4a` trên trình duyệt), `audio/x-m4a`, `audio/aac`, `audio/webm`. | Upload file `.m4a` hoặc `.webm` từ trình duyệt bị BE reject **400 Bad Request**. **Fix:** Đồng bộ danh sách MIME types giữa `AudioUploadIntentDto` và `ALLOWED_AUDIO_MIME_TYPES`. |
| **DRIFT-09** | `NotificationType` enum | `new_assignment`, `overdue`, `course_enrolled`, `extension_reviewed`, `other` (`enums.ts:418`). | `assignment_new`, `overdue`, `course_added`, `extension_decided` (`schemas.ts:462`). | Sai lệch 4/5 giá trị enum; nếu FE parse bằng `NotificationItemSchema` trực tiếp sẽ fail Zod. **Fix:** Thống nhất 1 bộ enum duy nhất (ưu tiên dùng giá trị BE làm canonical và update FE). |
| **DRIFT-10** | `AssignmentStatus` & `StudentAssignmentStatus` | `AssignmentStatus` có 8 giá trị; `StudentAssignmentStatus` có `completed`, `excused` (không có `extended`). | `AssignmentStatusSchema` chỉ có 3 giá trị (`scheduled`, `active`, `closed`); `StudentAssignmentStatusSchema` có `extended` (thiếu `completed`, `excused`). | Lệch trạng thái hiển thị badge/filter giữa BE & FE. **Fix:** Đồng bộ 1:1 theo `enums.ts`. |
| **DRIFT-11** | `EnrollmentStatus`, `LessonStatus`, `ExtensionRequestStatus`, `TranslationSubmissionStatus`, `AttemptStatus` | BE dùng `dropped` (Enrollment), không có `live` (Lesson), có `cancelled` (Extension), chỉ có `draft/submitted/reviewed` (Translation), có `AUTO_SUBMITTED` (Attempt). | FE dùng `withdrawn` (Enrollment), có `live` (Lesson), thiếu `cancelled` (Extension), có `needs_revision`/`approved` (Translation), dùng `ABANDONED` thay `AUTO_SUBMITTED` ở `ExamAttemptStatusSchema`. | Có thể fail `ZodError` (HTTP 422 giả lập ở FE) khi nhận dữ liệu thật từ BE. **Fix:** Đồng bộ toàn bộ enum trong `frontend/src/lib/api/schemas.ts` theo bảng ở [06-data-models-and-enums.md](./06-data-models-and-enums.md). |
| **DRIFT-12** | `POST /assignments` bỏ sót `allowRetake` ở FE | `CreateAssignmentDto` hỗ trợ `allowRetake?: boolean`. | `assignmentsApi.create()` (`assignments.ts:309-340`) nhận `CreateAssignmentRequest` có `allowRetake` nhưng không đưa vào `body`. | Giáo viên bật `allowRetake` trên form sẽ không được gửi lên BE. **Fix:** Bổ sung `if (payload.allowRetake !== undefined) body.allowRetake = payload.allowRetake;`. |

---

## 3. P2 — Redundant Waterfalls, Orphan Endpoints & Legacy Overlap

| ID | Mô tả | Chi tiết | Khuyến nghị |
| :--- | :--- | :--- | :--- |
| **DRIFT-13** | Dashboard & Profile live-mode waterfall | BE đã có `GET /dashboard/student`, `GET /dashboard/teacher`, `GET /students/me/profile`, `GET /teachers/me/profile` (`dashboard.controller.ts`), nhưng FE (`dashboard.ts`, `auth.ts`) chỉ gọi chúng ở **mock mode**, còn live mode gọi nối tiếp 4–5 API lẻ và hardcode `overdueStudentsCount: 0`, `recentAssignments: []`, `recentScores: []`, `enrolledCoursesCount: 0`. | Chuyển live mode của FE sang gọi thẳng 4 endpoint tổng hợp ở `DashboardController` sau khi xác nhận shape khớp `StudentDashboardResponseSchema` / `TeacherDashboardResponseSchema`. |
| **DRIFT-14** | BE endpoints chưa có FE consumer | `DELETE /courses/:id`, `PATCH /users/:id/status`, `PATCH /lessons/:id/cancel`, `DELETE /lessons/:id`, `POST /assignments/validate`, `POST /assignments/preview`, `GET /assignments/:id/preview`, `POST /assignments/:id/backfill-students`, `POST /extension-requests/:id/cancel`, `PATCH /notifications/read-all`, `GET /audit-logs`, `POST /jobs/deadlines/trigger`, `GET /jobs/health`, `POST /deadlines/process-overdue`, `GET /deadlines/overdue`. | Ghi nhận là hợp lệ (Ops/Admin hoặc tính năng BE đã sẵn sàng cho UI tích hợp ở phase tiếp theo). |
| **DRIFT-15** | Song song Legacy V1 vs Exam V2 | `exercises`, `submissions`, `translations` (V1) đang chạy song song với `exam-tests`, `exam-attempts`, `reading-translations` (V2), và `student-assignments.controller.ts` làm cầu nối hybrid cho cả hai. | Giữ đóng băng V1; mọi tính năng mới chỉ đi qua V2 (theo [08-extension-and-versioning-guide.md](./08-extension-and-versioning-guide.md)). |

---

## 4. P3 — Documentation & Tooling Drift

| ID | Mô tả | Chi tiết | Khuyến nghị |
| :--- | :--- | :--- | :--- |
| **DRIFT-16** | `export-openapi.ts` thiếu global prefix `/api/v1` | `Backend/src/database/scripts/export-openapi.ts` tạo Swagger document **không gọi `app.setGlobalPrefix('api/v1')`**, khiến paths trong `Backend/docs/openapi.json` thiếu `/api/v1` so với runtime `main.ts`. | Bổ sung `app.setGlobalPrefix('api/v1')` trong `export-openapi.ts` trước khi chạy `npm run export:openapi`. |
| **DRIFT-17** | Tài liệu contract cũ lỗi thời | `Backend/docs/FRONTEND_API_CONTRACT.md` (v1.0) và `docs/IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md` (proposed) không còn khớp 100% codebase hiện tại. | Dùng bộ `docs/contract/` làm nguồn sự thật duy nhất (SSOT). |
