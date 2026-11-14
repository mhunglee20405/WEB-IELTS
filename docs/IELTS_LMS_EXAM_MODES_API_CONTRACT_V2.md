# IELTS LMS — Exam Modes, Question Bank & Reading Translation
## API Contract bổ sung v2.0 — Backend NestJS ↔ Frontend Next.js

**Ngày:** 12/11/2026  
**Trạng thái:** PROPOSED / CONTRACT FOR IMPLEMENTATION — chưa xác nhận các endpoint bên dưới đã tồn tại trong code.  
**Phạm vi:** Bổ sung chế độ làm từng **Reading Passage**, từng **Listening Section** hoặc **Full Test**, giao diện làm bài kiểu IELTS trên web, công cụ tạo đề/ngân hàng câu hỏi của giáo viên, và bài dịch Reading mở khóa khi đạt **≥70%**.  
**Nguyên tắc tương thích:** đây là *delta contract* bổ sung cho `docs/FRONTEND_API_CONTRACT.md` và `docs/openapi.json` hiện có. Backend phải đối chiếu mã nguồn, route, DTO và schema hiện hành trước khi implement; **không tự ý xóa/thay đổi endpoint đang dùng**.

> **Nguồn định hướng:** yêu cầu sản phẩm mới của nhóm; mô hình LMS đã thiết kế gồm `exercises`, `assignments`, `student_assignments`, `submissions`, `translation_submissions`. Giao diện được định hướng theo trải nghiệm luyện IELTS như STUDY4/YouPass, không sao chép giao diện, nội dung, đề thi hay tài sản có bản quyền của các website đó.

---

## 1. Quy tắc sản phẩm và các quyết định cần thống nhất

### 1.1. Các chế độ học

| Môn | Chế độ | Đơn vị nội dung | Hành vi |
|---|---|---|---|
| Reading | `PART` | 1 passage được chọn | Chỉ hiển thị passage và câu hỏi tương ứng; chấm điểm riêng theo phần này |
| Reading | `FULL` | Toàn bộ passages thuộc một test | Hiển thị đầy đủ passages theo thứ tự; chuyển phần trong khi làm; chấm theo toàn bài |
| Listening | `PART` | 1 section được chọn | Chỉ phát audio và câu hỏi của section đã chọn; chấm theo phần này |
| Listening | `FULL` | Toàn bộ sections thuộc một test | Điều hướng sections trong cùng một attempt; chấm theo toàn bài |

- **Đề chuẩn gợi ý:** Reading full 3 passages/40 câu/60 phút; Listening full 4 sections/40 câu (thời lượng do giáo viên/config xác định). Đây là template, **không hardcode** số lượng phần, câu hoặc thời gian của tất cả nội dung.
- `PART` và `FULL` là **phạm vi chấm độc lập**, không lấy tổng điểm full để quyết định việc PASS của một part hoặc ngược lại.
- Với `PART`, yêu cầu `partId`. Với `FULL`, `partId = null`.
- Học viên chỉ chọn chế độ mà giáo viên cho phép khi đề được **giao bài**. Trong **luyện tập tự do** giáo viên có thể cho phép cả 2 chế độ tùy chính sách truy cập.
- **Phân biệt:** `test/exercise` = nội dung ngân hàng đề; `assignment` = giáo viên giao nội dung cho lớp/học viên và quy định hạn; `attempt` = một lần học viên làm bài với phạm vi cụ thể; `submission` = kết quả nộp/chấm của attempt.

### 1.2. Quy tắc PASS và dịch bài Reading

1. Backend tính `earnedPoints` và `totalPoints` **chỉ từ các câu thuộc attempt scope**; quyết định `passed = earnedPoints / totalPoints >= 0.70` (hoặc ngưỡng `passScore` đã chốt cho assignment, mặc định 70). Không dùng điểm % đã làm tròn để phân loại PASS.
2. **Reading PART PASS** ⇒ mở bài dịch **đúng passage** vừa làm PASS. Reading FULL PASS ⇒ mở bài dịch **từng passage** thuộc FULL đã PASS. Không tự động mở các passage chưa đạt điều kiện.
3. Một passage đã mở dịch qua attempt PASS hợp lệ thì **không bị khóa lại** bởi attempt thất bại sau đó. Quyền được xác định theo *user + exerciseVersion + passageId*, có đối chiếu quyền bài giao nếu mở từ assignment.
4. Bài dịch vẫn gồm nhập nội dung tiếng Việt, lưu nháp, nộp, giáo viên nhận xét như tính năng đã có. **Chỉ bổ sung scope `passageId` và context của attempt**, không xây lại workflow dịch.
5. **Listening không có dịch bài**, dù PASS.
6. **Đáp án/giải thích** chỉ được hiển thị sau PASS của **scope tương ứng**, theo chính sách bảo vệ đáp án đã thống nhất trước đó. Giao diện kết quả FAIL có thể hiển thị điểm, tổng số đúng và gợi ý nhưng **không lộ đáp án đúng, grading hay transcript chứa đáp án** nếu policy chưa cho phép.
7. Việc PASS một PART **không được tự động đánh dấu assignment FULL là hoàn tất**. Nếu assignment yêu cầu FULL thì phải PASS FULL; nếu giao riêng PART thì phải PASS PART đó. Đây là quy tắc chống nhầm trạng thái và phạt trễ.

### 1.3. Các quyết định mặc định được đề xuất (cần xác nhận trước khi triển khai)

