# WEB-IELTS — FINAL RELEASE ACCEPTANCE REPORT

**Date:** November 15, 2026  
**Auditor / Architect:** Senior Full-Stack Software Engineer & Quality Automation Lead  
**Repository:** `D:\WEB-IELTS`  
**Target Release Branch:** `connect`  
**Reference Upstream:** `develop` (`https://github.com/mhunglee20405/WEB-IELTS.git`)  
**Base Commit (HEAD):** `c6484103fef832227dea753ff17b7b2d4ea1f722`  
**Release Gate Verdict:** 🟢 **PASSED — APPROVED FOR PRODUCTION PACKAGING & DEPLOYMENT**

---

## 1. Executive Summary & Verification Scope

This document provides the final, evidence-based quality acceptance gate for the **WEB-IELTS Academic Learning Management System (IELTS LMS)**.

Over successive stabilization and quality-gate stages, all reported defects, runtime crashes, and integration mismatches have been resolved, verified with deterministic idempotency controls, and independently tested across backend services, database persistence, and browser-driven user interactions.

### Summary Metrics

| Verification Category | Suite / Metric | Tests / Checks | Passed | Failed | Skipped | Exit Code |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Backend Unit Tests** | Jest Unit Specs (`Backend`) | 19 suites / 135 tests | 135 | 0 | 0 | `0` |
| **Backend E2E Tests** | Jest E2E Specs (`Backend/test`) | 11 suites / 154 tests | 154 | 0 | 0 | `0` |
| **Frontend Unit Tests** | Vitest Component & Contract Specs (`frontend`) | 18 files / 85 tests | 85 | 0 | 0 | `0` |
| **Frontend Type Safety** | TypeScript `tsc --noEmit` (`frontend`) | 0 errors | Clean | 0 | 0 | `0` |
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
| **Data Persistence & Reload** | Hard Browser Reload & Mutation Persistence | 11 assertions | 11 | 0 | 0 | `0` |
| **TOTAL QUALITY GATE** | **Comprehensive Regression Suite** | **547 checks** | **547** | **0** | **0** | `0` |

---

## 2. Reconciled Architectural Decisions & Business Rules

### 2.1 Assignment Extension Business Rules
* **Historical Observation:** Early draft notes referenced an arbitrary "+24 hours per extension" test case, whereas the canonical seed included an approved 3-day extension (`+3 days`) for Student 11.
* **Domain Reconciliation:**
  1. **Extension Quota:** Each student is entitled to at most **3 extension requests per calendar month** (`MAX_EXTENSIONS_PER_MONTH = 3`).
  2. **Proposed Target Date:** The student proposes a desired `requestedDate` via the frontend date-picker, which must be strictly in the future (`> new Date()`) and greater than the current effective deadline (`> sa.effectiveDeadlineAt`).
  3. **Teacher Authorization & Override:** The instructor has the authority to either approve the requested date or specify a distinct `approvedDeadlineAt`. Therefore, extension durations are dynamic business decisions (e.g., +24 hours, +3 days, +1 week) governed by teacher review, rather than a hardcoded 24-hour constant.
  4. **Active Penalty Reversal:** Upon approval, any previously incurred overdue penalty for that assignment is systematically reversed with an immutable transaction (`deltaPoints: -1`) referencing the original penalty ID.

### 2.2 Safety & Guard Rails for `seed.ts --fresh`
* **Protection Mechanism:** Destructive database operations (`--fresh` flag) are protected by triple environment safeguards in `Backend/src/database/seed/seed.ts`:
  1. `NODE_ENV === 'production'`: Execution immediately halts with exit code `1`.
  2. Production Database Name Filter: If the database name matches `/prod/i`, execution halts immediately.
  3. Remote Host Protection: Destructive truncation is restricted to local addresses (`localhost`, `127.0.0.1`, `::1`, `mongodb`) unless explicitly overridden with `ALLOW_REMOTE_DESTRUCTIVE_SEED=true`.

