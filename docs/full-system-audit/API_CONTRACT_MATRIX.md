# API CONTRACT MATRIX — WEB-IELTS LMS

This document details the complete API contract alignment between the **Next.js Frontend** (`frontend/src/lib/api/`) and the **NestJS Backend** (`Backend/src/modules/`).

**Global API Prefix:** `/api/v1`  
**Envelope Format:** Success responses return `{ statusCode: number, data: T, timestamp: string }`. Frontend unrolls this wrapper in `client.ts`.  
**Error Envelope Format:** `{ statusCode: number, code: string, message: string, errors?: string[], timestamp: string }`.

---

## 1. AUTHENTICATION & USERS MODULE

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/auth/login` | `POST` | Public | `LoginRequest` (`email`, `password`) | `LoginDto` | `{ user: UserProfile, tokens: { accessToken, refreshToken } }` | Synchronized | Tokens stored in Redis & session storage. |
| `/auth/refresh` | `POST` | Public | `{ refreshToken: string }` | `RefreshTokenDto` | `{ accessToken: string, refreshToken: string }` | Synchronized | Token rotation enforced. |
| `/auth/logout` | `POST` | Authenticated | `{ refreshToken: string }` | `LogoutDto` | `{ message: string }` | Synchronized | Revokes refresh token in Redis. |
| `/auth/me` | `GET` | Authenticated | None | None | `UserProfile` | Synchronized | Returns current user details and active roles. |
| `/users` | `GET` | Admin, Teacher | Query: `role`, `search`, `page`, `limit` | `UserQueryDto` | `PaginatedResponse<UserProfile>` | Synchronized | **Repaired:** Allowed Teacher role to query students (`role=student`) for enrollment. |
| `/users` | `POST` | Admin | `CreateUserRequest` | `CreateUserDto` | `UserProfile` | Synchronized | Admin user creation. |
| `/users/:id` | `PATCH` | Admin | `UpdateUserRequest` | `UpdateUserDto` | `UserProfile` | Synchronized | Supports status change (`active`/`inactive`). |

---

## 2. COURSES & ENROLLMENTS MODULE

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/courses` | `GET` | Admin, Teacher, Student | Query: `status`, `search`, `page`, `limit` | `CourseQueryDto` | `PaginatedResponse<Course>` | Synchronized | **Repaired:** Student calling `/courses` is routed internally to `findMine()`. |
| `/courses/mine` | `GET` | Teacher, Student | Query: `page`, `limit` | `PaginationQueryDto` | `PaginatedResponse<Course>` | Synchronized | Returns enrolled courses for student; assigned courses for teacher. |
| `/courses` | `POST` | Admin | `CreateCourseRequest` | `CreateCourseDto` | `Course` | Synchronized | Validates `startBand <= targetBand`. |
| `/courses/:id` | `GET` | Authenticated | None | None | `Course` | Synchronized | Includes populated `teacherId` and `teacherName`. |
| `/courses/:id` | `PATCH` | Admin, Teacher | `UpdateCourseRequest` | `UpdateCourseDto` | `Course` | Synchronized | Validates course status transitions. |
| `/courses/:id/students` | `GET` | Admin, Teacher | Query: `status`, `page`, `limit` | `PaginationQueryDto` | `PaginatedResponse<EnrollmentRecord>` | Synchronized | Lists enrolled students with enrollment status. |
| `/courses/:id/students` | `POST` | Admin, Teacher | `{ studentId: string }` | `EnrollStudentDto` | `EnrollmentRecord` | Synchronized | Creates active enrollment. |
| `/courses/:id/students/:studentId` | `DELETE` | Admin, Teacher | None | None | `{ ok: boolean }` | Synchronized | Unenrolls / deactivates student from course. |

---

## 3. LESSONS & CALENDAR MODULE

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/lessons` | `GET` | Admin, Teacher | Query: `courseId`, `startDate`, `endDate` | `LessonQueryDto` | `Lesson[]` | Synchronized | Scoped to teacher courses if caller is Teacher. |
| `/lessons/mine` | `GET` | Student, Teacher | Query: `startDate`, `endDate` | `LessonQueryDto` | `Lesson[]` | Synchronized | **Repaired:** Backend dual-emits `startTime`/`endTime` and `startAt`/`endAt`, plus `meetUrl`/`meetingUrl` to satisfy frontend contract. |
| `/lessons` | `POST` | Teacher, Admin | `CreateLessonRequest` (`courseId`, `title`, `startAt`/`startTime`, `endAt`/`endTime`, `meetUrl`) | `CreateLessonDto` | `Lesson` | Synchronized | Accepts both canonical and legacy date/meetUrl keys. Validates Google Meet URL format. |
| `/lessons/:id` | `PATCH` | Teacher, Admin | `UpdateLessonRequest` | `UpdateLessonDto` | `Lesson` | Synchronized | Updates schedule and Google Meet link. |
| `/lessons/:id` | `DELETE` | Teacher, Admin | None | None | `{ ok: boolean }` | Synchronized | Marks lesson as `cancelled` or deletes. |

---

## 4. ASSIGNMENTS, EXERCISES & SUBMISSIONS

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/assignments` | `GET` | Admin, Teacher | Query: `courseId`, `status`, `page`, `limit` | `AssignmentQueryDto` | `PaginatedResponse<Assignment>` | Synchronized | Scoped to teacher cohorts. |
| `/assignments` | `POST` | Teacher | `CreateAssignmentRequest` (`courseId`, `exerciseId`/`examTestId`, `assignedDate`) | `CreateAssignmentDto` | `Assignment` | Synchronized | Automatically calculates [06:00, 06:00 next day) window in `Asia/Ho_Chi_Minh`. |
| `/assignments/my` | `GET` | Student | Query: `status`, `page`, `limit` | `AssignmentQueryDto` | `PaginatedResponse<StudentAssignment>` | Synchronized | Returns student assignments across lifecycle states (`available`, `submitted`, `passed`, `failed`, `overdue`). |
| `/assignments/my/:id` | `GET` | Student | None | None | `StudentAssignmentDetail` | Synchronized | Includes exercise questions, student submission status, and translation unlock flag. |
| `/assignments/my/:id/submit` | `POST` | Student | `{ answers: Record<string, string> }` | `SubmitAnswersDto` | `SubmissionResult` | Synchronized | Evaluates auto-grading, calculates band score, updates assignment status. |

