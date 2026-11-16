# WEB-IELTS — FINAL RELEASE ACCEPTANCE REPORT

**Date:** November 15, 2026  
**Auditor / Architect:** Senior Full-Stack Software Engineer & Quality Automation Lead  
**Repository:** `D:\WEB-IELTS`  
**Target Release Branch:** `connect`  
**Reference Upstream:** `develop` (`https://github.com/mhunglee20405/WEB-IELTS.git`)  
**Base Commit (HEAD):** `500cf5ebf2ff45467efd588596c5b018fbdeb538`  
**Release Gate Verdict:** 🟢 **PASSED — APPROVED FOR PRODUCTION PACKAGING & DEPLOYMENT**

---

## 1. Executive Summary & Verification Scope

This document provides the final, evidence-based quality acceptance gate for the **WEB-IELTS Academic Learning Management System (IELTS LMS)**.

Over successive stabilization and quality-gate stages, all reported defects, runtime crashes, integration mismatches, and data persistence flows have been resolved, verified with deterministic idempotency controls, and independently tested across backend services, database persistence, and browser-driven user interactions.

### Summary Metrics & Exact Count Reconciliation

> [!NOTE]
> **Reconciliation of Test Count Arithmetic**:
> An earlier interim report draft cited a figure of 547 checks due to an arithmetic typo that inadvertently double-counted 15 seeded user records alongside test assertions. The actual sum of numeric assertions across the 12 automated suites was exactly **532**.
> Following the addition of 4 explicit assertions verifying that calendar week/month view selections demonstrably persist across hard browser reloads (raising the Data Persistence suite from 11 to 15 assertions), the verified count of passing automated assertions is strictly **536** (plus 4 passing static check and build gates).

| Verification Category | Suite / Metric | Tests / Checks | Passed | Failed | Skipped | Exit Code |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Backend Unit Tests** | Jest Unit Specs (`Backend`) | 19 suites / 135 tests | 135 | 0 | 0 | `0` |
| **Backend E2E Tests** | Jest E2E Specs (`Backend/test`) | 11 suites / 154 tests | 154 | 0 | 0 | `0` |
| **Frontend Unit Tests** | Vitest Component & Contract Specs (`frontend`) | 18 files / 85 tests | 85 | 0 | 0 | `0` |
| **Frontend Type Safety** | TypeScript `tsc --noEmit` (`frontend`) | 0 type errors | Clean | 0 | 0 | `0` |
| **Frontend Code Quality** | ESLint (`frontend`) | 0 errors, 0 warnings | Clean | 0 | 0 | `0` |
| **Backend Production Build** | NestJS Compiler (`Backend/dist/main.js`) | Build Success | Success | 0 | 0 | `0` |
| **Frontend Production Build** | Next.js 16 Webpack Build (`frontend/.next`) | 33 routes optimized | Success | 0 | 0 | `0` |
| **Scheduler Idempotency** | Live MongoDB + BullMQ Idempotency Harness | 52 assertions | 52 | 0 | 0 | `0` |
| **Bug Regression Audit** | 8 Historical Bug Verification Script | 8 assertions | 8 | 0 | 0 | `0` |
| **Cross-Role Live Integration** | Admin $\rightarrow$ Teacher $\rightarrow$ Student Integration Flow | 3 complex workflows | 3 | 0 | 0 | `0` |
| **Lesson Domain Accuracy** | Database Schema & Type Persistence Suite | 10 checks | 10 | 0 | 0 | `0` |
| **Teacher Authorization Scope**| Multi-Tenant & RBAC Boundary Enforcement | 10 checks | 10 | 0 | 0 | `0` |
| **Playwright Quality Gate** | Microsoft Edge Deep UI & DB Verification | 29 assertions | 29 | 0 | 0 | `0` |
| **Playwright Completeness** | Extended Teacher/Student Interactive Flows | 14 assertions | 14 | 0 | 0 | `0` |
| **Playwright Deep Routes** | Interactive Authoring, Tests & Translations | 21 assertions | 21 | 0 | 0 | `0` |
| **Data Persistence & Reload** | Hard Browser Reload & Mutation Persistence | 15 assertions | 15 | 0 | 0 | `0` |
| **TOTAL AUTOMATED ASSERTIONS** | **Strict Numeric Sum across all 12 test suites** | **536 assertions** | **536** | **0** | **0** | `0` |
| **TOTAL BUILD & STATIC GATES** | **Typecheck, Linter, Backend Build, Frontend Build** | **4 quality gates** | **4** | **0** | **0** | `0` |

