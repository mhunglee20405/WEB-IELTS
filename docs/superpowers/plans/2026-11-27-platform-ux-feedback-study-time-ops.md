# Phase 12 — Platform UX, Anonymous Feedback, Study Time, Admin Password Reset & Teacher Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 6 approved Phase 12 features across `Backend/` and `frontend/` strictly conforming to [docs/contract/09-platform-ux-feedback-study-time-ops.md](../../contract/09-platform-ux-feedback-study-time-ops.md) with full TDD coverage and mock-mode parity.

**Architecture:** Additive Backend modules (`feedbacks`, `study-sessions`), targeted extensions to `users` (admin student password reset) and `jobs`/`notifications`/`mail` (1-week advance teacher scheduling reminder), paired with Frontend UI shell upgrades (live VN clock header, full-system Tailwind v4 dark/light theme), new Student/Admin/Teacher pages and global study-time heartbeat hook.

**Tech Stack:** NestJS 10, Mongoose 8, Redis / BullMQ, argon2id, Jest, Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query 5, Zod 4, Vitest, Testing Library.

**Spec & Contract:**
- Design: `docs/superpowers/specs/2026-11-27-platform-ux-feedback-study-time-ops-design.md`
- Contract: `docs/contract/09-platform-ux-feedback-study-time-ops.md`

## Global Constraints

- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` is enabled in `Backend/src/main.ts` — every Frontend body/query property must exist on the Backend DTO with `class-validator` decorators.
- `Feedback` documents must NEVER store `studentId`, `email`, `fullName`, IP, or user-agent.
- `POST /users/:id/reset-password` must NEVER store plaintext passwords, NEVER log `temporaryPassword`, must set `Cache-Control: no-store`, increment `tokenVersion`, revoke all Redis sessions, and restrict target to `UserRole.STUDENT`.
- Study-time heartbeats must enforce server-side min-gap (`15s`) and max credit (`90s`) per beat so multiple tabs or forged payloads cannot inflate totals.
- All Vietnam calendar/week calculations use `Asia/Ho_Chi_Minh` (UTC+7).
- Frontend mock router (`frontend/src/lib/api/mocks/router.ts`) must support all new endpoints under `NEXT_PUBLIC_API_MODE=mock`.
- Every task follows Red-Green-Refactor TDD and leaves `Backend` (`npm run build && npx jest --no-cache`) and `frontend` (`npx tsc --noEmit && npm test`) green.

## Review Focus

1. **Multi-tab / rapid-fire study heartbeat spam:** Two heartbeats sent 3 seconds apart for the same student must credit only the first (`accepted: true`) and return `accepted: false, creditedSeconds: 0` for the second, and a forged `deltaSeconds: 9999` must fail DTO validation (`400`). *(Pinned in Task 3)*
2. **True anonymity of Feedback:** Submitting a feedback as Student and reading it as Admin (`GET /feedbacks`) must return zero author fields (`studentId`, `email`, `fullName` are `undefined` both in DB document and API response), while a 6th submission on the same VN day returns `429 FEEDBACK_DAILY_LIMIT_EXCEEDED`. *(Pinned in Task 2)*
3. **Privilege guard on Admin password reset:** Calling `POST /users/:id/reset-password` targeting an `ADMIN` or `TEACHER` account must fail with `403 ADMIN_RESET_STUDENT_ONLY`; targeting a `STUDENT` must hash with `argon2id`, increment `tokenVersion`, call `revokeAllUserSessions`, write `AuditLog` without password text, and return `temporaryPassword` once. *(Pinned in Task 4)*
4. **Teacher scoping on study time & weekly reminder idempotency:** Teacher A querying `/study-sessions/students/:studentB` (not enrolled in Teacher A's courses) must get `403`; running the reminder check twice in the same ISO week must send only 1 `ASSIGNMENT_SCHEDULE_REMINDER` notification per course. *(Pinned in Task 3 & Task 5)*
5. **Hydration-safe VN clock & FOUC-free Dark Mode:** Header renders the 4-part VN clock (`HH:mm • Thứ ... • Tuần ... • DD/MM/YYYY`) without `GMT+7` and without SSR hydration warnings; toggling Light/Dark updates `document.documentElement.classList.contains('dark')` and persists to `localStorage`. *(Pinned in Task 6)*

---

### Task 1: Schemas & Enums Foundation (Backend + Frontend Shared Types)

**Files:**
- Modify: `Backend/src/database/schemas/enums.ts`
- Create: `Backend/src/database/schemas/feedback.schema.ts`
- Create: `Backend/src/database/schemas/student-study-daily.schema.ts`
- Modify: `Backend/src/database/schemas/student-profile.schema.ts`
- Modify: `Backend/src/database/schemas/user.schema.ts`
- Modify: `Backend/src/database/schemas/schemas-integrity.spec.ts`

**Interfaces:**
- Produces:
  - `FeedbackCategory`, `FeedbackStatus`, `NotificationType.ASSIGNMENT_SCHEDULE_REMINDER` in `enums.ts`.
  - `Feedback` / `FeedbackSchema` (`collection: 'feedbacks'`, indexes `{ status: 1, createdAt: -1 }`, `{ category: 1, createdAt: -1 }`, zero author PII paths).
  - `StudentStudyDaily` / `StudentStudyDailySchema` (`collection: 'student_study_daily'`, unique index `{ studentId: 1, dateVn: 1 }`, index `{ dateVn: 1 }`).
  - `StudentProfile.totalStudySeconds` (default `0`, min `0`) and `StudentProfile.lastStudyHeartbeatAt`.
  - `User.mustChangePassword` (default `false`).

- [ ] **Step 1: Write failing schema tests in `Backend/src/database/schemas/schemas-integrity.spec.ts`**
  Assert all new enums, indexes, `FeedbackSchema` has NO `studentId`/`email`/`fullName` paths, `StudentStudyDailySchema` has unique `{ studentId: 1, dateVn: 1 }`, `StudentProfileSchema` has `totalStudySeconds`/`lastStudyHeartbeatAt`, and `UserSchema` has `mustChangePassword`.
- [ ] **Step 2: Run test to verify RED**
  Run: `cd Backend && npx jest src/database/schemas/schemas-integrity.spec.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement schemas & enum additions**
  Create `feedback.schema.ts`, `student-study-daily.schema.ts`, and update `enums.ts`, `student-profile.schema.ts`, `user.schema.ts`.