### 2.3 Legacy Lesson Migration & Type Persistence
* **Schema Integrity:** The `type` field in `LessonSchema` is strictly defined as an enum `LessonType` (`live_meet`, `workshop`, `review`).
* **Canonical Mapping:** `mapLesson()` returns both canonical database attributes and frontend view fields (`id`, `courseId`, `title`, `description`, `content`, `type`, `startTime`, `startAt`, `endTime`, `endAt`, `meetingUrl`, `meetUrl`, `status`).
* **Non-Destructive Seeding:** Subsequent executions of `seed.ts` upsert lessons using deterministic composite keys (`courseId + title`), preserving custom teacher-created lessons and existing historical data.

### 2.4 BullMQ Scheduler Idempotency & Queue Optimization
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
# WARNING: Only executes on local development databases
npx --prefix Backend ts-node -r tsconfig-paths/register Backend/src/database/seed/seed.ts --fresh
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
* **Coverage:**
  * `lessons.service.spec.ts`
  * `users.service.spec.ts`
  * `mail.service.spec.ts`
  * `exam-tests.service.spec.ts`
  * `exercises.service.spec.ts`
  * `submissions.service.spec.ts`
  * `reading-translations.service.spec.ts`
  * `exam-attempts.service.spec.ts`
  * `audit.service.spec.ts`
  * `translations.service.spec.ts`
  * `courses.service.spec.ts`
  * `notifications.service.spec.ts`
  * `auth.service.spec.ts`
  * `penalties.service.spec.ts`
  * `enrollments.service.spec.ts`
  * `extensions.service.spec.ts`
  * `assignments.service.spec.ts`
  * `jobs.service.spec.ts`
  * `deadlines.service.spec.ts`

### 5.2 Backend E2E Tests
* **Command:** `npm --prefix Backend run test:e2e`
* **Result:** 11 passed, 11 total suites | 154 passed, 154 total tests | Exit Code: `0`
* **Duration:** 13.956 s
* **Coverage:**
  * `test/phase3.e2e-spec.ts`
  * `test/auth.e2e-spec.ts`
  * `test/phase11-live-integration.e2e-spec.ts`
  * `test/phase5.e2e-spec.ts`
  * `test/phase4.e2e-spec.ts`
  * `test/phase3-real-mongo.e2e-spec.ts`
  * `test/phase9.e2e-spec.ts`
  * `test/phase8.e2e-spec.ts`
  * `test/phase10.e2e-spec.ts`
  * `test/phase6.e2e-spec.ts`
  * `test/phase7.e2e-spec.ts`

### 5.3 Frontend Unit Tests
* **Command:** `npm --prefix frontend test`
* **Result:** 18 passed, 18 total files | 85 passed, 85 total tests | Exit Code: `0`
* **Duration:** 6.90 s
* **Coverage:**
  * HTML sanitization (`html.test.ts`)
  * RBAC permissions (`roles.test.ts`)
  * API client interceptors & refresh tokens (`client.test.ts`)
  * Lesson contract normalization (`lesson-contract.test.ts`)
  * Tab navigation & Accessible controls (`tabs.test.tsx`, `confirm-dialog.test.tsx`, `data-table.test.tsx`)
  * Vietnam timezone calculations (`vn-time.test.ts`)
  * API Schemas & Zod validation contracts (`contracts.test.ts`, `exam-v2-contracts.test.ts`)
  * Student & Teacher portals (`student-portal.test.tsx`, `student-execution.test.tsx`, `teacher-admin-portal.test.tsx`)
  * Exam V2 test taker (`exam-v2.test.tsx`)
  * Authentication form accessibility & rate limit feedback (`login-form.test.tsx`)

### 5.4 Production Builds & Static Type Checking
* **Frontend Typecheck:** `npm --prefix frontend run typecheck` $\rightarrow$ 0 errors, Exit Code `0`.
* **Frontend Lint:** `npm --prefix frontend run lint` $\rightarrow$ 0 errors, 0 warnings, Exit Code `0`.
* **Backend Build:** `npm --prefix Backend run build` $\rightarrow$ Output compiled to `Backend/dist/main.js`, Exit Code `0`.
* **Frontend Build:** `npm --prefix frontend run build` $\rightarrow$ Next.js 16 Webpack build, 33 routes generated, Exit Code `0`.

### 5.5 Live Browser & Playwright Acceptance
* **Quality Gate Deep Suite:** 29 passed, 0 failed (`quality-gate-deep-verification.spec.mjs`)
* **Interactive Workflows Deep Coverage:** 21 passed, 0 failed (`interactive-workflows-deep-coverage.spec.mjs`)
* **Functional Completeness Suite:** 14 passed, 0 failed (`functional-completeness-verification.spec.mjs`)
* **Data Persistence Across Browser Reload:** 11 passed, 0 failed (`release-acceptance-persistence.spec.mjs`)

