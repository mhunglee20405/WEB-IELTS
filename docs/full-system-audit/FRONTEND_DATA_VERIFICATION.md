# FRONTEND DATA VERIFICATION — 3-LEVEL CONSISTENCY AUDIT

This document verifies the end-to-end data flow across three distinct architectural tiers:
- **Level 1 (Persistence):** MongoDB Schema, collections, and document records.
- **Level 2 (API Transport):** NestJS REST controllers, DTO serialization, and `TransformInterceptor` envelope.
- **Level 3 (Presentation):** Next.js App Router pages, TanStack Query cache, Zod validation, and React components.

---

## 1. THREE-LEVEL VERIFICATION MATRIX

| Screen / Feature | Level 1: MongoDB Collection | Level 2: Backend Endpoint | Level 3: Frontend Component / Page | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Admin: Users List** | `users` collection | `GET /api/v1/users` | `app/admin/users/page.tsx` (`DataTable`) | **VERIFIED** |
| **Admin: Course Catalog** | `courses` (joined with `users`) | `GET /api/v1/courses` | `app/admin/courses/page.tsx` (`CourseTable`) | **VERIFIED** |
| **Admin: Audit Log** | `audit_logs` collection | `GET /api/v1/audit` | `app/admin/audit/page.tsx` (`AuditTable`) | **VERIFIED** |
| **Teacher: Dashboard** | Aggregated from `courses`, `extensions`, `translations` | `GET /api/v1/dashboard/teacher` | `app/teacher/dashboard/page.tsx` (`MetricsGrid`, `UpcomingLessons`) | **VERIFIED** |
| **Teacher: Courses** | `courses` (filtered by `teacherId`) | `GET /api/v1/courses/mine` | `app/teacher/courses/page.tsx` (`CourseCard`) | **VERIFIED** |
| **Teacher: Calendar** | `lessons` collection | `GET /api/v1/lessons` | `app/teacher/calendar/page.tsx` (`CalendarGrid`) | **VERIFIED** |
| **Teacher: Question Bank**| `exam_tests` collection | `GET /api/v1/exam-tests` | `app/teacher/question-bank/page.tsx` (`ExamCatalog`) | **VERIFIED** |
| **Teacher: Translations Queue** | `translation_submissions` | `GET /api/v1/teacher/translations` | `app/teacher/translations/page.tsx` (`ReviewTable`) | **VERIFIED** |
| **Student: Dashboard** | Aggregated from `enrollments`, `student_assignments` | `GET /api/v1/dashboard/student` | `app/student/dashboard/page.tsx` (`SummaryCards`) | **VERIFIED** |
| **Student: My Courses** | `enrollments` $\rightarrow$ `courses` | `GET /api/v1/courses/mine` | `app/student/courses/page.tsx` (`CourseList`) | **VERIFIED** |
| **Student: Calendar** | `lessons` (filtered by student courses) | `GET /api/v1/lessons/mine` | `app/student/calendar/page.tsx` (`CalendarView`) | **VERIFIED** |
| **Student: Assignments** | `student_assignments` | `GET /api/v1/assignments/my` | `app/student/assignments/page.tsx` (`AssignmentTabs`) | **VERIFIED** |
| **Student: Practice Library**| `exam_tests` collection | `GET /api/v1/exam-tests` | `app/student/practice/page.tsx` (`PracticeCards`) | **VERIFIED** |
| **Student: Extensions** | `extensions` collection | `GET /api/v1/extensions/my` | `app/student/extensions/page.tsx` (`ExtensionHistory`) | **VERIFIED** |
| **Student: Penalties** | `penalties` collection | `GET /api/v1/students/:id/penalties` | `app/student/penalties/page.tsx` (`PenaltyLedger`) | **VERIFIED** |
| **Student: Profile** | `users` collection | `GET /api/v1/students/me/profile` | `app/student/profile/page.tsx` (`ProfileCard`) | **VERIFIED** |

---

## 2. DETAILED SCREEN-BY-SCREEN VERIFICATION

### 2.1 Admin Courses Page (`/admin/courses`)
- **Level 1 (DB):** Stored course document:
  ```json
  {
    "_id": "6736...101",
    "title": "IELTS Intensive Masterclass 6.5 - 7.5",
    "code": "IELTS-75-A",
    "type": "group",
    "teacherId": "6736...002",
    "status": "active"
  }
  ```
- **Level 2 (API):** Backend formats `teacherId` to string and populates `teacherName`:
  ```json
  {
    "id": "6736...101",
    "title": "IELTS Intensive Masterclass 6.5 - 7.5",
    "teacherId": "6736...002",
    "teacherName": "Thầy Đặng Tuấn Minh",
    "startBand": 6.0,
    "targetBand": 7.5
  }
  ```
- **Level 3 (UI):** Zod preprocessor validates schema. Cell renders `teacherName` safely. Previous React crash (*"Objects are not valid as a React child"*) is completely eliminated.

### 2.2 Student Calendar Page (`/student/calendar`)
- **Level 1 (DB):** Stored lesson with `startAt: ISODate("2026-11-15T02:00:00Z")`, `meetUrl: "https://meet.google.com/abc-defg-hij"`.
- **Level 2 (API):** Emits dual-contract fields:
  ```json
  {
    "id": "les-01",
    "startTime": "2026-11-15T02:00:00.000Z",
    "endTime": "2026-11-15T03:30:00.000Z",
    "startAt": "2026-11-15T02:00:00.000Z",
    "endAt": "2026-11-15T03:30:00.000Z",
    "content": "Reading Strategy: Matching Headings",
    "description": "Reading Strategy: Matching Headings",
    "meetUrl": "https://meet.google.com/abc-defg-hij",
    "meetingUrl": "https://meet.google.com/abc-defg-hij",
    "type": "live_meet"
  }
  ```
- **Level 3 (UI):** `groupLessonsByDateKey` in `vn-time.ts` groups lessons by Vietnamese local date keys (`YYYY-MM-DD`). Google Meet button links directly to meeting URL. RangeError is resolved.

### 2.3 Student Practice Library (`/student/practice`)
- **Level 1 (DB):** Stored exam test with `skill: "READING"`, `allowedModes: ["FULL", "SKILL", "PART"]`.
- **Level 2 (API):** Emits test summary without answer keys or listening audio transcripts.
- **Level 3 (UI):** `tags` and `allowedModes` fall back to empty arrays `[]` if omitted, rendering skill badge and mode selector chips without throwing `.length` or `.includes` exceptions.

---

## 3. ERROR BOUNDARY & RESILIENT RENDERING VERIFICATION

To verify frontend robustness against network outages or unexpected payload shapes:
1. **StatusBadge Resilience:** Tested with unknown status `"pending_review"` $\rightarrow$ Falls back gracefully to `DEFAULT_STATUS_CONFIG` rendering a neutral grey badge rather than crashing React.
2. **Missing Optional Fields:** Verified with missing `teacherName`, `targetBand`, `description`, `notes` $\rightarrow$ Rendered with empty string or dashed placeholder (`—`).
3. **Empty Data States:** Tested empty queries on assignments, notifications, and extensions $\rightarrow$ Display accessible EmptyState components with helpful action links.

