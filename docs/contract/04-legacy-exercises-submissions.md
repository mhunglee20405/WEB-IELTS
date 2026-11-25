# 04 — Legacy Exercises, Submissions & Translations Contract

**Lifecycle Status:** `Legacy (Coexisting)`  
**Backend Controllers:** `exercises.controller.ts`, `submissions.controller.ts`, `translations.controller.ts`  
**Frontend Consumers:** `frontend/src/lib/api/endpoints/exercises.ts` (và `student-assignments.ts` cho `PATCH /translations/:id/review`)

> **Quy tắc kiến trúc:** Các endpoint trong tài liệu này thuộc **thế hệ V1 (Legacy)** trước khi có Exam Modes V2 (`exam-tests` / `exam-attempts` / `reading-translations`). Hệ thống vẫn duy trì song song để đảm bảo tương thích ngược với dữ liệu/màn hình cũ. **Mọi tính năng mới về ngân hàng đề, làm bài thi và dịch Reading BẮT BUỘC phát triển trên [03-exam-v2-attempts-translations.md](./03-exam-v2-attempts-translations.md).**

---

## 1. Ranh giới Legacy (V1) vs. Canonical (V2)

| Tiêu chí | Legacy (V1 — File này) | Canonical (V2 — File `03`) |
| :--- | :--- | :--- |
| Ngân hàng đề | `/exercises` (`Exercise` schema, phẳng 1 passage + 1 mảng `questions[]`) | `/exam-tests` & `/teacher/exam-tests` (`ExamTest` → `parts[]` → `questionGroups[]` → `questions[]`) |
| Chế độ làm bài | Chỉ 1 kiểu nộp thẳng (`POST /assignments/:id/submissions`) | Hỗ trợ `PART` (từng Passage/Section) & `FULL` test, autosave, timer, `baseRevision` |
| Lưu bài làm | `submissions` (chấm trực tiếp khi submit) | `exam_attempts` (stateful session engine) + đồng bộ tiến độ sang `student_assignments` |
| Dịch Reading | `/assignments/:id/translations` (1 bản dịch / assignment) | `/reading-translations/:passageId` (mở khóa độc lập theo từng passage khi PASS ≥70%) |
| Quy tắc mở rộng | **Đóng băng** — chỉ bảo trì bug, không thêm feature | **Canonical** — chuẩn để mở rộng Writing/Speaking/Question Types mới |

---

## 2. Endpoint Summary Table