| Vấn đề | Mặc định contract v2 | Có thể cấu hình |
|---|---|---|
| Phạm vi assignment | `requiredScope`: `FULL` hoặc `PART` + `partId` | Có |
| Chọn chế độ từ trang ngân hàng đề | Hiển thị chỉ những chế độ `allowedModes` | Có |
| Thời gian làm bài | Đọc `durationSeconds` từ published version hoặc assignment override | Có |
| Đồng hồ | Server lưu `startedAt`/`expiresAt`; FE chỉ hiển thị, BE là nguồn sự thật | Không |
| Hết giờ | BE khóa autosave, chấm các câu đã lưu; trạng thái `AUTO_SUBMITTED` | Có thể chọn `EXPIRED` không chấm nếu chính sách khác |
| Đổi passage/section trong FULL | Không tạo attempt mới; giữ nguyên câu trả lời đã lưu | Không |
| Retry | Mỗi attempt tạo ID mới; giới hạn `maxAttempts` của assignment | Có |
| Audio Listening | Không hiển thị transcript/answer key trước unlock; URL có thời hạn | Có |
| Bắt buộc dịch để hoàn thành assignment | Mặc định **không**, theo dõi riêng `translationStatus` | Cần quyết định nghiệp vụ |
| Quy tắc deadline/phạt +1 | Giữ nguyên `student_assignments`, `effectiveDueAt` và ledger hiện có | Không được đổi ngầm |

---

## 2. Vai trò và phạm vi truy cập

- **Student:** xem đề `PUBLISHED` được phép luyện hoặc đã giao; tạo attempt; làm, lưu nháp, nộp; xem kết quả của bản thân; xem lời giải theo quyền; dịch passage đã mở khóa.
- **Teacher:** quản lý đề do mình tạo hoặc được phân quyền; tạo Reading passage/Listening section, câu hỏi, đáp án, audio; preview; publish/version; giao FULL/PART cho lớp được phân công; xem kết quả và nhận xét bản dịch.
- **Admin:** toàn quyền quản lý theo RBAC hiện hành; mọi thay đổi đề và đáp án phải có audit log.
- Một học viên **không thể** truy cập answer key qua URL ID đoán được hoặc qua raw MongoDB DTO. Không cấp `grading`, `acceptedAnswers`, `correctOption`, `answerSpecification`, `explanation` khi chưa được phép review.

---

## 3. Khái niệm dữ liệu và schema mapping (MongoDB)

### 3.1. Tái sử dụng collections hiện có

| Collection | Tái sử dụng | Bổ sung đề xuất |
|---|---|---|
| `exercises` | Nội dung bài/đề, version, publish, reading passages, audio/question | `parts[]`, `allowedModes[]`, `durationSeconds`, `questionGroups[]`, `examPreset` |
| `assignments` | Phân phối bài cho khóa học | `requiredScope`, `requiredPartId`, `allowedModes`, `durationSecondsOverride`, `maxAttempts` |
| `student_assignments` | Tracking tiến độ/hạn/phạt | Tiến độ gắn với yêu cầu assignment; không tổng hợp nhầm PART/FULL |
| `submissions` | Bài nộp và điểm đã chấm | `attemptId`, `mode`, `partId`, `scopeQuestionIds`, `earnedPoints`, `totalPoints` |
| `translation_submissions` | Nội dung dịch và teacher feedback | `passageId`, `exerciseVersion`, `sourceAttemptId`, quyền unlock theo passage |

> **Quan trọng:** thiết kế cũ có unique `translation_submissions(studentAssignmentId)` (1 bản dịch cho 1 bài giao). Khi hỗ trợ FULL Reading với nhiều passages, unique này **không phù hợp**. Cần migration được kiểm tra cẩn thận sang unique có scope, ví dụ `(studentAssignmentId, passageId)` với bản dịch assignment. Với luyện tập tự do, cần khóa owner + test-version + passage. Không drop index trên production trước khi backup và kiểm kê dữ liệu; tránh tạo nhiều bản dịch trùng trong giai đoạn chuyển đổi.

### 3.2. `Part` và `QuestionGroup`

```ts
export type ExamSkill = 'READING' | 'LISTENING';
export type ExamMode = 'PART' | 'FULL';
export type PartType = 'PASSAGE' | 'SECTION';

export interface ExamPart {
  id: string;                    // ObjectId serialized as string
  type: PartType;                // PASSAGE for Reading, SECTION for Listening
  ordinal: number;               // 1..N, immutable within published version
  title: string;
  contentHtml?: string;          // Reading only, sanitized HTML
  audioAssetId?: string;         // Listening only
  durationSeconds?: number;      // Optional part override
  questionGroupIds: string[];
}

export type QuestionType =
  | 'MULTIPLE_CHOICE_SINGLE'
  | 'MULTIPLE_CHOICE_MULTIPLE'
  | 'TRUE_FALSE_NOT_GIVEN'
  | 'YES_NO_NOT_GIVEN'
  | 'MATCHING_HEADINGS'
  | 'MATCHING_INFORMATION'
  | 'MATCHING_FEATURES'
  | 'MATCHING_SENTENCE_ENDINGS'
  | 'SENTENCE_COMPLETION'
  | 'SUMMARY_COMPLETION'
  | 'NOTE_COMPLETION'
  | 'TABLE_COMPLETION'
  | 'FLOW_CHART_COMPLETION'
  | 'DIAGRAM_LABEL_COMPLETION'
  | 'SHORT_ANSWER';

export interface QuestionGroup {
  id: string;
  partId: string;
  title: string;
  instruction: string;
  type: QuestionType;
  order: number;
  questionIds: string[];
  sharedOptions?: Array<{ key: string; label: string }>;
  maxWords?: number;
}
```