- [ ] **Step 4: Run test & build to verify GREEN**
  Run: `cd Backend && npx jest src/database/schemas/schemas-integrity.spec.ts && npm run build`
  Expected: PASS, exit 0.
- [ ] **Step 5: Commit**
  `git commit -m "feat(mongo): add Feedback, StudentStudyDaily schemas and Phase 12 profile/user/enum fields"`

---

### Task 2: Anonymous Feedback Backend Module (`feedbacks`)

**Files:**
- Create: `Backend/src/modules/feedbacks/dto/feedback.dto.ts`
- Create: `Backend/src/modules/feedbacks/feedbacks.service.ts`
- Create: `Backend/src/modules/feedbacks/feedbacks.controller.ts`
- Create: `Backend/src/modules/feedbacks/feedbacks.module.ts`
- Modify: `Backend/src/app.module.ts` (register `FeedbacksModule`)
- Test (Create): `Backend/src/modules/feedbacks/feedbacks.service.spec.ts`

**Interfaces:**
- Consumes: `FeedbackSchema`, `FeedbackCategory`, `FeedbackStatus` (Task 1), `AuditService`, Redis client / in-memory fallback for daily rate-limit key `feedback:rate:<sha256(userId:dateVn)>`.
- Produces:
  - `POST /api/v1/feedbacks` (`STUDENT`, max 5/VN-day, returns `{ id, category, rating, status, createdAt }`)
  - `GET /api/v1/feedbacks` (`ADMIN`, pagination + `status`/`category`/`search` filters + `unreadCount`)
  - `PATCH /api/v1/feedbacks/:id/status` (`ADMIN`, updates `status`/`adminNote`/`reviewedBy`/`reviewedAt` + `AuditLog`)