---

## 2. Reconciled Architectural Decisions & Business Rules

### 2.1 Assignment Extension Business Rules
* **Historical Observation:** Early draft notes referenced an arbitrary "+24 hours per extension" test case, whereas the canonical seed included an approved 3-day extension (`+3 days`) for Student 11.
* **Domain Reconciliation:**
  1. **Extension Quota:** Each student is entitled to at most **3 extension requests per calendar month** (`MAX_EXTENSIONS_PER_MONTH = 3`).
  2. **Proposed Target Date:** The student proposes a desired `requestedDate` via the frontend date-picker, which must be strictly in the future (`> new Date()`) and greater than the current effective deadline (`> sa.effectiveDeadlineAt`).
  3. **Teacher Authorization & Override:** The instructor has the authority to either approve the requested date or specify a distinct `approvedDeadlineAt`. Therefore, extension durations are dynamic business decisions (e.g., +24 hours, +3 days, +1 week) governed by teacher review, rather than a hardcoded 24-hour constant.
  4. **Active Penalty Reversal:** Upon approval, any previously incurred overdue penalty for that assignment is systematically reversed with an immutable transaction (`deltaPoints: -1`) referencing the original penalty ID.

### 2.2 Multi-Tier Safety & Guard Rails for `seed.ts --fresh`
* **Protection Mechanism:** Destructive database operations (`--fresh` or `--clean` flag) are protected by a multi-tier safety architecture in `Backend/src/database/seed/seed.ts`:
  1. **Production Environment Lock:** If `NODE_ENV === 'production'`, execution immediately halts (`process.exit(1)`).
  2. **Sensitive Environment Keyword Blacklist:** If the database name matches `/(prod|production|live|staging|uat|release)/i`, execution immediately aborts.
  3. **Explicit Database Allowlist:** The database name MUST exist in an explicit set of approved development/test environments:
     ```ts
     const ALLOWED_DESTRUCTIVE_DB_NAMES = new Set([
       'ielts_lms',
       'ielts_lms_dev',
       'ielts_lms_development',
       'ielts_lms_test',
       'ielts_lms_e2e',
       'ielts_lms_local',
     ]);
     ```
     Any target database name outside this list is immediately blocked with a fatal guard error.
  4. **Host Restriction:** Destruction is restricted to local loopback hosts (`localhost`, `127.0.0.1`, `::1`, `mongodb`) unless overridden by `ALLOW_REMOTE_DESTRUCTIVE_SEED=true`.
  5. **Non-Destructive Idempotent Baseline:** Running `seed.ts` without `--fresh` is 100% non-destructive: all collections are upserted against composite unique keys (`UserModel.findOne`, `CourseModel.findOne`, `LessonModel.findOneAndUpdate`), preserving custom teacher-created lessons and existing historical data.

### 2.3 Calendar Week/Month View Selection Persistence
* **Investigation & Root Cause:** Previously, both `StudentCalendarPage` and `TeacherCalendarPage` stored `mode` purely in ephemeral React component state (`useState<CalendarMode>('week')`). Consequently, a browser refresh reset the view to `week`.
* **Resolution:**
  * Mode selection is now persisted in `localStorage` under `ielts_student_calendar_mode` and `ielts_teacher_calendar_mode`.
  * Initial state is lazily resolved from `localStorage` on client mount, falling back gracefully to `"week"`.
  * Tab switching immediately updates both component state and storage.
  * Verified in Playwright E2E (`release-acceptance-persistence.spec.mjs`): switching to Month view, performing a hard browser reload (`page.reload({ waitUntil: 'networkidle' })`), and asserting that Month view remains active and toolbar header displays `"Tháng MM/YYYY"`.

### 2.4 Legacy Lesson Migration & Type Persistence
* **Schema Integrity:** The `type` field in `LessonSchema` is strictly defined as an enum `LessonType` (`live_meet`, `workshop`, `review`).
* **Canonical Mapping:** `mapLesson()` returns both canonical database attributes and frontend view fields (`id`, `courseId`, `title`, `description`, `content`, `type`, `startTime`, `startAt`, `endTime`, `endAt`, `meetingUrl`, `meetUrl`, `status`).

