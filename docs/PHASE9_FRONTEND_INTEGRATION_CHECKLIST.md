# PHASE 9 FRONTEND INTEGRATION CHECKLIST & HANDOFF

**Ngày cập nhật:** 2026-11-12  
**Chế độ chạy hiện tại:** `NEXT_PUBLIC_API_MODE=mock` (trình duyệt & unit test chạy trên adapter dữ liệu cục bộ; **CHƯA kiểm chứng trên live backend** vì `http://localhost:4000/api/v1` không phản hồi và thiếu `docs/openapi.json` / `docs/PHASE9_FRONTEND_HANDOFF.md`).

---

## 1. Ma trận Điểm cuối API (Frontend Typed Boundary vs. Contract v2)

| Thành phần FE | Endpoint & Method tiêu thụ trong FE | Tài liệu tham chiếu Contract v2 | Khác biệt / Lưu ý cần khớp khi nối Backend thật | Trạng thái Live |
|---|---|---|---|---|
| `examTestsApi.list` | `GET /exam-tests?skill=&mode=&difficulty=&search=&page=&limit=` | §4.1A `GET /exam-tests` | `ExamTestSummary` dùng `totalDurationSeconds`, `partCount`, `parts[].available` | **BLOCKED (no BE)** |
| `examTestsApi.getById` | `GET /exam-tests/:testId` | §4.1A `GET /exam-tests/:id` | Parse qua `ExamTestDetailStudentSchema.strip()` để chặn rò rỉ đáp án/transcript | **BLOCKED** |
| `examTestsApi.getPart` | `GET /exam-tests/:testId/parts/:partId` | §4.1C | FE đọc `passageTitle`, `passageHtml`, `paragraphs[]`, `audioAsset`, `questionGroups[]` | **BLOCKED** |
| `examAttemptsApi.start` | `POST /exam-attempts` (gửi `Idempotency-Key` header) | §4.1B `POST /exam-attempts` | Contract gợi ý `idempotencyKey` trong JSON body và trả `answersRevision`; FE gửi header `Idempotency-Key` + đọc field `revision` | **Cần chốt OpenAPI** |
| `examAttemptsApi.getById` | `GET /exam-attempts/:attemptId` | §5.1 `GET /exam-attempts/:id` | FE cần `revision`, `expiresAt`, `serverTime`, `remainingSeconds`, `parts[]` | **BLOCKED** |
| `examAttemptsApi.saveAnswers` | `PUT /exam-attempts/:attemptId/answers` | §4.1D `PUT .../answers` | **Sai khác payload:** Contract §4.1D ví dụ `answers: [{ questionId, value }]` và response `answersRevision` / `savedQuestionIds`; FE typed boundary đang gửi `answers: Record<string, ExamAnswerValue>` + `flaggedQuestionIds` và nhận `revision` / `answeredCount` / `remainingSeconds` | **Cần đồng bộ OpenAPI** |
| `examAttemptsApi.submit` | `POST /exam-attempts/:attemptId/submit` | §4.1E `POST .../submit` | **Sai khác field:** Contract §4.1E dùng `questionCount`, `passScore`, `translation: { available, unlockedPassageIds }`; FE dùng `totalQuestions`, `passThresholdPercent`, `translationEligible`, `partBreakdown[]` | **Cần đồng bộ OpenAPI** |
| `examAttemptsApi.getResult` | `GET /exam-attempts/:attemptId/result` | §4.1E | Trả `ExamResultResponseSchema` (không lộ đáp án đúng khi `answerReviewAvailable = false`) | **BLOCKED** |
| `examAttemptsApi.getReview` | `GET /exam-attempts/:attemptId/review` | §4.1F `GET .../review` | Kỳ vọng `403 ANSWER_REVIEW_LOCKED` khi chưa đạt 70% | **BLOCKED** |
| `readingTranslationsApi.*` | `GET /reading-translations/eligibility?testId=...`, `GET/PUT/POST /reading-translations/:passageId*`, `GET /teacher/reading-translations`, `POST /teacher/reading-translations/:id/review` | §4.2 `reading-translations` | Contract §4.2 ví dụ field `unlocked` & `ordinal` cho mỗi passage và query `studentAssignmentId`; FE dùng `eligible` & `partNumber`. Cần chốt nếu Passage lấy từ `student-assignments` hay resource riêng | **Cần chốt OpenAPI** |
| `teacherExamTestsApi.*` | CRUD `/teacher/exam-tests*`, `.../parts`, `.../question-groups`, `.../validate`, `.../preview`, `.../publish`, `.../new-version`, `.../archive` | §4.3 Teacher Question Bank | Full Test Builder hiện POST toàn bộ `UpsertExamPartInput` kèm `sourcePartId` tùy chọn (do Contract v2 chưa có endpoint `attach-existing-part`) | **Cần chốt nếu BE muốn `attach-part` theo ID** |
| `mediaApi.*` | `POST /media/audio/upload-init` -> `PUT uploadUrl` -> `POST /media/audio/upload-complete` & `GET /media/audio/:assetId/playback` | Contract §4.3 ghi `upload-intent` | FE giữ chuẩn v1 (`upload-init` + `upload-complete`) đã xác nhận tương thích; nếu BE đổi route sang `upload-intent` cần cập nhật `src/lib/api/endpoints/media.ts` | **Cần xác nhận tên route upload** |
| `assignmentsApi.create` | `POST /assignments` | §4.4 Teacher Assignments | Gửi `exerciseId`, `examTestId?`, `requiredScope?`, `requiredPartId?`, `allowedModes?`, `durationSecondsOverride?`, `maxAttempts?` | **Cần BE hỗ trợ schema mở rộng** |