- [ ] **Step 1: Write failing unit tests in `feedbacks.service.spec.ts`**
  Cover: (a) creating feedback stores zero author PII (`studentId`/`email`/`fullName` absent), (b) 6th submission on same VN day throws `429` with code `FEEDBACK_DAILY_LIMIT_EXCEEDED`, (c) `findAll` filters by `status`/`category`/escaped `search` and returns `unreadCount`, (d) `updateStatus` updates status/adminNote and writes `AuditLog`.
- [ ] **Step 2: Run test to verify RED**
  Run: `cd Backend && npx jest src/modules/feedbacks/feedbacks.service.spec.ts`
- [ ] **Step 3: Implement `FeedbacksModule`, controller, service, DTOs and register in `AppModule`**
- [ ] **Step 4: Run tests & build to verify GREEN**
  Run: `cd Backend && npx jest src/modules/feedbacks/feedbacks.service.spec.ts && npm run build`
- [ ] **Step 5: Commit**
  `git commit -m "feat(feedbacks): add anonymous student feedback module with daily rate limit and admin triage"`

---

### Task 3: Student Online Study Time Backend Module (`study-sessions`)

**Files:**
- Create: `Backend/src/modules/study-sessions/dto/study-session.dto.ts`
- Create: `Backend/src/modules/study-sessions/study-sessions.service.ts`
- Create: `Backend/src/modules/study-sessions/study-sessions.controller.ts`
- Create: `Backend/src/modules/study-sessions/study-sessions.module.ts`
- Modify: `Backend/src/app.module.ts` (register `StudySessionsModule`)
- Test (Create): `Backend/src/modules/study-sessions/study-sessions.service.spec.ts`