### 2.5 BullMQ Scheduler Idempotency & Queue Optimization
* **Scheduler Determinism:** Overdue checks executed sequentially (10 runs) or concurrently (5 simultaneous requests) produce **exactly 1 penalty transaction** and **exactly 1 notification** per overdue student assignment.
* **Deterministic Idempotency Keys:**
  * Penalties: `penalty:overdue:${studentAssignmentId}`
  * Reversals: `reverse:${originalPenaltyId}` (enforced by a MongoDB unique index on `reversedTransactionId`)
  * Notifications: `notif:overdue:${studentAssignmentId}` (enforced by a sparse unique index on `idempotencyKey`)
* **Queue Job ID Colon Sanitization:** BullMQ disallows colons (`:`) in custom job IDs. All job identifiers sent to Redis queues sanitize colons into underscores (`jobId: idempotencyKey.replace(/:/g, '_')`), eliminating queue insertion rejections.

---

## 3. Environment & Infrastructure Requirements

### 3.1 Runtime Prerequisites

| Component | Minimum Version | Verified Production Version |
| :--- | :--- | :--- |
| **Operating System** | Linux / macOS / Windows 11 | Windows 11 Pro 64-bit |
| **Node.js** | `>= 20.10.0` | `v24.14.1` |
| **npm** | `>= 10.0.0` | `11.2.0` |
| **MongoDB** | `>= 6.0` (Replica Set required for transactions) | MongoDB 7.0 Community (`mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true`) |
| **Redis** | `>= 7.0` | Redis 7.2 Alpine (`localhost:6379`) |
| **Docker Compose** | `>= 2.20` | Docker Compose v2 (running `mongo` & `redis` services) |

### 3.2 Database Initialization & Seeding Commands

#### Option A: Preserve Existing Data & Upsert Canonical Seed (Recommended)
```bash
npm --prefix Backend run seed
```

#### Option B: Fresh Non-Production Initialization (Destructive Local Reset)
```bash
# WARNING: Only executes on allowlisted local development databases
npx --prefix Backend ts-node -r tsconfig-paths/register src/database/seed/seed.ts --fresh
```

#### Option C: Initialize Indexes Only
```bash
npm --prefix Backend run init:indexes
```

---

## 4. Demo Accounts & Credentials

All accounts are pre-seeded in the database with Argon2-hashed passwords:

| Role | Email | Password | Full Name | Access Level |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `admin@ielts-lms.local` | `Admin@123456` | Admin Nguyen Van Q | System Administration, User Management, Course Oversight, Audit & Penalty Reversal |
| **Administrator 2** | `admin2@ielts-lms.local` | `Admin@123456` | Admin Tran Thi P | Secondary System Auditor |
| **Teacher** | `teacher@ielts-lms.local` | `Teacher@123456` | Teacher Nguyen Van A | Course Instructor (IELTS-MASTER-01), Lesson & Assignment Authoring, Translation Grading |
| **Teacher 2** | `teacher2@ielts-lms.local` | `Teacher@123456` | Teacher Tran Thi B | Course Instructor (IELTS-READ-02) |
| **Teacher 3** | `teacher3@ielts-lms.local` | `Teacher@123456` | Teacher Le Van C | Course Instructor (IELTS-FOUND-01, IELTS-LIST-01) |
| **Student** | `student@ielts-lms.local` | `Student@123456` | Student Tran Thi B | Enrolled in 3 Courses, Assignments, Calendar, CBT Practice, Translation Exercises |
| **Student 11** | `student11@ielts-lms.local` | `Student@123456` | Student Nguyen Van 11 | Has approved 3-day extension & reversed penalty record |
| **Student 9** | `student9@ielts-lms.local` | `Student@123456` | Student Nguyen Van 9 | Has approved extension & active penalty history |

---

## 5. Detailed Test Execution & Quality Gate Matrix

### 5.1 Backend Unit Tests
* **Command:** `npm --prefix Backend test`
* **Result:** 19 passed, 19 total suites | 135 passed, 135 total tests | Exit Code: `0`
* **Duration:** 13.902 s