- Mỗi `question` phải có `id`, `partId`, `groupId`, `number`, `prompt`, `type`, `points`, `options?` và **grading riêng lưu server-only**.
- `MULTIPLE_CHOICE_MULTIPLE` trả về nhiều option keys; `MATCHING_*` trả về một key hoặc mapping theo mỗi question/slot; `COMPLETION` trả về text.
- Giáo viên tạo đáp án và các biến thể chấp nhận; chấm text có chuẩn hóa khoảng trắng/hoa thường theo grading rule, **không tự sửa chính tả** nếu không cấu hình.
- Listening asset phải có metadata (`durationSeconds`, MIME, checksum/size) và được stream qua signed playback URL. Không lưu binary audio trong MongoDB document.
- FE sử dụng `partId`, `questionId` ổn định, **không dùng index mảng để submit**.

### 3.3. Attempt / Progress

Đề xuất tạo collection `exam_attempts` (hoặc mở rộng attempt state hiện có nếu code đã có) để giữ draft server-side, thời gian, scope, resume và idempotency.

```ts
export type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';

export interface ExamAttempt {
  id: string;
  studentId: string;
  exerciseId: string;
  exerciseVersion: number;
  assignmentId?: string | null;
  studentAssignmentId?: string | null;
  mode: ExamMode;
  partId: string | null;
  status: AttemptStatus;
  startedAt: string;             // UTC ISO-8601
  expiresAt: string;             // UTC ISO-8601
  submittedAt: string | null;
  lastSavedAt: string | null;
  answersRevision: number;      // concurrency/optimistic revision
}
```

Tất cả thời điểm lưu UTC; giờ hạn hiển thị `Asia/Ho_Chi_Minh`. `scopeQuestionIds` cần được pin theo published exercise version để đề đang làm không thay đổi nội dung/chấm điểm.

---

## 4. REST API contract v2

**Base:** `/api/v1` · **Auth:** `Authorization: Bearer <accessToken>` · **Content-Type:** `application/json` · **IDs:** string ObjectId · **Ngày:** UTC ISO 8601.  
**Quy ước:** routes dưới đây được **đề xuất**, không cam kết code hiện tại đã triển khai. Tên route cuối cùng phải đối chiếu OpenAPI đang có; nếu đã có route nghiệp vụ tương đương, **mở rộng DTO/response thay vì tạo trùng**.

### 4.1. Student: khám phá đề, chọn chế độ và làm bài

| Method | Path | Ý nghĩa | HTTP |
|---|---|---|---|
| GET | `/exam-tests?skill=READING&status=PUBLISHED&page=1&limit=20` | Danh sách đề có quyền truy cập, metadata không lộ đáp án | 200 |
| GET | `/exam-tests/:testId` | Chi tiết đề, danh sách parts, số câu, `allowedModes`, thời lượng, trạng thái truy cập | 200 |
| GET | `/exam-tests/:testId/parts/:partId` | Nội dung part, question groups, questions đã lọc grading | 200 |
| POST | `/exam-attempts` | Tạo attempt PART/FULL và khóa snapshot đề | 201 |
| GET | `/exam-attempts/:attemptId` | Lấy trạng thái, tiến độ, câu trả lời đã lưu, thời hạn | 200 |
| PUT | `/exam-attempts/:attemptId/answers` | Ghi nháp (upsert theo `questionId`, revision/idempotency) | 200 |
| POST | `/exam-attempts/:attemptId/submit` | Nộp bài và chấm server-side một lần | 200 |
| GET | `/exam-attempts/:attemptId/result` | Điểm, PASS/FAIL, thống kê theo part, unlock flags | 200 |
| GET | `/exam-attempts/:attemptId/review` | Đáp án/lời giải theo quyền của scope PASS | 200/403 |
| GET | `/exam-attempts?assignmentId=...` | Lịch sử các lần làm của bản thân | 200 |
| GET | `/media/audio/:assetId/playback` | Cấp signed URL/stream sau xác thực | 200/403 |

**Assignment integration:** Có thể bắt đầu attempt với `studentAssignmentId` (ưu tiên) và backend suy ra `assignmentId`, `testId`, `requiredScope`. Khi mở từ assignment, không cho client ghi đè phạm vi mà teacher đã khóa. Nếu đề được luyện tự do, `studentAssignmentId` để `null`; cần xác thực quyền practice.

#### A. `GET /exam-tests/:testId` — Student Safe DTO

```json
{
  "id": "test_reading_001",
  "skill": "READING",
  "title": "Reading Practice Test 01",
  "version": 2,
  "status": "PUBLISHED",
  "allowedModes": ["PART", "FULL"],
  "passScore": 70,
  "fullDurationSeconds": 3600,
  "totalQuestions": 40,
  "parts": [
    { "id": "passage_01", "type": "PASSAGE", "ordinal": 1, "title": "Passage 1", "questionCount": 13, "durationSeconds": 1200 },
    { "id": "passage_02", "type": "PASSAGE", "ordinal": 2, "title": "Passage 2", "questionCount": 13, "durationSeconds": 1200 },
    { "id": "passage_03", "type": "PASSAGE", "ordinal": 3, "title": "Passage 3", "questionCount": 14, "durationSeconds": 1200 }
  ],
  "translationEnabled": true,
  "access": { "canPractice": true, "reason": null }
}
```

*IDs trên là placeholder dễ đọc cho ví dụ. API thật phải trả ID đúng format project (Mongo ObjectId hoặc ID có contract nhất quán); không dùng những placeholder này trong database.*

#### B. `POST /exam-attempts` — request