**Interfaces:**
- Consumes: `StudentStudyDailySchema`, `StudentProfileSchema`, `CourseSchema`, `EnrollmentSchema`, `getVnDateString` / VN date helpers.
- Produces:
  - `POST /api/v1/study-sessions/heartbeat` (`STUDENT`): enforces `deltaSeconds` 1..90, ignores beats `< 15s` since `lastStudyHeartbeatAt`, credits `min(deltaSeconds, elapsed, 90)` atomically to `StudentStudyDaily` and `StudentProfile.totalStudySeconds`.
  - `GET /api/v1/study-sessions/me/summary` (`STUDENT`)
  - `GET /api/v1/study-sessions/teacher/summary` (`TEACHER`, `ADMIN`, optional `courseId`, strictly scoped to teacher's active enrolled students)
  - `GET /api/v1/study-sessions/students/:studentId` (`TEACHER`, `ADMIN`, optional `days` 7..90, strictly scoped to teacher's enrolled students)

- [ ] **Step 1: Write failing unit tests in `study-sessions.service.spec.ts`**
  Cover: (a) first heartbeat credits `deltaSeconds` (capped at 90), (b) rapid heartbeat within `< 15s` returns `accepted: false, creditedSeconds: 0`, (c) `getTeacherSummary` returns `{ items: [] }` when teacher has 0 courses and throws `403` on unowned `courseId`, (d) `getStudentDetail` throws `403` when student is not enrolled in teacher's courses and returns daily breakdown + totals when enrolled.
- [ ] **Step 2: Run test to verify RED**
  Run: `cd Backend && npx jest src/modules/study-sessions/study-sessions.service.spec.ts`
- [ ] **Step 3: Implement `StudySessionsModule`, controller, service, DTOs and register in `AppModule`**
- [ ] **Step 4: Run tests & build to verify GREEN**
  Run: `cd Backend && npx jest src/modules/study-sessions/study-sessions.service.spec.ts && npm run build`
- [ ] **Step 5: Commit**
  `git commit -m "feat(study-sessions): add student online study-time heartbeat and teacher summary APIs"`

---

### Task 4: Admin Reset Student Password Endpoint (`POST /users/:id/reset-password`)

**Files:**
- Modify: `Backend/src/modules/users/dto/update-user.dto.ts` (or create `dto/admin-reset-password.dto.ts`)
- Modify: `Backend/src/modules/users/users.service.ts`
- Modify: `Backend/src/modules/users/users.controller.ts`
- Modify: `Backend/src/modules/users/users.module.ts` (ensure `AuthModule` / session revocation access without circular DI issues using `forwardRef` if needed)
- Test: `Backend/src/modules/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `User.mustChangePassword` (Task 1), `AuthService.revokeAllUserSessions`, `AuditService`.
- Produces:
  - `POST /api/v1/users/:id/reset-password` (`ADMIN` only, sets `Cache-Control: no-store`):
    - Rejects non-`STUDENT` targets with `ForbiddenException({ code: 'ADMIN_RESET_STUDENT_ONLY', message: '...' })`.
    - Generates readable strong temp password (or uses validated `dto.newPassword`), hashes with `argon2id`, sets `mustChangePassword = dto.requirePasswordChange ?? true`, increments `tokenVersion += 1`, calls `revokeAllUserSessions`, writes `AuditLog` (`ADMIN_RESET_STUDENT_PASSWORD`, no password in metadata), and returns `{ userId, email, temporaryPassword, mustChangePassword, revokedAllSessions }`.
  - `UsersService.sanitize(user)` includes `mustChangePassword: Boolean(user.mustChangePassword)`.

- [ ] **Step 1: Write failing tests in `users.service.spec.ts`**
  Cover: (a) resets `STUDENT` password with auto-generated password, hashes with `argon2id` (verifiable via `argon2.verify`), increments `tokenVersion`, calls `revokeAllUserSessions`, logs `AuditLog` without leaking password, (b) rejects `ADMIN` and `TEACHER` targets with `403 ADMIN_RESET_STUDENT_ONLY`, (c) respects custom `newPassword` and `requirePasswordChange: false`.
- [ ] **Step 2: Run test to verify RED**
  Run: `cd Backend && npx jest src/modules/users/users.service.spec.ts`
- [ ] **Step 3: Implement DTO, service method, and controller endpoint with `Cache-Control: no-store`**
- [ ] **Step 4: Run tests & build to verify GREEN**
  Run: `cd Backend && npx jest src/modules/users/users.service.spec.ts && npm run build`
- [ ] **Step 5: Commit**
  `git commit -m "feat(users): add admin one-time student password reset with session revocation and audit log"`

---

### Task 5: Teacher 1-Week Advance Assignment Scheduling Reminder Job

**Files:**
- Modify: `Backend/src/modules/jobs/jobs.constants.ts` (add `QUEUE_REMINDERS`, `JOB_CHECK_TEACHER_SCHEDULE`)
- Create: `Backend/src/modules/jobs/schedulers/assignment-reminder.scheduler.ts`
- Create: `Backend/src/modules/jobs/processors/assignment-reminder.processor.ts`
- Create: `Backend/src/modules/jobs/assignment-reminder.service.ts`
- Modify: `Backend/src/modules/jobs/jobs.controller.ts` (add `POST /jobs/reminders/trigger` for `ADMIN`)
- Modify: `Backend/src/modules/jobs/jobs.module.ts`
- Modify: `Backend/src/modules/mail/mail.service.ts` (add `'assignment-schedule-reminder'` template)
- Test: `Backend/src/modules/jobs/jobs.service.spec.ts` & `Backend/src/modules/mail/mail.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationType.ASSIGNMENT_SCHEDULE_REMINDER` (Task 1), `NotificationsService`, `MailService`, `Course`, `Assignment`.
- Produces:
  - `AssignmentReminderService.checkAndRemindTeachers(now?: Date)` scanning `Course.status === ACTIVE` (with `!endAt || endAt > now`), checking whether an `Assignment` (`status ∈ {PUBLISHED, SCHEDULED, AVAILABLE}`) has `openAt` in `[now + 1d, now + 7d]` (VN bounds), and creating 1 notification per `(teacherId, courseId, isoWeek)` using idempotency key `notif:schedule-reminder:<teacherId>:<courseId>:<isoWeek>`.
  - Repeatable BullMQ cron `0 8 * * *` (`Asia/Ho_Chi_Minh`) + `POST /api/v1/jobs/reminders/trigger` (`ADMIN`).

- [ ] **Step 1: Write failing tests in `jobs.service.spec.ts` and `mail.service.spec.ts`**
  Cover: (a) active course with 0 assignments in next 7 days sends 1 `ASSIGNMENT_SCHEDULE_REMINDER` notification, (b) active course that already has a scheduled assignment in next 7 days is skipped, (c) calling twice in the same ISO week does not duplicate notification (idempotency key), (d) `mailService.renderTemplate('assignment-schedule-reminder', ...)` renders course title & week info.
- [ ] **Step 2: Run test to verify RED**
  Run: `cd Backend && npx jest src/modules/jobs/jobs.service.spec.ts src/modules/mail/mail.service.spec.ts`
- [ ] **Step 3: Implement `AssignmentReminderService`, scheduler, processor, controller route, and mail template**
- [ ] **Step 4: Run full Backend build & Jest suite to verify GREEN**
  Run: `cd Backend && npm run build && npx jest --no-cache`
  Expected: 0 failures across entire Backend.
- [ ] **Step 5: Commit**
  `git commit -m "feat(jobs): add weekly 1-week advance assignment scheduling reminder for teachers"`

---

### Task 6: Frontend UI Shell — Live VN Clock Header & Full-System Light/Dark Theme

**Files:**
- Create: `frontend/src/lib/time/vn-clock.ts` (pure formatter returning `HH:mm • Thứ X • Tuần WW • DD/MM/YYYY` in `Asia/Ho_Chi_Minh` using ISO-8601 week calculation)
- Create: `frontend/src/components/theme/theme-provider.tsx` (`light` | `dark` | `system`, `localStorage` persistence, `ThemeToggle` button)
- Modify: `frontend/src/app/globals.css` (`@custom-variant dark (&:where(.dark, .dark *));`, dark `:root.dark` semantic variables & base overrides for cards/inputs/tables/dialogs/header/sidebar)
- Modify: `frontend/src/app/layout.tsx` (inline anti-FOUC script reading `web_ielts_theme` before paint)
- Modify: `frontend/src/app/providers.tsx` (wrap with `ThemeProvider`)
- Modify: `frontend/src/components/layout/header.tsx` (replace `GMT+7` badge with live VN clock + `ThemeToggle`)
- Modify: `frontend/src/components/layout/app-shell.tsx`, `sidebar.tsx`, `footer.tsx` (dark mode classes/tokens)
- Test (Create): `frontend/src/lib/time/vn-clock.test.ts` & `frontend/src/components/theme/theme-provider.test.tsx`

**Interfaces:**
- Produces: `formatVnHeaderClock(date: Date): string`, `useTheme()`, `<ThemeProvider>`, `<ThemeToggle />`.

- [ ] **Step 1: Write failing tests (`vn-clock.test.ts`, `theme-provider.test.tsx`, update `app-shell.test.tsx` if asserting old `GMT+7` text)**
  Assert `formatVnHeaderClock(new Date('2026-11-27T06:45:00.000Z'))` outputs `'13:45 • Thứ 6 • Tuần 48 • 27/11/2026'` (no `GMT+7`), and `ThemeToggle` toggles `.dark` on `document.documentElement` and persists to `localStorage`.
- [ ] **Step 2: Run tests to verify RED**
  Run: `cd frontend && npx vitest run src/lib/time/vn-clock.test.ts src/components/theme/theme-provider.test.tsx src/components/layout/app-shell.test.tsx`
- [ ] **Step 3: Implement live VN clock, `ThemeProvider`/`ThemeToggle`, `globals.css` dark tokens, and layout updates**
- [ ] **Step 4: Run tests & typecheck to verify GREEN**
  Run: `cd frontend && npx tsc --noEmit && npx vitest run src/lib/time/vn-clock.test.ts src/components/theme/theme-provider.test.tsx src/components/layout/app-shell.test.tsx`
- [ ] **Step 5: Commit**
  `git commit -m "feat(frontend): replace GMT+7 badge with live VN clock and add full-system light/dark theme"`

---

### Task 7: Frontend API Layer, Feedback Pages, Study-Time Heartbeat/Columns, Admin Password Reset & Notifications

**Files:**
- Modify: `frontend/src/lib/api/types.ts`, `schemas.ts`, `query-keys.ts`, `error.ts`, `endpoints/index.ts`, `endpoints/users.ts`, `mocks/router.ts`
- Create: `frontend/src/lib/api/endpoints/feedbacks.ts`
- Create: `frontend/src/lib/api/endpoints/study-sessions.ts`
- Create: `frontend/src/hooks/use-study-time-heartbeat.ts` (wired into `frontend/src/app/student/layout.tsx`)
- Create: `frontend/src/app/student/feedback/page.tsx` (add nav link in `student/layout.tsx`)
- Create: `frontend/src/app/admin/feedbacks/page.tsx` (add nav link in `admin/layout.tsx`)
- Modify: `frontend/src/lib/teacher/data-helpers.ts`, `frontend/src/app/teacher/students/page.tsx`, `frontend/src/app/teacher/students/[id]/page.tsx` (show formatted Total & 7-day study time)
- Modify: `frontend/src/app/admin/users/page.tsx` (add "Cấp lại mật khẩu" action button + reveal-once modal with Copy button for `student` rows)
- Modify: `frontend/src/app/student/notifications/page.tsx` & teacher notifications meta (`assignment_schedule_reminder` badge/label)
- Test (Create): `frontend/src/lib/api/phase12-contracts.test.ts` & `frontend/src/components/phase12/phase12-features.test.tsx`

**Interfaces:**
- Consumes: All endpoints specified in `docs/contract/09-platform-ux-feedback-study-time-ops.md`.
- Produces: `feedbacksApi`, `studySessionsApi`, `usersApi.resetStudentPassword`, `useStudyTimeHeartbeat`, Student Feedback page, Admin Feedbacks inbox, Teacher Students study-time display, Admin Reset Password modal.

- [ ] **Step 1: Write failing contract & component tests (`phase12-contracts.test.ts`, `phase12-features.test.tsx`)**
  Cover: (a) Zod schemas for `Feedback`, `StudySummary`, `AdminResetPasswordResponse`, `NotificationType.assignment_schedule_reminder` and error code messages, (b) Student Feedback form submits anonymously and shows confirmation, (c) Admin Feedbacks page renders anonymous items and updates status, (d) Teacher Students table renders formatted study time (`11g 50p` / `4g 00p`), (e) Admin Users "Cấp lại mật khẩu" modal only appears for student rows and displays one-time `temporaryPassword` with Copy button.
- [ ] **Step 2: Run tests to verify RED**
  Run: `cd frontend && npx vitest run src/lib/api/phase12-contracts.test.ts src/components/phase12/phase12-features.test.tsx`
- [ ] **Step 3: Implement Frontend API clients, mock handlers, heartbeat hook, and UI pages**
- [ ] **Step 4: Run full Frontend & Backend verification gate**
  Run:
  - `cd Backend && npm run build && npx jest --no-cache`
  - `cd frontend && npx tsc --noEmit && npm test && npm run build`
  Expected: 0 TypeScript errors, 0 failed tests, both production builds exit 0.
- [ ] **Step 5: Commit**
  `git commit -m "feat(frontend): add anonymous feedback, study-time tracking, admin password reset UI, and reminder badges"`