---

## 5. EXAM ENGINE V2, CBT PRACTICE & QUESTION BANK

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/exam-tests` | `GET` | Authenticated | Query: `skill`, `type`, `search`, `page`, `limit` | `ExamTestQueryDto` | `PaginatedResponse<ExamTestSummary>` | Synchronized | **Repaired:** Defaults empty arrays for `tags: []` and `allowedModes: []` to prevent `.length` crashes. |
| `/exam-tests` | `POST` | Teacher, Admin | `CreateExamTestRequest` | `CreateExamTestDto` | `ExamTestDetail` | Synchronized | Teacher Question Bank authoring. |
| `/exam-tests/:id` | `GET` | Authenticated | None | None | `ExamTestDetail` | Synchronized | Omits answer keys and audio transcripts when accessed by Student before completion. |
| `/exam-attempts/start` | `POST` | Student | `{ testId: string, mode: "FULL" \| "SKILL" \| "PART", partNumber?: number }` | `StartAttemptDto` | `ExamAttemptSession` | Synchronized | Initializes timer and session state. |
| `/exam-attempts/:id/submit` | `POST` | Student | `{ answers: Record<string, string> }` | `SubmitAttemptDto` | `ExamAttemptResult` | Synchronized | Auto-grades CBT session, computes IELTS band score (1.0–9.0). |

---

## 6. READING TRANSLATIONS MODULE

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/reading-translations/:id` | `GET` | Student | None | None | `TranslationWorkspace` | Synchronized | Requires $\ge 70\%$ pass score on parent reading exercise to unlock. |
| `/reading-translations/:id/submit`| `POST` | Student | `{ paragraphs: { index: number, vietnameseText: string }[] }` | `SubmitTranslationDto` | `TranslationRecord` | Synchronized | Transitions status from `draft` to `submitted`. |
| `/teacher/translations` | `GET` | Teacher | Query: `status`, `page`, `limit` | `PaginationQueryDto` | `PaginatedResponse<TranslationReviewItem>` | Synchronized | Queue of student submissions awaiting review. |
| `/teacher/translations/:id/review`| `POST` | Teacher | `{ score: number, feedback: string }` | `ReviewTranslationDto` | `TranslationRecord` | Synchronized | Transitions status to `reviewed` and triggers notification. |

---

## 7. EXTENSIONS & PENALTIES MODULE

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/extensions/my` | `GET` | Student | Query: `status`, `page`, `limit` | `PaginationQueryDto` | `PaginatedResponse<ExtensionRequest>` | Synchronized | Lists student extension requests and quota used this month. |
| `/extensions` | `POST` | Student | `{ studentAssignmentId: string, reason: string }` | `CreateExtensionDto` | `ExtensionRequest` | Synchronized | Enforces max 2 extensions per month in Vietnam timezone. |
| `/teacher/extensions` | `GET` | Teacher | Query: `status`, `page`, `limit` | `PaginationQueryDto` | `PaginatedResponse<TeacherExtensionItem>` | Synchronized | Teacher review queue for extension requests. |
| `/teacher/extensions/:id/decision`| `POST`| Teacher | `{ decision: "approved" \| "rejected", comment?: string }` | `ExtensionDecisionDto` | `ExtensionRequest` | Synchronized | Pushes deadline if approved; clears overdue status. |
| `/students/:id/penalties` | `GET` | Teacher, Admin | Query: `status`, `page`, `limit` | `PaginationQueryDto` | `PaginatedResponse<PenaltyRecord>` | Synchronized | Student penalty history. |
| `/students/:id/penalties/reverse`| `POST` | Teacher, Admin | `{ penaltyId: string, reason: string }` | `ReversePenaltyDto` | `PenaltyRecord` | Synchronized | Reverses penalty with audit tracking. |

---

## 8. DASHBOARD & NOTIFICATIONS

| Endpoint | Method | Roles | Frontend Request Schema | Backend DTO | Response Type | Status | Contract Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/dashboard/student` | `GET` | Student | None | None | `StudentDashboardSummary` | Synchronized | Aggregates upcoming lessons, assignments, target band, and extensions used. |
| `/dashboard/teacher` | `GET` | Teacher | None | None | `TeacherDashboardSummary` | Synchronized | Aggregates active courses, pending translations, pending extensions, and overdue count. |
| `/notifications` | `GET` | Authenticated | Query: `read` / `isRead`, `page`, `limit` | `NotificationQueryDto` | `PaginatedResponse<NotificationItem>` | Synchronized | **Repaired:** Backend DTO accepts both `read` and `isRead` query parameters. |
| `/notifications/:id/read` | `PATCH` | Authenticated | None | None | `NotificationItem` | Synchronized | Marks notification as read. |
| `/notifications/read-all` | `PATCH` | Authenticated | None | None | `{ updatedCount: number }` | Synchronized | Marks all notifications as read. |