```json
{
  "testId": "<testObjectId>",
  "mode": "PART",
  "partId": "<passageOrSectionObjectId>",
  "studentAssignmentId": "<studentAssignmentObjectId-or-null>",
  "idempotencyKey": "start-unique-client-uuid"
}
```

**Response `201`**

```json
{
  "id": "<attemptObjectId>",
  "testId": "<testObjectId>",
  "exerciseVersion": 2,
  "skill": "READING",
  "mode": "PART",
  "partId": "<passageObjectId>",
  "status": "IN_PROGRESS",
  "startedAt": "2026-11-12T03:00:00.000Z",
  "expiresAt": "2026-11-12T03:20:00.000Z",
  "remainingSeconds": 1200,
  "answersRevision": 0,
  "parts": [
    { "id": "<passageObjectId>", "ordinal": 1, "title": "Passage 1", "questionCount": 13 }
  ]
}
```

- PART: `partId` bắt buộc và thuộc đề; FULL: `partId` phải `null`.
- `POST` cùng `idempotencyKey` trả cùng attempt; khác key trong lúc đã có attempt active phải theo chính sách concurrency đã thống nhất (`409 ATTEMPT_ALREADY_IN_PROGRESS` hoặc resume cùng attempt).
- `startsAt/expiresAt` và deadline phải được kiểm tra phía BE. FE không thể thêm thời gian bằng sửa đồng hồ máy.

#### C. `GET /exam-tests/:testId/parts/:partId` — safe question payload

```json
{
  "id": "<passageObjectId>",
  "title": "Passage 1",
  "ordinal": 1,
  "type": "PASSAGE",
  "contentHtml": "<p>Example passage...</p>",
  "audio": null,
  "questionGroups": [
    {
      "id": "<groupObjectId>",
      "type": "TRUE_FALSE_NOT_GIVEN",
      "instruction": "Questions 1–3. Choose TRUE, FALSE or NOT GIVEN.",
      "questionIds": ["<q1>", "<q2>", "<q3>"],
      "questions": [
        { "id": "<q1>", "number": 1, "prompt": "Statement 1", "type": "TRUE_FALSE_NOT_GIVEN", "points": 1, "options": ["TRUE", "FALSE", "NOT GIVEN"] }
      ]
    }
  ]
}
```

**Không có:** `grading`, `acceptedAnswers`, `correctAnswer`, `answerSpecification`, `explanation`.

#### D. `PUT /exam-attempts/:attemptId/answers` — autosave

```json
{
  "baseRevision": 3,
  "answers": [
    { "questionId": "<q1>", "value": "TRUE" },
    { "questionId": "<q2>", "value": "NOT GIVEN" },
    { "questionId": "<q3>", "value": ["A", "C"] }
  ]
}
```

**Response `200`:**

```json
{
  "attemptId": "<attemptObjectId>",
  "answersRevision": 4,
  "savedQuestionIds": ["<q1>", "<q2>", "<q3>"],
  "lastSavedAt": "2026-11-12T03:05:00.000Z"
}
```

- Payload chứa **các câu cập nhật**, không xóa câu khác đã lưu.
- `baseRevision` cũ trả `409 ANSWERS_REVISION_CONFLICT` kèm current revision; FE refetch rồi merge an toàn.
- Chỉ nhận câu thuộc attempt scope; không nhận các ID ngoài part khi đang ở chế độ PART.
- Lưu câu trả lời với dữ liệu tối thiểu. Phần listening audio seek/playback state nếu lưu thì là tiến độ UI, không được tự ý đổi thời hạn server.

#### E. `POST /exam-attempts/:attemptId/submit`

Request:

```json
{ "idempotencyKey": "submit-unique-client-uuid", "expectedRevision": 4 }
```

Response `200`:

```json
{
  "attemptId": "<attemptObjectId>",
  "submissionId": "<submissionObjectId>",
  "status": "SUBMITTED",
  "skill": "READING",
  "mode": "PART",
  "partId": "<passageObjectId>",
  "earnedPoints": 10,
  "totalPoints": 13,
  "scorePercent": 76.92,
  "passScore": 70,
  "passed": true,
  "correctCount": 10,
  "questionCount": 13,
  "answerReviewAvailable": true,
  "translation": {
    "available": true,
    "unlockedPassageIds": ["<passageObjectId>"]
  },
  "submittedAt": "2026-11-12T03:12:00.000Z"
}
```

- Server chấm theo published test version và scope đã chốt; **không nhận** `passed`, `score` từ client.
- Gọi lại với cùng idempotency key (hoặc attempt đã submit) phải trả kết quả cũ, **không tạo thêm submission**.
- `scorePercent` dùng hiển thị; điều kiện PASS so sánh bằng phân số điểm chưa làm tròn.
- Với FULL Reading: `unlockedPassageIds` chứa tất cả passage IDs của attempt khi PASS; nếu FAIL, rỗng (trừ những passage đã unlock từ attempt PART PASS trước đó, tùy response có thể trả quyền hiệu lực). Với Listening: `translation.available = false`, `unlockedPassageIds = []`.
- `GET /exam-attempts/:attemptId/result` trả cùng cấu trúc kết quả và `partBreakdown` theo part, không lộ đáp án khi FAIL.

#### F. `GET /exam-attempts/:attemptId/review`

- `200` trả các câu trong **attempt scope** cùng `studentAnswer`, `correctAnswer`, `explanation`, `isCorrect`, `partId`, điểm.
- `403 ANSWER_REVIEW_LOCKED` nếu attempt chưa PASS; không có cơ chế lấy review qua test-wide route để né kiểm tra.