---

## 2. Khoảng trống / Tính năng Chờ Backend Hoàn thiện

1. **Chuyển đổi & Kiểm thử `live` API:** Chưa thể chạy smoke test thật vì `http://localhost:4000/api/v1` không hoạt động và chưa có `docs/openapi.json` hoặc `docs/PHASE9_FRONTEND_HANDOFF.md`.
2. **Trình phát Audio Listening trong Mock vs. Live:** Ở chế độ mock, `GET /media/audio/:id/playback` trả về chuỗi WAV rỗng inline (`data:audio/wav;base64,...`). Khi nối live backend, BE phải trả signed HTTPS URL (hoặc đường dẫn cùng origin `/...`); frontend sẽ chặn URL không an toàn (kể cả `data:`) ngoài mock mode.
3. **Interactive Diagram Hotspots:** Kiểu câu hỏi `DIAGRAM_LABEL_COMPLETION` hiện hỗ trợ hiển thị ảnh sơ đồ `diagramImageUrl` + nhập nhãn theo `blankLabel`; trường tọa độ tương tác trên ảnh (`diagramCoordinates`) chưa được bật vì contract chưa chốt schema tọa độ.
4. **Hàng chờ `AUTO_SUBMITTED` từ Worker hết giờ:** Frontend xử lý đồng nhất cả hai trạng thái trả về từ backend là `"SUBMITTED"` và `"EXPIRED"` trong `ExamResultResponseSchema`; nếu backend dùng thêm enum `"AUTO_SUBMITTED"`, cần bổ sung vào `ExamResultResponseSchema` (`src/lib/api/schemas.ts`) và `ExamAttemptStatusSchema`.

---

## 3. Hướng dẫn Chạy & Kiểm thử Thủ công (Local Mock Mode)

### Khởi động Ứng dụng Phát triển
1. Đảm bảo tệp `.env.local` chứa:
   ```dotenv
   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
   NEXT_PUBLIC_API_MODE=mock
   NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh
   ```
2. Chạy server dev: `npm run dev` và truy cập `http://localhost:3000/login`.

### Tài khoản & Kịch bản Kiểm thử Nhanh
- **Học viên (`student@ielts.vn` / mật khẩu bất kỳ ở mock mode):**
  1. Vào mục **Luyện thi IELTS** (`/student/practice`), mở **IELTS Academic Reading Full Test 01**.
  2. Chọn chế độ **Luyện từng phần (Part Practice)** -> chọn **Passage 2** -> nhấn **Bắt đầu luyện Part đã chọn**.
  3. Tại phòng thi CBT (`/student/exam/...`), trả lời Q6=`i`, Q7=`iii`, Q8=`clover`, Q9=`18`, Q10=`NO` -> nhấn **Nộp bài**.
  4. Kiểm tra màn hình Kết quả (`/student/exam/.../result`) đạt `100% ĐẠT`, mở được đáp án chi tiết, nhấn **Dịch Passage ngay**.
  5. Tại `/student/reading/exam-read-full-01/translate/part-r1-p2`, kiểm tra Passage 3 đang bị khóa, thử nhập bản dịch tiếng Việt -> **Lưu nháp** -> **Nộp bản dịch**.
- **Giảng viên (`teacher@ielts.vn` / mật khẩu bất kỳ ở mock mode):**
  1. Vào **Kho đề thi IELTS** (`/teacher/question-bank`), kiểm tra đề `Published` và `Draft`.
  2. Nhấn xem trước `/teacher/question-bank/exam-list-full-01/preview` để xác nhận không rò rỉ `TEACHER ONLY TRANSCRIPT` hay đáp án.
  3. Mở **Ghép đề Full Test** (`/teacher/question-bank/full-test-builder`) hoặc **Tạo đề mới** (`/teacher/question-bank/new`) để thử tạo/validate/publish.
  4. Mở **Giao bài tập mới** (`/teacher/assignments/new`), chọn `IELTS Academic Reading Full Test 01`, chọn scope `1 Part cụ thể` (`PART`).
  5. Mở **Chấm bài dịch** (`/teacher/translations`), chuyển sang nút **Theo Passage IELTS v2** để chấm bản dịch học viên.

---

## 4. Các Bước Tiếp theo khi Kết nối Live Backend

1. Lấy `docs/openapi.json` và `docs/PHASE9_FRONTEND_HANDOFF.md` từ đội Backend khi các endpoint Phase 9 đã chạy ổn định.
2. Đối chiếu lại các trường DTO có sai khác đã liệt kê ở Mục 1 (đặc biệt định dạng `answers` trên `PUT /answers`, field `revision` vs `answersRevision`, `SUBMITTED` vs `AUTO_SUBMITTED`, `POST /media/audio/upload-intent` vs `upload-init`, `unlocked` vs `eligible`) và cập nhật `src/lib/api/types.ts`, `src/lib/api/schemas.ts`, `src/lib/api/endpoints/*.ts`.
3. Cập nhật `.env.local` sang `NEXT_PUBLIC_API_MODE=live`, khởi động Backend tại `http://localhost:4000/api/v1` và chạy smoke E2E AC-01 → AC-20 theo `docs/IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md`.

---

## 5. Lệnh Kiểm tra Chất lượng Chuẩn

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