| Method | Full Path (`/api/v1/...`) | Auth / Roles | FE Consumer | Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/exercises` | `ADMIN`, `TEACHER` | `exercisesApi.create` | Legacy |
| `GET` | `/exercises` | `ADMIN`, `TEACHER` | `exercisesApi.list` | Legacy |
| `GET` | `/exercises/:id` | Authenticated *(Student sanitized)* | `exercisesApi.getById` | Legacy |
| `PATCH` | `/exercises/:id` | `ADMIN`, `TEACHER` | `exercisesApi.update` | Legacy |
| `POST` | `/exercises/:id/publish` | `ADMIN`, `TEACHER` | `exercisesApi.publish` | Legacy |
| `POST` | `/exercises/:id/archive` | `ADMIN`, `TEACHER` | *(BE-only)* | Legacy |
| `DELETE` | `/exercises/:id` | `ADMIN`, `TEACHER` | *(BE-only, soft-archive)* | Legacy |
| `POST` | `/assignments/:id/submissions` | `STUDENT` | *(FE dùng `/student-assignments/:id/submissions`)* | Legacy |
| `GET` | `/assignments/:id/submissions/mine` | `STUDENT` | *(BE-only)* | Legacy |
| `GET` | `/assignments/:id/answers` | `STUDENT` *(PASS ≥70%)*, `TEACHER`, `ADMIN` | *(FE dùng `/student-assignments/:id/review`)* | Legacy |
| `GET` | `/assignments/:id/submissions` | `ADMIN`, `TEACHER` | *(BE-only)* | Legacy |
| `GET` | `/submissions/:id` | `STUDENT`, `TEACHER`, `ADMIN` | *(BE-only)* | Legacy |
| `POST` | `/assignments/:id/translations` | `STUDENT` | *(FE dùng `/student-assignments/:id/translation/submit`)* | Legacy |
| `GET` | `/assignments/:id/translations/mine` | `STUDENT` | *(FE dùng `/student-assignments/:id/translation`)* | Legacy |
| `GET` | `/assignments/:id/translations` | `ADMIN`, `TEACHER` | *(BE-only)* | Legacy |
| `PATCH` | `/translations/:id/review` | `ADMIN`, `TEACHER` | `studentAssignmentsApi.reviewTranslation` | Legacy |
| `POST` | `/translations/:id/review` | `ADMIN`, `TEACHER` | *(BE POST alias)* | Legacy |

> **Drift lưu ý:** Frontend `exercisesApi.createVersion(id)` gọi `POST /exercises/:id/versions`, nhưng `ExercisesController` **không có route này** (xem `07-drift-audit-be-fe.md`).

---

## 3. Detailed Endpoint Specifications

### 3.1 Exercises (`/exercises`)

#### `POST /api/v1/exercises` (`ADMIN`, `TEACHER`, HTTP 201)
- **Body (`CreateExerciseDto`):**
  ```ts
  {
    title: string;           // 3..200 chars
    description?: string;    // max 1000
    type: "reading" | "listening";
    passage?: string;        // HTML/text cho Reading
    audioAssets?: { objectKey: string; url?: string; durationSeconds?: number }[];
    questions: QuestionDto[]; // @ArrayMinSize(1)
    passScore?: number;      // 0..100, default 70
    status?: "draft" | "published" | "archived"; // default "draft"
  }
  ```

#### `GET /api/v1/exercises` (`ADMIN`, `TEACHER`, HTTP 200)
- **Query (`ExerciseQueryDto`):** `page` (default `1`), `limit` (default `20`, max `100`), `type?: reading|listening`, `status?: draft|published|archived`, `search?: string`.

#### `GET /api/v1/exercises/:id` (Authenticated, HTTP 200)
- `ADMIN`/`TEACHER`: nhận đầy đủ `answerSpecification` & `explanation`.
- `STUDENT`: chỉ xem được nếu được giao bài, và **bắt buộc strip toàn bộ `answerSpecification` / `explanation`**.

#### `PATCH /api/v1/exercises/:id` (`ADMIN`, `TEACHER`, HTTP 200)
- **Body (`UpdateExerciseDto`):** Toàn bộ trường optional. Nếu đề đã `published`, sửa đổi sẽ tăng `version`.

#### `POST /api/v1/exercises/:id/publish`, `POST /api/v1/exercises/:id/archive`, `DELETE /api/v1/exercises/:id` (HTTP 200)
- Chuyển trạng thái sang `published` (để giao bài) hoặc `archived` (soft-archive).

---

### 3.2 Submissions (`/assignments/:id/submissions`, `/submissions/:id`)

- `POST /api/v1/assignments/:id/submissions` (`STUDENT`, HTTP 201):
  - **Body (`CreateSubmissionDto`):** `{ answers: { questionId: string; value: string }[] }` (`@ArrayMinSize(1)`).
  - Chấm điểm server-side dựa trên `exerciseSnapshot`, mở khóa đáp án & dịch Reading khi `scorePercent >= passScore` (mặc định 70%).
- `GET /api/v1/assignments/:id/submissions/mine` (`STUDENT`): Lịch sử các lần nộp của học viên cho assignment `:id`.
- `GET /api/v1/assignments/:id/answers` (`STUDENT` đã PASS / `TEACHER` / `ADMIN`): Trả đáp án đúng và giải thích; Student chưa PASS → `403 Forbidden`.
- `GET /api/v1/assignments/:id/submissions` (`ADMIN`, `TEACHER`): Query `SubmissionQueryDto` (`page=1`, `limit=20`, `studentAssignmentId?`).
- `GET /api/v1/submissions/:id` (`STUDENT` owner / `TEACHER` / `ADMIN`): Chi tiết 1 submission.

---

### 3.3 Legacy Translations (`/assignments/:id/translations`, `/translations/:id/review`)

- `POST /api/v1/assignments/:id/translations` (`STUDENT`):
  - **Body (`SubmitTranslationDto`):** `{ translatedText: string (min 10 chars), status?: 'draft' | 'submitted' (default 'submitted') }`.
- `GET /api/v1/assignments/:id/translations/mine` (`STUDENT`): Bản dịch của học viên kèm đoạn văn gốc.
- `GET /api/v1/assignments/:id/translations` (`ADMIN`, `TEACHER`): Query `TranslationQueryDto` (`page=1`, `limit=20`, `status?: draft|submitted|reviewed`).
- `PATCH` / `POST /api/v1/translations/:id/review` (`ADMIN`, `TEACHER`):
  - **Body (`ReviewTranslationDto`):** `{ teacherComment?: string (max 2000), feedback?: string (max 2000), decision?: 'approved' | 'needs_revision' | 'REVIEWED' | 'NEEDS_REVISION' }`.