### 4.2. Student: dịch Reading theo passage

**Tương thích:** hệ thống đã có route dịch theo `studentAssignmentId`; ưu tiên **mở rộng** route và DTO hiện có. Nếu contract hiện hành dùng `GET/PUT/POST /student-assignments/:id/translation...`, có thể mở rộng bằng `passageId` (route/query/body) và version migration; **không bỏ route cũ đột ngột**. Các route theo `reading-translations` bên dưới là giao diện REST đích *đề xuất* nếu chưa có route tương đương.

| Method | Path | Nội dung |
|---|---|---|
| GET | `/reading-translations/eligibility?testId=...&studentAssignmentId=...` | Danh sách passage và trạng thái khóa/mở theo các PASS hợp lệ |
| GET | `/reading-translations/:passageId?testId=...&studentAssignmentId=...` | Nguồn Reading, bản nháp, trạng thái, feedback |
| PUT | `/reading-translations/:passageId/draft` | Lưu tiếng Việt cho passage đang mở |
| POST | `/reading-translations/:passageId/submit` | Nộp bản dịch cho giáo viên |
| GET | `/teacher/reading-translations?courseId=...&status=SUBMITTED` | Giáo viên xem danh sách dịch cần chấm (nếu route cũ đã có thì giữ route cũ) |
| POST | `/teacher/reading-translations/:translationId/review` | Giáo viên gửi feedback (nếu route cũ đã có thì giữ route cũ) |

**`GET eligibility` response:**

```json
{
  "testId": "<testObjectId>",
  "exerciseVersion": 2,
  "translationEnabled": true,
  "passages": [
    { "passageId": "<p1>", "ordinal": 1, "unlocked": true, "sourceAttemptId": "<passedAttemptId>", "status": "DRAFT" },
    { "passageId": "<p2>", "ordinal": 2, "unlocked": false, "sourceAttemptId": null, "status": "LOCKED" },
    { "passageId": "<p3>", "ordinal": 3, "unlocked": false, "sourceAttemptId": null, "status": "LOCKED" }
  ]
}
```

**`PUT draft` request:**

```json
{
  "testId": "<testObjectId>",
  "studentAssignmentId": "<studentAssignmentObjectId-or-null>",
  "exerciseVersion": 2,
  "textVi": "Bản dịch tiếng Việt do học viên nhập...",
  "revision": 1
}
```

- Không được dịch passage khi chưa unlock (`403 TRANSLATION_LOCKED`).
- Khi học viên nộp, trạng thái ví dụ `SUBMITTED`; giáo viên review thành `REVIEWED` kèm `feedback` và `reviewedAt`.
- BE luôn trả `sourceContentHtml` **đúng passage/version** học viên đã PASS, không lấy từ draft đã bị teacher sửa.
- Với FULL PASS, FE tạo tab dịch Passage 1/2/3; **mỗi passage có draft, submit và nhận xét riêng**.

### 4.3. Teacher: ngân hàng đề và trình tạo đề

| Method | Path | Mục đích | Quyền |
|---|---|---|---|
| GET | `/teacher/exam-tests?skill=...&status=...&page=...` | Danh sách đề do teacher quản lý | Teacher/Admin |
| POST | `/teacher/exam-tests` | Tạo đề nháp và cấu hình | Teacher/Admin |
| GET | `/teacher/exam-tests/:testId` | Chi tiết đầy đủ để edit, bao gồm grading | Owner/Admin |
| PATCH | `/teacher/exam-tests/:testId` | Sửa metadata/config khi là DRAFT | Owner/Admin |
| POST | `/teacher/exam-tests/:testId/parts` | Thêm Reading passage hoặc Listening section | Owner/Admin |
| PATCH | `/teacher/exam-tests/:testId/parts/:partId` | Chỉnh nội dung passage/section khi DRAFT | Owner/Admin |
| DELETE | `/teacher/exam-tests/:testId/parts/:partId` | Xóa part khi DRAFT | Owner/Admin |
| POST | `/teacher/exam-tests/:testId/parts/:partId/question-groups` | Tạo nhóm câu hỏi và câu hỏi/đáp án | Owner/Admin |
| PATCH | `/teacher/exam-tests/:testId/question-groups/:groupId` | Sửa group, type, câu hỏi, grading | Owner/Admin |
| POST | `/teacher/exam-tests/:testId/validate` | Validate tính đầy đủ, số câu, audio, đáp án | Owner/Admin |
| GET | `/teacher/exam-tests/:testId/preview?mode=PART&partId=...` | Preview chính xác student-safe UI | Owner/Admin |
| POST | `/teacher/exam-tests/:testId/publish` | Publish immutable version | Owner/Admin |
| POST | `/teacher/exam-tests/:testId/new-version` | Tạo bản DRAFT mới từ bản đã publish | Owner/Admin |
| POST | `/media/audio/upload-intent` | Xin signed upload URL cho file audio hợp lệ | Teacher/Admin |

**Create test request (`POST /teacher/exam-tests`):**

```json
{
  "title": "IELTS Reading Practice 01",
  "skill": "READING",
  "allowedModes": ["PART", "FULL"],
  "passScore": 70,
  "fullDurationSeconds": 3600,
  "translationEnabled": true,
  "examPreset": "IELTS_ACADEMIC",
  "description": "Luyện tập Reading 3 passages"
}
```

**Create part request (`POST /teacher/exam-tests/:testId/parts`):**

```json
{
  "type": "PASSAGE",
  "ordinal": 1,
  "title": "Passage 1 — Example",
  "contentHtml": "<p>Nội dung bài đọc ...</p>",
  "durationSeconds": 1200
}
```