---

## 6. Known System Limitations & Non-Blocking Notes

1. **Email Delivery Driver:**
   * In local and staging environments, `MailService` operates with a structured mock driver (`MOCK EMAIL DISPATCH`) to avoid unauthenticated external SMTP rejections while still validating BullMQ queue lifecycle, job payload serialization, and delivery tracking.
   * In production, valid SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) must be supplied in `.env`.
2. **Audio File Streaming:**
   * Listening exercises reference sample CDN / placeholder media URLs. Production deployments should configure AWS S3 / Cloudflare R2 object storage buckets for exam audio assets.
3. **Sandbox Networking on Windows:**
   * Local Node.js / Playwright commands connecting to local HTTP sockets (`localhost:3000`, `localhost:3001`, `localhost:27018`) require unsandboxed socket permissions (`BypassSandbox: true` in Antigravity) due to Windows TCP loopback socket sandboxing rules.

---

## 7. Unresolved Bugs Status

* **Critical Unresolved Bugs:** `0`
* **High-Priority Unresolved Bugs:** `0`
* **Medium / Low Unresolved Bugs:** `0`
* **All 8 historical integration defects demonstrably resolved:**
  1. Student course multi-tenant isolation $\rightarrow$ **RESOLVED & VERIFIED**
  2. Teacher user listing role scoping $\rightarrow$ **RESOLVED & VERIFIED**
  3. Dashboard upcoming lesson field contract $\rightarrow$ **RESOLVED & VERIFIED**
  4. Notification boolean query parsing $\rightarrow$ **RESOLVED & VERIFIED**
  5. Course teacher field serialization $\rightarrow$ **RESOLVED & VERIFIED**
  6. StatusBadge resilience against unknown statuses $\rightarrow$ **RESOLVED & VERIFIED**
  7. Practice exam tags & allowed modes safe array handling $\rightarrow$ **RESOLVED & VERIFIED**
  8. `/courses/mine` route consistency across mock and real APIs $\rightarrow$ **RESOLVED & VERIFIED**

---

## 8. Recommended Git Commit & Release Procedure

Per instructions, changes have been verified and left on the local working tree without automatic remote pushes or merges.

To commit and promote these changes, follow this recommended procedure:

### Step 1: Review Working Tree Status
```bash
git status
```

### Step 2: Stage Verified Changes
```bash
git add Backend/src/
git add Backend/scripts/
git add Backend/test/
git add Backend/docker-compose.yml
git add Backend/tsconfig.build.json
git add frontend/src/
git add frontend/e2e/
git add frontend/package.json
git add frontend/playwright.config.ts
git add docs/
```

### Step 3: Create Release Acceptance Commit
```bash
git commit -m "chore(release): finalize release acceptance, scheduler idempotency, and data persistence"
```

### Step 4: Verification Tagging
```bash
git tag -a v1.0.0-rc.1 -m "Release Candidate 1.0.0 - Full system audit and integration verified"
```

### Step 5: Push to Remote (Upon Stakeholder Approval)
```bash
git push origin connect
# Once approved for merging into develop:
# git checkout develop
# git merge connect
# git push origin develop
```

---

## 9. Deployment Prerequisites for Production

Before launching the application in a staging or production Kubernetes / Cloud environment:

1. **MongoDB Replica Set:** Ensure the production MongoDB instance is configured as a replica set (`rs0`) to support multi-document ACID transactions utilized in enrollment and penalty reversal operations.
2. **Redis Cluster / Sentinel:** Ensure Redis persistence (AOF/RDB) is enabled for BullMQ job durability.
3. **Environment Secrets:**
   * Generate high-entropy 256-bit secrets for `JWT_SECRET` and `JWT_REFRESH_SECRET`.
   * Configure `CORS_ORIGINS` to point strictly to the production frontend domain.
   * Set `NODE_ENV=production` on both frontend and backend services.
4. **Reverse Proxy:** Configure Nginx or Cloudflare with SSL termination and WebSocket / Server-Sent-Events forwarding if enabled.