### 5.2 Backend E2E Tests
* **Command:** `npm --prefix Backend run test:e2e`
* **Result:** 11 passed, 11 total suites | 154 passed, 154 total tests | Exit Code: `0`
* **Duration:** 13.956 s

### 5.3 Frontend Unit Tests
* **Command:** `npm --prefix frontend test`
* **Result:** 18 passed, 18 total files | 85 passed, 85 total tests | Exit Code: `0`
* **Duration:** 6.98 s

### 5.4 Production Builds & Static Type Checking
* **Frontend Typecheck:** `npm --prefix frontend run typecheck` $\rightarrow$ 0 errors, Exit Code `0`.
* **Frontend Lint:** `npm --prefix frontend run lint` $\rightarrow$ 0 errors, 0 warnings, Exit Code `0`.
* **Backend Build:** `npm --prefix Backend run build` $\rightarrow$ Output compiled to `Backend/dist/main.js`, Exit Code `0`.
* **Frontend Build:** `npm --prefix frontend run build` $\rightarrow$ Next.js 16 Webpack build, 33 routes generated, Exit Code `0`.

### 5.5 Live Browser & Playwright Acceptance
* **Quality Gate Deep Suite:** 29 passed, 0 failed (`quality-gate-deep-verification.spec.mjs`)
* **Interactive Workflows Deep Coverage:** 21 passed, 0 failed (`interactive-workflows-deep-coverage.spec.mjs`)
* **Functional Completeness Suite:** 14 passed, 0 failed (`functional-completeness-verification.spec.mjs`)
* **Data Persistence Across Browser Reload:** 15 passed, 0 failed (`release-acceptance-persistence.spec.mjs`)
  * Includes verification of Notification read persistence, Calendar month view persistence across reload, Teacher calendar view persistence across reload, Admin audit log persistence, and Practice library state persistence.

---

## 6. Git Working Tree & Staging Audit

A comprehensive inspection of the Git working tree confirms:
1. **Branch & Commit**: Active branch is `connect`, pointing to commit `500cf5ebf2ff45467efd588596c5b018fbdeb538`.
2. **Untracked Secrets / Credentials**: Confirmed zero tracked `.env` or credential files. `.gitignore` explicitly excludes `.env` and `.env*.local`.
3. **Artifacts & Logs**: Confirmed zero `.log`, `.tmp`, `.sqlite`, or binary database files in tracking index.
4. **Modified Files Ready for Staging**:
   * `.gitignore` (safeguarding `.env` patterns)
   * `Backend/src/database/seed/seed.ts` (multi-tier allowlist safety guards)
   * `frontend/src/app/student/calendar/page.tsx` (view mode persistence in `localStorage`)
   * `frontend/src/app/teacher/calendar/page.tsx` (view mode persistence in `localStorage`)
   * `frontend/src/lib/api/endpoints/lessons.ts` (lint cleanup)
   * `frontend/src/lib/api/mocks/router.ts` (handled `/lessons/mine` route in mock router)
   * `frontend/e2e/release-acceptance-persistence.spec.mjs` (view mode reload persistence tests)
   * `docs/RELEASE_ACCEPTANCE_REPORT.md` (reconciled release acceptance document)

---

## 7. Recommended Safe Git Commit & Tag Commands

Per instructions, the working tree has been left unmodified by automatic git commands. To safely stage, commit, and tag this release candidate, run:

```powershell
# 1. Review status
git status

# 2. Stage verified changes
git add .gitignore
git add Backend/src/database/seed/seed.ts
git add frontend/src/app/student/calendar/page.tsx
git add frontend/src/app/teacher/calendar/page.tsx
git add frontend/src/lib/api/endpoints/lessons.ts
git add frontend/src/lib/api/mocks/router.ts
git add frontend/e2e/release-acceptance-persistence.spec.mjs
git add docs/RELEASE_ACCEPTANCE_REPORT.md

# 3. Create release candidate commit
git commit -m "fix(release): enforce calendar view persistence, strengthen seed safety guards, and reconcile test metrics"

# 4. Tag release candidate
git tag -a v1.0.0-rc.1 -m "WEB-IELTS Release Candidate 1.0.0 (536 passing automated assertions)"
```

---

## 8. Final Verdict

🟢 **RELEASE READY**: All verified tests, contracts, safety guards, and user flows pass without defect. The application is ready for release candidate tagging and production staging.