Với `skill = LISTENING`, `type = SECTION`, thay `contentHtml` bằng `audioAssetId`; có thể có ảnh câu hỏi hoặc nội dung hướng dẫn.

**Create question-group request:**

```json
{
  "type": "TRUE_FALSE_NOT_GIVEN",
  "title": "Questions 1–3",
  "instruction": "Choose TRUE, FALSE or NOT GIVEN",
  "order": 1,
  "questions": [
    {
      "number": 1,
      "prompt": "Statement 1",
      "points": 1,
      "grading": { "acceptedAnswers": ["TRUE"], "trimWhitespace": true, "normalizeCase": true }
    }
  ]
}
```

**Publish validation (server mandatory):**

- Có tối thiểu 1 part; mỗi part có câu hỏi, tất cả question IDs là duy nhất và thuộc đúng part/group.
- Reading: mỗi PASSAGE có passage content hợp lệ; Listening: mỗi SECTION có audio asset đã được xác nhận upload/accessible.
- Không có câu hỏi thiếu đáp án/invalid choice; điểm dương; không trùng số câu; completion word limit hợp lệ.
- `FULL` chỉ bật nếu đề đủ các part theo chính sách template đã chọn; nếu `examPreset=IELTS_ACADEMIC` kiểm tra các ràng buộc 3/4 sections và số câu tương ứng khi preset được đánh dấu **strict**.
- Published version **immutable**; sửa thông tin ảnh hưởng điểm/câu hỏi phải tạo version mới. Assignment và attempt cũ luôn chấm version cũ.
- Giáo viên không có quyền truy cập đề của teacher khác nếu không được share/assign.

### 4.4. Teacher: giao bài PART hoặc FULL

**Mở rộng `POST /assignments` hiện có**, không tạo endpoint phân bài trùng.

```json
{
  "courseId": "<courseObjectId>",
  "exerciseId": "<publishedTestObjectId>",
  "title": "Reading Passage 2 — Homework",
  "requiredScope": "PART",
  "requiredPartId": "<passage2ObjectId>",
  "allowedModes": ["PART"],
  "durationSecondsOverride": 1200,
  "maxAttempts": 3,
  "openAt": "2026-11-12T00:00:00.000Z",
  "dueAt": "2026-11-13T00:00:00.000Z"
}
```

- Giáo viên chọn đề published → `FULL` hoặc `PART` → chọn part nếu cần → lớp → lịch → giới hạn làm lại.
- `openAt`/`dueAt` là UTC; nếu giao ngày VN 12/11, thời gian mặc định bắt đầu lúc `2026-11-11T17:00:00.000Z`, kết thúc exclusive `2026-11-12T17:00:00.000Z`. Các timestamp trong ví dụ JSON phía trên chỉ minh họa định dạng, **không đại diện ngày VN 12/11**.
- BE chặn `requiredPartId` không thuộc `exerciseId` và không cho giao version DRAFT.
- Assignment FULL vẫn có thể cho phép người dùng chuyển giữa parts **bên trong một attempt**, nhưng không mở chế độ làm PART để hoàn thành assignment nếu không cho phép.

---

## 5. Frontend screen contract — giao diện giống trải nghiệm thi IELTS

### 5.1. Student routes (đề xuất)

| Route Next.js | Nội dung | API chính |
|---|---|---|
| `/student/practice` | Danh sách đề Reading/Listening, search/filter | `GET /exam-tests` |
| `/student/practice/[testId]` | Chi tiết đề, nút `Làm từng Passage/Section` hoặc `Làm Full Test`, chọn part | `GET /exam-tests/:id` |
| `/student/exam/[attemptId]` | Giao diện thi có đồng hồ, navigator, autosave | `GET /exam-attempts/:id`, parts, `PUT answers` |
| `/student/exam/[attemptId]/result` | Điểm %, PASS/FAIL, bảng điểm theo part, nút review/dịch | `GET /result`, eligibility |
| `/student/reading/[testId]/translate/[passageId]` | Hai cột passage và editor tiếng Việt | translation APIs |
| `/student/assignments/[studentAssignmentId]` | Bài giao và phạm vi được phép | assignment APIs |

### 5.2. Reading exam layout

- **Header:** Tên đề, `Passage 1/2/3`, đồng hồ đếm ngược dựa trên `expiresAt`, trạng thái `Đã lưu`, nút `Nộp bài`.
- **Chế độ FULL:** tab chuyển Passage 1/2/3, câu trả lời được giữ trên cùng attempt. **PART:** chỉ hiện passage đã chọn.
- **Desktop:** panel trái ~50% hiển thị bài đọc (scroll độc lập, text selectable, có thể highlight nội bộ), panel phải ~50% câu hỏi/nhóm câu (scroll độc lập); responsive tablet/mobile chuyển tab `Bài đọc | Câu hỏi`.
- **Footer/question palette:** số câu, trạng thái `answered/unanswered/flagged`, nhảy đến câu, đánh dấu xem lại; kết thúc hiển thị modal confirm câu chưa trả lời.
- Câu trả lời chỉ ghi vào state local + autosave API; rời trang/refresh gọi resume bằng attempt ID. **Không đặt đáp án đúng trong JavaScript bundle hoặc payload student.**

### 5.3. Listening exam layout

