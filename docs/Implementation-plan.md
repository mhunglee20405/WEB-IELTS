# IELTS LMS — Frontend Implementation Plan

> **Branch:** `feat/frontend` (created from `develop` at `fc53887`)  
> **Scope:** **Frontend only** — Next.js App Router (React + TypeScript) client integrating with the NestJS `/api/v1` REST contract. No backend, MongoDB, Redis, or BullMQ implementation is included in this repository.  
> **Source Docs:** [IELTS_LMS_FRONTEND_SYSTEM_DESIGN.md](file:///d:/WORK/WEB-IELTS/docs/IELTS_LMS_FRONTEND_SYSTEM_DESIGN.md), `docs/IELTS_LMS_System_Design_Tong_Quan.docx`

---

## 1. Current Repository Baseline & Environment Notes

- **Repository state:** Clean repo on `feat/frontend` containing only [README.md](file:///d:/WORK/WEB-IELTS/README.md) and `docs/`. No `package.json`, Next.js scaffold, or source code exists yet.
- **Toolchain note:** `node`, `npm`, and `pnpm` were not reachable in the sandboxed shell (`PATH` references `C:\nvm4w\nodejs` and `C:\Users\PC\AppData\Local\nvm`). Before bootstrapping Next.js in Phase 1, we will confirm/activate Node.js (≥ 20 LTS) and package manager (`pnpm` or `npm`).
- **Backend dependency reality:** Per Section 6.2–6.3 of [IELTS_LMS_FRONTEND_SYSTEM_DESIGN.md](file:///d:/WORK/WEB-IELTS/docs/IELTS_LMS_FRONTEND_SYSTEM_DESIGN.md), the separate NestJS starter only covers `EXISTING` baseline routes (`Auth login/me`, `Users`, `Courses`, `Assignments`), while `Lessons`, `Exercises`, `Submissions/Grading/Review`, `Translations`, `Extensions`, `Penalties`, `Notifications`, `Dashboards`, `Media`, and `Auth refresh/reset` are marked **`TO BUILD`**.
  - **Contract strategy:** Build a strongly typed `/api/v1` REST client (`NEXT_PUBLIC_API_BASE_URL`) as the primary production path, paired with an **explicit, dev-only mock transport toggle** (`NEXT_PUBLIC_API_MODE=live | mock`) so every screen can be built, demoed, and tested independently without leaking into production builds or violating answer-key security rules.

---

## 2. Core Frontend Architecture & Non-Negotiable Rules

### 2.1 Tech Stack (per Section 3.1 & ADR-03)
- **Framework:** Next.js (App Router) + React + TypeScript (`strict: true`)
- **Styling & UI:** Tailwind CSS + accessible reusable primitives (e.g., Radix/shadcn-style components, Lucide icons)
- **Forms & Validation:** `react-hook-form` + `zod` (`@hookform/resolvers`)
- **Server State:** `@tanstack/react-query`
- **Security & Utilities:** `dompurify` / `isomorphic-dompurify` (sanitize Reading passage HTML), `date-fns` / `date-fns-tz` or native `Intl.DateTimeFormat` locked to `Asia/Ho_Chi_Minh`
- **Testing:** Vitest + React Testing Library (unit/component) and Playwright (end-to-end browser verification)

### 2.2 Security, Trust Boundaries & Data Rules
1. **Zero direct DB/storage access:** Never connect to MongoDB or embed object-storage credentials in Next.js.
2. **Zero answer-key leakage before PASS (`>= 70%`):**
   - Strictly separate `StudentExerciseSafeDto` (no `grading.acceptedAnswers`, aliases, or explanations) from `TeacherExerciseAuthoringDto`.
   - Never cache, prefetch, or serialize answer keys in client state/HTML/props before PASS; always gate `/student/assignments/[studentAssignmentId]/review` via `GET /student-assignments/:id/review` and handle `403 ANSWER_LOCKED` gracefully.
3. **API-driven policy state:** Because business rules marked `[P]` / `DECISION REQUIRED` (Section 16.3 & ADR-08..11) are resolved server-side (completion rule, attempt limit, translation requirement, monthly extension quota counting, pending penalty pause), the UI renders server-authoritative flags (`canAttempt`, `attemptsRemaining`, `answerReviewUnlocked`, `translationAvailable`, `extensionsUsedThisMonth`, `effectiveDueAt`, `penaltyApplied`) instead of duplicating policy math client-side.
4. **Submission idempotency:** Generate and attach a per-attempt `Idempotency-Key` header on `POST /student-assignments/:id/submissions`, disable duplicate clicks while pending, and never auto-retry unsafe mutations.
5. **Auth & multi-role handling:** Support `roles: UserRole[]` (`student`, `teacher`, `admin`). Store access token in memory (plus optional short-lived session bootstrap / `POST /auth/refresh` with `credentials: 'include'` when backend refresh cookie is enabled) and redirect cleanly on `401` / `/unauthorized`. Note: UI route guards are convenience only; backend enforces real authorization.
6. **Timezone discipline:** Send/receive ISO 8601 UTC timestamps on the wire; format all calendars, daily deadlines (`00:00`–`23:59` VN time, exclusive next-day `00:00` display clarity), and lesson times in `Asia/Ho_Chi_Minh` (or course timezone).

---

## 3. Target Directory & Module Layout

Assuming Next.js lives directly at repository root `d:/WORK/WEB-IELTS` (keeping `docs/` untouched):

```text
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── unauthorized/page.tsx
│   ├── (portal)/
│   │   ├── layout.tsx                   # Role-aware shell, sidebar, role switcher, notification bell
│   │   ├── student/...                  # 11 Student routes
│   │   ├── teacher/...                  # 16 Teacher routes
│   │   └── admin/...                    # 4 Admin routes
│   ├── layout.tsx                       # Root providers (QueryClient, AuthProvider, Toast)
│   └── page.tsx                         # Redirects by primary active role or /login
├── features/
│   ├── auth/                            # Login/refresh/me hooks, route guards, RoleGuard
│   ├── courses/                         # Course forms, roster management, 1:1 guard UX
│   ├── calendar/                        # Shared week/month agenda + Lesson modal + Meet links
│   ├── exercises/                       # Exercise builder (Reading/Listening), versioning, audio upload
│   ├── assignments/                     # Assignment scheduler + Student assignment list/cards
│   ├── exam-runner/                     # Reading split-pane, Listening signed player, question renderers
│   ├── review/                          # Gated PASS >= 70% answer key & explanation view
│   ├── translation/                     # Side-by-side Reading passage + Vietnamese editor + teacher review
│   ├── extensions/                      # Quota badge (3/month), request modal, teacher decision queue
│   ├── penalties/                       # Positive ledger summary, history table, admin reversal modal
│   ├── notifications/                   # Bell popover, read/unread state, deep-link resolver
│   ├── users/                           # Admin user directory & account provisioning
│   └── audit/                           # Audit logs & health readiness view
├── lib/
│   ├── api/
│   │   ├── client.ts                    # Fetch wrapper, Bearer + refresh handling, ApiError parser, Idempotency-Key
│   │   ├── endpoints/                   # Typed functions matching Section 6.2 & 6.3 /api/v1 contracts
│   │   └── mocks/                       # Explicit dev-only mock adapter (NEXT_PUBLIC_API_MODE=mock)
│   ├── auth/                            # Token/session context & multi-role helpers
│   ├── time/                            # Asia/Ho_Chi_Minh formatting & daily deadline helpers
│   └── sanitize/                        # Safe HTML sanitizer for passages
└── components/
    └── ui/                              # Shared primitives (DataTable, States: Loading/Empty/Error, Modal, Badge, Forms)
```

---

## 4. Phased Implementation Plan (All 33 Routes)

### Phase 1 — Project Bootstrap, Design System & API Contract Layer
1. Initialize Next.js App Router + TypeScript + Tailwind CSS + ESLint + Prettier + Vitest/RTL + Playwright.
2. Configure `.env.example` (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_API_MODE`, `NEXT_PUBLIC_DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh`).
3. Implement core libraries:
   - `lib/api/client.ts`: standardized error handling (`statusCode`, `code`, `message`, `requestId`, `timestamp`), auth header injection, refresh queue hook, and `Idempotency-Key` generator.
   - `lib/time/`: UTC ↔ `Asia/Ho_Chi_Minh` formatters, countdown badges, and `00:00–23:59` daily window labels.
   - `lib/sanitize/`: XSS-safe HTML sanitizer for passages.
   - Shared UI kit: App shell (responsive drawer + topbar), `QueryState` (Loading skeleton / Empty / Error with retry / Success feedback), `ConfirmDialog`, `Pagination`, `StatusBadge`, `DataTable`.
   - Typed DTOs & Zod schemas for every Section 6.2 & 6.3 contract + explicit dev-only mock server/adapter.

### Phase 2 — Authentication, Multi-Role Shell & Navigation Guards
- **Routes:**
  - `/login`: Email/password form (React Hook Form + Zod), error display (401/429 throttling feedback), optional forgot/reset password UX hooks, role-based post-login redirect.
  - `/unauthorized`: Clear access-denied explanation + return-to-home-portal CTA.
- **Auth & Role Architecture:**
  - `AuthProvider` bootstrapping session via `GET /auth/me` (and `POST /auth/refresh` when available) + explicit logout (`POST /auth/logout` + in-memory token clear).
  - Support users with multiple roles (`roles: UserRole[]`) via a portal switcher in the shell header (`/student/*`, `/teacher/*`, `/admin/*`).
  - Route/layout guards blocking mismatched roles immediately before mounting feature views.

### Phase 3 — Student Core Portal & Calendar (6 of 11 Student Routes)
- `/student/dashboard`: Today's open tasks, next upcoming Google Meet lesson, overdue alert banner, recent/best scores, current positive penalty points, and remaining monthly extension quota (`X / 3`).
- `/student/calendar`: Month & week agenda rendered in `Asia/Ho_Chi_Minh`, showing course, teacher, lesson status, and direct Google Meet join button (`https://meet.google.com/...`).
- `/student/courses`: Enrolled courses grid/list showing IELTS band (`startBand` → `targetBand`), `1:1` vs `group` badge, teacher name, and enrollment status.
- `/student/assignments`: Filterable list (Today / Upcoming / Open / Passed / Failed / Overdue). Upcoming assignments (`openAt > now`) render safe preview metadata only—never questions or audio.
- `/student/notifications`: Read/unread filter, mark-as-read (`PATCH /notifications/:id/read`), deep-link navigation to assignment/course/extension.
- `/student/profile`: Profile details (`GET /students/me/profile`) and safe-field update form.

### Phase 4 — Exam Runner, Conditional Review, Translation, Extensions & Penalties (Remaining 5 Student Routes)
- `/student/assignments/[studentAssignmentId]`:
  - **Pre-open / locked guard:** Shows countdown/schedule metadata if before `openAt`.
  - **Reading test UI:** Desktop side-by-side split pane (sanitized passage left, scrollable questions right); mobile stacked/tabbed view (`Passage | Questions`).
  - **Listening test UI:** Authorized audio player requesting short-lived signed URL from `GET /media/audio/:assetId/playback` (handles playback token refresh/expiry cleanly) + questions panel.
  - **Question types:** Modular renderers (MCQ single/multi, True/False/Not Given, Yes/No/Not Given, Fill-in-the-blank/Short answer, Matching) mapped cleanly to `{ questionId, value }[]`.
  - **Submission UX:** Local draft persistence (browser `sessionStorage`/`localStorage` keyed by `studentAssignmentId` + `userId`, strictly answers-in-progress only), confirmation modal, `Idempotency-Key` header, instant score & PASS (`>= 70%`) / FAIL result card + attempt history (`GET /student-assignments/:id/submissions`).
- `/student/assignments/[studentAssignmentId]/review`:
  - Calls `GET /student-assignments/:id/review`.
  - If passed (`>= 70%`), displays user answers vs accepted answers + explanations.
  - If `< 70%` or API returns `403 ANSWER_LOCKED`, renders locked state with current best score and link back to retry (if attempts remain).
- `/student/assignments/[studentAssignmentId]/translation`:
  - Desktop split-pane (same Reading passage left, Vietnamese editor right); mobile tabs.
  - Supports Save Draft (`PUT .../translation/draft`), Submit with freeze warning (`POST .../translation/submit`), status badge (`draft` / `submitted` / `reviewed`), and read-only teacher feedback display.
- `/student/extensions`:
  - Displays monthly usage (`GET /extensions/mine`, `X / 3` in VN calendar month), request modal/form (`studentAssignmentId`, `reason`, `requestedDueAt` picker in VN time), and request decision history.
- `/student/penalties`:
  - Displays authoritative positive penalty total and immutable ledger (`GET /penalties/mine`) showing `+1` overdue events and any audited negative reversal entries.

### Phase 5 — Teacher & Admin Portals (16 Teacher Routes + 4 Admin Routes)
**Teacher Portal (`/teacher/*`):**
- `/teacher/dashboard`: Course summary metrics, pending extension requests widget, pending translation review count, upcoming lessons, overdue learner alerts.
- `/teacher/calendar`: Month/week schedule + Create/Edit Lesson modal (`POST /lessons`, `PATCH /lessons/:id` with `courseId`, `startAt < endAt` validation, Google Meet URL format validation, status).
- `/teacher/courses`, `/teacher/courses/new`, `/teacher/courses/[id]`: Course listing, creation (`startBand <= targetBand`, `1:1` vs `group`, timezone), and course editing.
- `/teacher/courses/[id]/students`: Course roster management—enroll student (`POST /courses/:id/students`), withdraw (`DELETE /courses/:id/students/:studentId`), explicit UX handling for `1:1` single-active-student limit errors.
- `/teacher/students`, `/teacher/students/[id]`: Assigned learner directory and individual learner overview (enrollments, submission scores, translation status, extensions, penalty ledger via `GET /students/:id/penalties`).
- `/teacher/exercises`, `/teacher/exercises/new`, `/teacher/exercises/[id]/edit`:
  - Exercise bank table (Reading/Listening, draft vs published, version indicator).
  - Rich authoring builder: passage editor or private audio uploader (`POST /media/audio/upload-init` → direct signed upload → `POST /media/audio/upload-complete` with size/MIME validation), question builder with points & accepted answers/aliases/explanations.
  - Validate & Publish (`POST /exercises/:id/publish`) and Create New Version (`POST /exercises/:id/versions`) when editing a published exercise (keeping published scoring fields read-only).
- `/teacher/assignments`, `/teacher/assignments/new`, `/teacher/assignments/[id]/results`:
  - Assignment listing, assignment creator (course + published exercise & pinned version + VN `00:00–23:59` date picker), and per-student results table (attempts, best score, pass/fail, `effectiveDueAt`, penalty status).
- `/teacher/extensions`: Pending & decided queue (`GET /extensions/pending`) with Approve/Reject modal (`POST /extensions/:id/decision` + `decisionNote`).
- `/teacher/translations`: Submitted translations queue with split-pane passage + student Vietnamese text + teacher feedback form (`POST /translations/:id/review`).

**Admin Portal (`/admin/*`):**
- `/admin/users`: Directory (`GET /users`), search/filter, create account modal (`POST /users` with `roles[]`), edit status/roles (`PATCH /users/:id`).
- `/admin/courses`: System-wide course & teacher ownership oversight.
- `/admin/audit`: Privileged audit view + penalty reversal workflow (`POST /penalties/:id/reverse` with mandatory reason and confirmation).
- `/admin/settings`: System configuration overview + live backend health indicators (`GET /health/live`, `GET /health/ready`).

### Phase 6 — Quality, Accessibility, Security Audit & Verification
1. **Unit & Component Tests (Vitest + RTL):**
   - Timezone conversion (`Asia/Ho_Chi_Minh` boundaries, `00:00–23:59` daily slots).
   - API error normalization & `Idempotency-Key` behavior (no retry on unsafe `POST` submission).
   - DTO validation & Zod schemas (course band `startBand <= targetBand`, lesson `startAt < endAt`, Google Meet URL, extension form).
   - Exam runner question serialization & verification that student DTO rendering never expects/exposes answer keys before PASS.
2. **Playwright E2E / UI Verification (against mock mode and/or running backend):**
   - Login + multi-role routing & `/unauthorized` guard.
   - Student Reading test fail (`< 70%` → answers remain locked) → retry → PASS (`>= 70%` → `/review` unlocks) → Translation draft & submit.
   - Student Listening test signed audio playback & submit.
   - Student extension request (3/month indicator) → Teacher approve/reject decision flow.
   - Teacher create course (`1:1` guard) → publish exercise → create assignment → schedule Google Meet lesson → review translation.
   - Admin create user + penalty reversal flow.
3. **Production Build & Responsive/A11y Check:**
   - `npm run lint` / `tsc --noEmit` / `npm run build` clean with zero errors.
   - Mobile (`375px`) and desktop (`1280px+`) layout verification, keyboard navigation, contrast, and HTML sanitization check.

---

## 5. Open Decisions to Confirm Before Phase 1 Execution

Please confirm or adjust these defaults before I start scaffolding code:
1. **Project root location:** Scaffold the Next.js app directly at the repo root (`d:/WORK/WEB-IELTS/package.json`, `src/app/...`) while keeping `docs/` intact? *(Recommended over a nested `frontend/` folder since this repo is frontend-only.)*
2. **Primary UI language:** Should the UI copy be **Vietnamese** (matching `IELTS_LMS_System_Design_Tong_Quan.docx` and the Vietnamese examples in `IELTS_LMS_FRONTEND_SYSTEM_DESIGN.md`), **English**, or **Vietnamese default with clean i18n keys**?
3. **Mock adapter for `TO BUILD` APIs:** Confirm whether to include a toggleable dev-only mock API mode (`NEXT_PUBLIC_API_MODE=mock`) alongside the real `/api/v1` client so all 33 screens can be interactively verified right away before the backend `TO BUILD` endpoints are finished.
4. **Package manager & UI library:** Confirm `pnpm` (or `npm`) and Tailwind CSS + shadcn/ui-style Radix primitives + React Hook Form + Zod + TanStack Query.