- Header với Section 1–4 (hoặc số section thực tế) và đồng hồ.
- Trình phát audio lấy từ playback URL được cấp phép; đáp ứng policy `allowPause`, `allowSeek`, `maxPlayCount` nếu giáo viên định nghĩa (mặc định chế độ Practice cho replay; chế độ Exam policy do teacher cấu hình).
- Các nhóm câu hỏi ở dưới, có navigator theo câu và section; FULL chuyển section mà không reset state.
- Transcript, nếu có, chỉ được dùng khi backend chính sách review cho phép; **không đưa transcript chứa đáp án vào student payload lúc đang làm**.
- Không phụ thuộc vào audio player client để tính giờ hoặc chấm điểm.

### 5.4. Teacher routes (đề xuất)

| Route | Màn hình |
|---|---|
| `/teacher/question-bank` | Danh sách đề: DRAFT/PUBLISHED/ARCHIVED, Reading/Listening, tìm kiếm |
| `/teacher/question-bank/new` | Wizard tạo Reading/Listening test |
| `/teacher/question-bank/[testId]/edit` | Form sửa metadata, part, group, câu hỏi, key, audio và preview |
| `/teacher/question-bank/[testId]/preview` | Preview như học viên nhưng không cho làm thật |
| `/teacher/assignments/new` | Giao đề FULL/PART cho lớp có quyền |
| `/teacher/translations` | Danh sách bài dịch theo passage, nhận xét |

**Wizard teacher:** (1) metadata & mode → (2) thêm Passages/Sections → (3) nhóm câu/question type → (4) đáp án & grading → (5) validate → (6) preview → (7) publish → (8) assign.

### 5.5. FE ↔ BE state rules

- Chỉ **BE** quyết định: mode khả dụng, quyền truy cập, thời gian thật, điểm, PASS, answer review, translation unlock, assignment completion.
- FE dùng `remainingSeconds` chỉ cho UX; khi refresh lấy `expiresAt` mới; không tự submit multiple lần do double click.
- Autosave có debounce + queue; nếu mất mạng hiển thị `Chưa đồng bộ`; **không hiển thị “Đã lưu” trước khi server ACK**.
- Attempt đang hết giờ và submit đồng thời phải có một transition atomically trên BE.
- FE render rich text Reading bằng sanitizer, chặn XSS; upload audio cũng phải validate MIME/size/owner/server.

---

## 6. Error contract và ví dụ lỗi

Duy trì error envelope đang áp dụng bởi project (ví dụ `statusCode`, `error`, `message`, `path`, `timestamp`, `correlationId`). Nếu code hiện có dùng trường khác, giữ schema cũ và bổ sung `code` ổn định; **không bắt FE parse câu `message`**.

| HTTP | `code` đề xuất | Tình huống | FE hành động |
|---|---|---|---|
| 400 | `INVALID_EXAM_SCOPE` | PART thiếu partId; FULL vẫn gửi partId; part sai skill | Hiển thị lỗi chọn phạm vi |
| 400 | `INVALID_QUESTION_ANSWER` | Value không đúng type | Highlight câu lỗi |
| 401 | `UNAUTHENTICATED` | Token hết hạn | Refresh/login |
| 403 | `EXAM_ACCESS_DENIED` | Không thuộc lớp/không có quyền practice | Hiển thị không được phép |
| 403 | `ANSWER_REVIEW_LOCKED` | Chưa PASS attempt scope | Ẩn đáp án |
| 403 | `TRANSLATION_LOCKED` | Passage chưa đạt 70% | Hiển thị điều kiện mở khóa |
| 403 | `ASSIGNMENT_SCOPE_LOCKED` | Teacher bắt buộc FULL nhưng client cố làm PART | Disable chọn mode |
| 404 | `EXAM_NOT_FOUND` | ID sai/không thấy tài nguyên | Empty/error page |
| 409 | `ATTEMPT_ALREADY_IN_PROGRESS` | Đã có phiên làm bài active | Cho Resume |
| 409 | `ANSWERS_REVISION_CONFLICT` | Draft revision cũ | Refetch/merge |
| 409 | `ATTEMPT_ALREADY_SUBMITTED` | Attempt đã nộp | Điều hướng kết quả |
| 409 | `EXAM_VERSION_CONFLICT` | Draft teacher bị thay đổi đồng thời | Reload form |
| 422 | `EXAM_PUBLISH_VALIDATION_FAILED` | Thiếu passage/audio/key/câu | Show errors theo part/group |
| 429 | `RATE_LIMITED` | Quá nhiều request | Backoff |

Example:

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "code": "TRANSLATION_LOCKED",
  "message": "Passage chưa được mở khóa vì chưa có attempt PASS hợp lệ.",
  "path": "/api/v1/reading-translations/<passageId>",
  "timestamp": "2026-11-12T04:00:00.000Z",
  "correlationId": "<uuid>"
}
```

---

## 7. Acceptance criteria (bắt buộc để BE/FE tích hợp)

| ID | Điều kiện | Kỳ vọng |
|---|---|---|
| AC-01 | Teacher tạo đề Reading gồm 3 passages và nhóm câu hỏi | Có thể lưu DRAFT, validate, preview và PUBLISH |
| AC-02 | Teacher tạo Listening gồm 4 sections + audio | Student nhận audio đúng section qua URL có quyền |
| AC-03 | Student chọn Reading PART Passage 2 | UI/submit chỉ chứa câu Passage 2, score denominator là câu Passage 2 |
| AC-04 | Student chọn Reading FULL | Cả 3 passages trong cùng attempt; switching giữ answers; chấm toàn bộ |
| AC-05 | Student chọn Listening PART Section 3 | Chỉ câu/audio Section 3, không ảnh hưởng score full |
| AC-06 | Student chọn Listening FULL | Chuyển sections không tạo attempt mới; chấm toàn bộ |
| AC-07 | Reading PART đạt chính xác ngưỡng 70% | PASS; review scope đó; unlock dịch đúng passage đó |
| AC-08 | Reading PART <70% | FAIL; không mở dịch/answer key passage đó |
| AC-09 | Reading FULL PASS | Mở dịch riêng từng passage, mỗi passage có draft/submit/feedback độc lập |
| AC-10 | Listening PASS | Review theo chính sách, **không** xuất hiện CTA dịch |
| AC-11 | Có PASS PART nhưng Assignment yêu cầu FULL | Assignment chưa được tính hoàn thành bởi PART |
| AC-12 | Teacher sửa đề đã published | Tạo version mới; attempt cũ vẫn chấm theo version cũ |
| AC-13 | Client thử lấy grading trước PASS qua JSON/raw route | Không lộ đáp án; trả 403 thích hợp |
| AC-14 | Autosave gọi lặp/submit hai lần | Không nhân bản answers/submissions; kết quả nhất quán |
| AC-15 | Teacher khác truy cập đề không được phân quyền | Bị từ chối |
| AC-16 | Mất mạng rồi refresh trong giờ làm | Resume cùng attempt và lấy draft server; không cấp thêm giờ |
| AC-17 | Hết giờ khi chưa nộp | BE xử lý theo time policy thống nhất, không chấm trùng |
| AC-18 | Teacher giao PART với hạn Việt Nam | Worker/phạt +1 dùng completion scope chính xác và lịch UTC tương ứng |
| AC-19 | FE hiển thị countdown, unanswered, highlight, split view | UI tương thích mobile/desktop; logic điểm/quyền không dựa FE |
| AC-20 | Bài dịch cũ trước migration | Dữ liệu/feedback được bảo toàn; index migration an toàn |

---

## 8. Phân chia trách nhiệm triển khai

**Backend (NestJS/Mongoose):** schema extension + migration; version pinning; question validation/grading; RBAC; attempt state machine; idempotency; autosave; scoring; unlock rights; audio signed URL; Swagger/OpenAPI; test E2E; duy trì assignment/notification/penalty behaviors.

**Frontend (Next.js):** exercise catalog và mode picker; test player Reading/Listening; timer/progress/navigation/autosave/resume; results/review; translation multi-passage; teacher question-bank builder + validate/preview/publish + assign; sử dụng typed client sinh từ OpenAPI.

**Cách triển khai an toàn:**
1. **Contract freeze**: Backend đọc code + `docs/FRONTEND_API_CONTRACT.md` và `docs/openapi.json`, xác nhận route hiện có, chốt route/DTO cuối cùng. Ghi các điểm khác biệt vào `docs/DECISIONS.md`.
2. **Backend-first:** migration, API, auth, grading, E2E và cập nhật OpenAPI **trước khi FE gọi API**.
3. **Frontend integration:** generate TypeScript types từ spec mới, kết nối API thật, không hardcode response hoặc grading.
4. **E2E cross-team:** kiểm tra đầy đủ AC-01..AC-20 trên DB test và audio test assets; thực hiện regression suite trước merge.
5. **Versioning:** giữ nguyên `/api/v1` nếu bổ sung tương thích; nếu thay đổi phá vỡ contract cũ, chọn route migration/alias hoặc công bố API v2 có kế hoạch chuyển đổi rõ.

---

## 9. Các điểm bắt buộc xác nhận trước khi đưa production

1. **Nguồn bài luyện tập tự do:** chỉ đề được giao hay có thư viện public cho học viên? Mặc định: chỉ các bài được teacher/admin cho phép.
2. **Thời lượng Reading PART:** 20 phút gợi ý hay teacher tùy chỉnh; Listening PART lấy thời lượng audio hay override?
3. **Listening exam mode:** có cho pause/replay/seek? Với luyện tập khác với mock exam.
4. **Ngưỡng PASS:** giữ cố định 70% hay giáo viên được override cho từng assignment? Mặc định theo chính sách assignment, default 70%.
5. **Dịch bài:** full PASS mở dịch cả 3 passages; part PASS mở passage đó. Dịch có là điều kiện hoàn thành homework hay không? Mặc định tách riêng.
6. **Tối đa attempt và resume:** Có cho tạo attempt mới trong khi một attempt chưa nộp? Mặc định chặn trùng và cho resume.
7. **Scoring question types:** kiểu matching/completion nhiều blank quy điểm theo từng blank hay từng question? Phải chốt trong grading rules.
8. **Template IELTS strict:** Có bắt buộc 3 passages/4 sections/40 câu cho đề mang nhãn Full IELTS hay cho phép giáo viên tạo test custom? Mặc định hỗ trợ custom, dùng strict validation riêng cho template IELTS chính thức.
9. **Policy lời giải:** hiển thị đáp án chỉ khi PASS theo quy tắc hiện có; nếu muốn review khi FAIL cần quyết định sản phẩm mới và kiểm soát an toàn.
10. **Migration dữ liệu dịch:** kiểm tra dữ liệu cũ trước khi chuyển unique từ 1 bản dịch/assignment sang nhiều passage/assignment.

**Chốt:** Hệ thống có *hai phạm vi làm bài* (`PART`/`FULL`) cho cả Reading và Listening. Teacher author nội dung theo *part* và publish thành *test*. Student attempt và điểm được khóa theo scope. Reading dịch theo *passage* chỉ được mở bằng PASS hợp lệ ≥70%. Tất cả quyết định về quyền, grading và unlock do Backend thực thi; Frontend hiển thị đúng theo response contract.
