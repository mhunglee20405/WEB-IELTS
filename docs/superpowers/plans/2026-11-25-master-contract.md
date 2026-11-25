# IELTS LMS Master Contract & Extension Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a 100% codebase-verified, modular Master Contract suite under `docs/contract/` covering all 22 NestJS controllers, 18 Mongoose schemas, and 19 Frontend API endpoint modules + Zod schemas, plus a BE↔FE Drift Audit and Extension Standard.

**Architecture:** Nine focused markdown documents under `docs/contract/`: a Master Index & Global Protocol (`README.md`), a Data Models & Enums reference (`06`), five domain API contracts (`01`–`05`), a severity-ranked BE↔FE Drift Audit (`07`), and an Extension & Verification Playbook (`08`). Every route, DTO field, guard, enum, and response shape is extracted directly from source code (`Backend/src/**` and `frontend/src/lib/api/**`) rather than copied from older docs.

**Tech Stack:** NestJS 10 (TypeScript, Mongoose, class-validator, Swagger, BullMQ, Throttler), Next.js 16 / React 19 (TypeScript, Zod, TanStack Query, Vitest), Markdown + Mermaid diagrams.

**Spec:** [2026-11-25-master-contract-design.md](file:///d:/WEB-IELTS/docs/superpowers/specs/2026-11-25-master-contract-design.md)

## Global Constraints

- **Zero speculation:** Every endpoint, HTTP method, guard/role, DTO field, enum value, status code, and index MUST be read directly from `Backend/src/**` and `frontend/src/lib/api/**`.
- **No product code edits:** Only create files under `docs/contract/`. Do not modify `Backend/src/**`, `frontend/src/**`, or delete existing docs in `docs/` or `Backend/docs/`.
- **Language:** Explanatory prose in clear Vietnamese; all technical identifiers, routes, HTTP methods, DTO/field names, enum values, and JSON/TypeScript blocks verbatim in English as in source code.
- **Global runtime invariants (from `Backend/src/main.ts`):** prefix `/api/v1`, `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, enableImplicitConversion: true })`, `TransformInterceptor`, `GlobalExceptionFilter`, `CorrelationIdMiddleware`, 10MB body limit, rate limits (100/min default, 10/min login).
- **Mandatory per-domain sections (`01`–`05`):** (1) Domain Scope, Lifecycle Status (`Canonical` / `Legacy` / `Internal`) & Invariants; (2) Endpoint Summary Table (`Method`, `Full Path`, `Auth/Roles`, `Idempotency`, `FE Consumer`, `Status`); (3) Per-endpoint Path/Query/Body/Response/Errors/Side-effects; (4) State machine or sequence diagram where applicable.

## Review Focus

- **Unmapped or hidden controller routes:** A controller with multiple `@Controller(...)` prefixes, route aliases, or sub-paths (e.g., `student-assignments.controller.ts` inside `modules/submissions/`) could be missed if only scanning folder names — verify every `@Get/@Post/@Patch/@Put/@Delete` decorator across all 22 controllers.
- **Silent BE ↔ FE envelope or field mismatches:** Frontend `client.ts` unwraps `data` and injects `idempotencyKey` into JSON bodies while Backend uses `forbidNonWhitelisted: true` — check whether any endpoint rejects extra fields or expects different error/pagination shapes.
- **Answer-key leakage & role-scoping invariants:** Student-facing endpoints (`/exercises/:id`, `/exam-tests/:id`, `/exam-attempts/*`) and teacher-scoped endpoints (`/courses`, `/assignments`, `/extensions`) enforce critical security/ownership rules inside services — verify service logic, not just controller decorators.
- **Canonical vs. Legacy boundary confusion:** Overlapping capabilities between `exercises`/`submissions`/`translations` (Legacy) and `exam-tests`/`exam-attempts`/`reading-translations` (Canonical V2) must be explicitly separated so neither FE nor BE builds new features on legacy routes.
- **Stale OpenAPI / Zod drift:** Existing `Backend/docs/openapi.json` and `frontend/src/lib/api/schemas.ts` may differ from actual NestJS DTOs/responses — log every verified mismatch in `07-drift-audit-be-fe.md` with exact file references and `P0`–`P3` severity.

---

### Task 1: Master Index & Global Protocol Contract (`docs/contract/README.md`)

**Files:**
- Read: `Backend/src/main.ts`, `Backend/src/app.module.ts`, `Backend/src/config/configuration.ts`, `Backend/src/common/interceptors/transform.interceptor.ts`, `Backend/src/common/filters/global-exception.filter.ts`, `Backend/src/common/guards/*`, `Backend/src/common/decorators/*`, `Backend/src/common/middleware/correlation-id.middleware.ts`, `frontend/src/lib/api/client.ts`, `frontend/src/lib/api/error.ts`, `frontend/src/lib/api/token-store.ts`, `frontend/src/lib/api/query-keys.ts`
- Create: `docs/contract/README.md`

**Interfaces:**
- Produces: Canonical global conventions (Base URL, headers, success/error/pagination envelopes, auth refresh protocol, RBAC matrix, `Idempotency-Key` behavior, timezone/date format, HTML sanitization policy, and document navigation map) referenced by Tasks 2–9.

- [ ] **Step 1: Read Backend global plumbing & Frontend API client**
  Read all files listed in `Files -> Read` above to extract exact envelope fields, error response structure, guard/decorator semantics (`@Public()`, `@Roles()`, `JwtAuthGuard`, `RolesGuard`), CORS headers, rate limits, and FE retry/refresh/idempotency behavior.

- [ ] **Step 2: Author `docs/contract/README.md`**
  Include:
  - Declaration that `docs/contract/` is the single source of truth superseding `Backend/docs/FRONTEND_API_CONTRACT.md` and `docs/IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md`.
  - Complete navigation table to `01`–`08`.
  - Exact HTTP protocol, headers, CORS, 10MB payload cap, Throttler limits, `TransformInterceptor` success envelope, `GlobalExceptionFilter` error envelope, pagination envelope(s), `ValidationPipe` strictness (`forbidNonWhitelisted: true` — note FE `idempotencyKey` injection behavior for Task 8 drift audit).
  - Auth & Refresh Token rotation sequence diagram (Mermaid) matching both `auth.service.ts` and `frontend/src/lib/api/client.ts`.
  - Global RBAC matrix (`admin`, `teacher`, `student`, `Public`) and Timezone/ISO-8601 + HTML sanitization rules.

- [ ] **Step 3: Verify completeness against source**
  Cross-check every header name, envelope key, and rate limit number in `docs/contract/README.md` against `Backend/src/main.ts`, `transform.interceptor.ts`, `global-exception.filter.ts`, and `frontend/src/lib/api/client.ts`.

---

### Task 2: Canonical Data Models & Shared Enums (`docs/contract/06-data-models-and-enums.md`)

**Files:**
- Read: All 19 files in `Backend/src/database/schemas/*.ts` (18 schemas + `enums.ts`), `frontend/src/lib/api/schemas.ts`, `frontend/src/lib/api/types.ts`
- Create: `docs/contract/06-data-models-and-enums.md`

**Interfaces:**
- Consumes: Global conventions from `docs/contract/README.md`.
- Produces: Authoritative entity names, MongoDB collection names, field types, unique/compound indexes, relationships, and BE↔FE enum parity table consumed by Tasks 3–8.

- [ ] **Step 1: Read all 18 Mongoose schemas + `enums.ts`**
  Extract for each schema: collection name, every field (type, required, default, ref, enum), timestamps, and every `.index(...)` definition.

- [ ] **Step 2: Read Frontend `schemas.ts` and `types.ts`**
  Extract all FE Zod enums and entity types, noting any value/field differences with Backend schemas (feed notes into Task 8).

- [ ] **Step 3: Author `docs/contract/06-data-models-and-enums.md`**
  Include:
  - Entity-Relationship overview (Mermaid `erDiagram` grouped into Core LMS, Exam V2, Legacy, and Ops/Audit).
  - Complete Shared Enums table mapping every enum in `Backend/src/database/schemas/enums.ts` to its FE counterpart in `frontend/src/lib/api/schemas.ts`/`types.ts` (flagging any mismatch).
  - Detailed table for each of the 18 schemas (fields, types, constraints, indexes, ownership notes, Canonical vs. Legacy tag).

- [ ] **Step 4: Verify 18/18 schemas and all enums covered**
  Check that every file in `Backend/src/database/schemas/` appears in `docs/contract/06-data-models-and-enums.md`.

---

### Task 3: Domain Contract — Auth, Users, System & Health (`docs/contract/01-auth-users-system.md`)

**Files:**
- Read: `Backend/src/modules/auth/{auth.controller.ts,auth.service.ts,dto/*}`, `Backend/src/modules/users/{users.controller.ts,users.service.ts,dto/*}`, `Backend/src/modules/system/{system.controller.ts,system.service.ts,dto/*}`, `Backend/src/modules/health/health.controller.ts`, `frontend/src/lib/api/endpoints/{auth.ts,users.ts,system.ts,health.ts}`
- Create: `docs/contract/01-auth-users-system.md`

**Interfaces:**
- Consumes: `docs/contract/README.md` envelopes & RBAC, `docs/contract/06-data-models-and-enums.md` (`User`, `StudentProfile`, `TeacherProfile`, `UserRole`, `UserStatus`).
- Produces: Complete endpoint specs for `/auth`, `/users`, `/system`, `/health` and BE↔FE drift notes for Task 8.

- [ ] **Step 1: Inspect all 4 controllers, DTOs, key service rules, and 4 FE endpoint files**
  Verify every route, guard, throttle override, validation rule, profile projection, first-time admin bootstrap behavior (`/system/*`), and FE caller.

- [ ] **Step 2: Author `docs/contract/01-auth-users-system.md`**
  Document all endpoints following the mandatory per-domain structure, including password/email change flows, refresh token family revocation, first-time setup lock, and student/teacher profile creation/updates.

- [ ] **Step 3: Verify route count**
  Confirm 100% of `@Get/@Post/@Patch/@Put/@Delete` methods in `auth.controller.ts`, `users.controller.ts`, `system.controller.ts`, and `health.controller.ts` are documented.

---

### Task 4: Domain Contract — Courses, Lessons, Assignments & Deadlines (`docs/contract/02-courses-lessons-assignments.md`)

**Files:**
- Read: `Backend/src/modules/courses/{courses.controller.ts,courses.service.ts,dto/*}`, `Backend/src/modules/enrollments/*`, `Backend/src/modules/lessons/{lessons.controller.ts,lessons.service.ts,dto/*}`, `Backend/src/modules/assignments/{assignments.controller.ts,assignments.service.ts,dto/*}`, `Backend/src/modules/submissions/student-assignments.controller.ts`, `Backend/src/modules/deadlines/{deadlines.controller.ts,deadlines.service.ts,dto/*}`, `frontend/src/lib/api/endpoints/{courses.ts,lessons.ts,assignments.ts,student-assignments.ts}`
- Create: `docs/contract/02-courses-lessons-assignments.md`

**Interfaces:**
- Consumes: `docs/contract/README.md`, `docs/contract/06-data-models-and-enums.md` (`Course`, `Enrollment`, `Lesson`, `Assignment`, `StudentAssignment`).
- Produces: Complete endpoint specs for `/courses`, `/lessons`, `/assignments`, `/student-assignments`, `/deadlines` and BE↔FE drift notes for Task 8.

- [ ] **Step 1: Inspect all 5 controllers, DTOs, service invariants, and 4 FE endpoint files**
  Verify teacher course-ownership checks, enrollment add/drop rules, lesson scheduling/cancellation, assignment creation (linking both Exam V2 `examTestId` and legacy `exerciseId`, `requiredScope`, `requiredPartId`, `allowedModes`), `student-assignments` status lifecycle, and `/deadlines` overdue processing.

- [ ] **Step 2: Author `docs/contract/02-courses-lessons-assignments.md`**
  Document all endpoints with full request/response DTO shapes, error cases, teacher/student scoping rules, and a Mermaid state diagram for `StudentAssignmentStatus` & deadline/effectiveDueAt calculation.

- [ ] **Step 3: Verify route count**
  Confirm 100% of routes in `courses.controller.ts`, `lessons.controller.ts`, `assignments.controller.ts`, `student-assignments.controller.ts`, and `deadlines.controller.ts` are documented.

---

### Task 5: Domain Contract — Exam Modes V2, Attempts, Reading Translations & Media (`docs/contract/03-exam-v2-attempts-translations.md`)

**Files:**
- Read: `Backend/src/modules/exam-tests/{exam-tests.controller.ts,exam-tests.service.ts,dto/*}`, `Backend/src/modules/exam-attempts/{exam-attempts.controller.ts,exam-attempts.service.ts,dto/*}`, `Backend/src/modules/reading-translations/{reading-translations.controller.ts,reading-translations.service.ts,dto/*}`, `Backend/src/modules/media/{media.controller.ts,media.service.ts,dto/*}`, `frontend/src/lib/api/endpoints/{exam-tests.ts,teacher-exam-tests.ts,exam-attempts.ts,reading-translations.ts,media.ts}`
- Create: `docs/contract/03-exam-v2-attempts-translations.md`

**Interfaces:**
- Consumes: `docs/contract/README.md`, `docs/contract/06-data-models-and-enums.md` (`ExamTest`, `ExamAttempt`, `TranslationSubmission`, Exam V2 enums).
- Produces: Complete Canonical Exam V2 contract and BE↔FE drift notes for Task 8.

- [ ] **Step 1: Inspect all 4 controllers, DTOs, key service logic, and 5 FE endpoint files**
  Verify exact routes (including teacher vs. student route prefixes), `PART` vs `FULL` mode rules, autosave & timer/expiration handling, answer-key sanitization (`grading`/`acceptedAnswers`/`correctOption`/`explanation` stripped before unlock), `>= 70%` pass threshold & passage-level translation unlock, teacher review flow, and media upload/streaming constraints.

- [ ] **Step 2: Author `docs/contract/03-exam-v2-attempts-translations.md`**
  Document all endpoints with exact DTOs, response projections (sanitized vs. review-unlocked), error codes, security invariants, and Mermaid lifecycle diagrams (ExamTest publish/versioning, ExamAttempt `IN_PROGRESS` → `SUBMITTED`/`AUTO_SUBMITTED` → Translation Unlock).

- [ ] **Step 3: Verify route count**
  Confirm 100% of routes in `exam-tests.controller.ts`, `exam-attempts.controller.ts`, `reading-translations.controller.ts`, and `media.controller.ts` are documented.

---

### Task 6: Domain Contract — Legacy Exercises, Submissions & Translations (`docs/contract/04-legacy-exercises-submissions.md`)

**Files:**
- Read: `Backend/src/modules/exercises/{exercises.controller.ts,exercises.service.ts,dto/*}`, `Backend/src/modules/submissions/{submissions.controller.ts,submissions.service.ts,dto/*}`, `Backend/src/modules/translations/{translations.controller.ts,translations.service.ts,dto/*}`, `frontend/src/lib/api/endpoints/exercises.ts`
- Create: `docs/contract/04-legacy-exercises-submissions.md`

**Interfaces:**
- Consumes: `docs/contract/README.md`, `docs/contract/06-data-models-and-enums.md` (`Exercise`, `Submission`, `TranslationSubmission`).
- Produces: Complete Legacy flow contract, explicit boundary table comparing Legacy vs. Exam V2, and deprecation/coexistence rules.

- [ ] **Step 1: Inspect all 3 controllers, DTOs, and FE `exercises.ts` (plus grep FE for `/submissions` and `/translations`)**
  Verify every route, payload, and exactly which parts of Frontend still call legacy endpoints vs. which are Backend-only/unused.

- [ ] **Step 2: Author `docs/contract/04-legacy-exercises-submissions.md`**
  Mark clearly as `Legacy (Coexisting)`, include a side-by-side comparison table (`Legacy` vs `Exam V2 Canonical`), and document all routes, DTOs, responses, and business rules.

- [ ] **Step 3: Verify route count**
  Confirm 100% of routes in `exercises.controller.ts`, `submissions.controller.ts`, and `translations.controller.ts` are documented.

---

### Task 7: Domain Contract — Extensions, Penalties, Notifications, Dashboard, Audit & Jobs (`docs/contract/05-extensions-penalties-notifications-admin.md`)

**Files:**
- Read: `Backend/src/modules/extensions/{extensions.controller.ts,extensions.service.ts,dto/*}`, `Backend/src/modules/penalties/{penalties.controller.ts,penalties.service.ts,dto/*}`, `Backend/src/modules/notifications/{notifications.controller.ts,notifications.service.ts,dto/*}`, `Backend/src/modules/dashboard/{dashboard.controller.ts,dashboard.service.ts}`, `Backend/src/modules/audit/{audit.controller.ts,audit.service.ts,dto/*}`, `Backend/src/modules/jobs/{jobs.controller.ts,jobs.service.ts}`, `frontend/src/lib/api/endpoints/{extensions.ts,penalties.ts,notifications.ts,dashboard.ts}`
- Create: `docs/contract/05-extensions-penalties-notifications-admin.md`

**Interfaces:**
- Consumes: `docs/contract/README.md`, `docs/contract/06-data-models-and-enums.md` (`ExtensionRequest`, `PenaltyTransaction`, `Notification`, `AuditLog`, `EmailDelivery`).
- Produces: Complete contract for extensions, penalty ledger, notifications, dashboards, audit logs, and BullMQ jobs, plus BE↔FE drift notes for Task 8.

- [ ] **Step 1: Inspect all 6 controllers, DTOs, service rules, and 4 FE endpoint files**
  Verify extension request creation/approval/rejection (and how `effectiveDueAt` updates), penalty ledger `+1` / reversal rules, notification read/read-all/admin-broadcast, role-specific dashboard responses, audit log filters, and admin job triggers/queue status.

- [ ] **Step 2: Author `docs/contract/05-extensions-penalties-notifications-admin.md`**
  Document all 6 modules with complete request/response shapes, RBAC, side effects (email/BullMQ/audit), and Mermaid state diagram for Extension Approval & Penalty Reversal.

- [ ] **Step 3: Verify route count**
  Confirm 100% of routes in `extensions.controller.ts`, `penalties.controller.ts`, `notifications.controller.ts`, `dashboard.controller.ts`, `audit.controller.ts`, and `jobs.controller.ts` are documented.

---

### Task 8: BE ↔ FE Contract Drift Audit (`docs/contract/07-drift-audit-be-fe.md`)

**Files:**
- Read: Drift notes collected across Tasks 1–7, `frontend/src/lib/api/endpoints/index.ts`, `frontend/src/lib/api/schemas.ts`, `Backend/docs/openapi.json` (metadata/paths check only)
- Create: `docs/contract/07-drift-audit-be-fe.md`

**Interfaces:**
- Consumes: Verified controller routes/DTOs and FE endpoint/Zod schemas from Tasks 1–7.
- Produces: Severity-ranked (`P0` Breaking, `P1` Type/Shape Mismatch, `P2` Unused/Orphan, `P3` Cosmetic/Doc Drift) audit table with exact file paths, line numbers, impact, and concrete fix recommendations.

- [ ] **Step 1: Run automated route inventory cross-check**
  Extract every Backend controller route and every Frontend `apiRequest({ path: ... })` path via a quick read-only script/command to ensure zero missed route mismatches or orphan endpoints.

- [ ] **Step 2: Author `docs/contract/07-drift-audit-be-fe.md`**
  Organize findings strictly by severity (`P0` → `P3`), covering:
  - Route/method mismatches
  - Request DTO vs. FE payload mismatches (including `ValidationPipe` `forbidNonWhitelisted: true` interactions)
  - Response shape vs. FE Zod schema mismatches
  - Enum mismatches
  - Legacy vs. V2 overlap & orphan endpoints (BE routes with no FE consumer, or FE callers targeting non-existent/legacy routes)
  - Old doc drift (`Backend/docs/FRONTEND_API_CONTRACT.md` & `openapi.json` staleness)

- [ ] **Step 3: Verify every finding cites exact source files**
  Confirm every row in the drift table references exact `Backend/src/...` and/or `frontend/src/...` paths verified in code.

---

### Task 9: Extension & Versioning Guide (`docs/contract/08-extension-and-versioning-guide.md`) + Final Verification

**Files:**
- Read: `Backend/package.json`, `frontend/package.json`, `frontend/src/lib/api/contracts.test.ts`, `frontend/src/lib/api/exam-v2-contracts.test.ts`, `frontend/src/lib/api/lesson-contract.test.ts`
- Create: `docs/contract/08-extension-and-versioning-guide.md`

**Interfaces:**
- Consumes: All patterns from `docs/contract/README.md` and `01`–`07`.
- Produces: Reusable governance playbook & domain contract template for all future features (e.g., Writing, Speaking, Billing).

- [ ] **Step 1: Inspect existing contract tests & OpenAPI export script**
  Read `frontend/src/lib/api/contracts.test.ts`, `exam-v2-contracts.test.ts`, `lesson-contract.test.ts`, and `Backend/src/database/scripts/export-openapi.ts` to document the exact verification workflow already supported by the repo.

- [ ] **Step 2: Author `docs/contract/08-extension-and-versioning-guide.md`**
  Include:
  - Naming & REST conventions (URLs, DTOs, Zod schemas, query keys, MongoDB collections & indexes).
  - Mandatory checklists for every new module: Auth/RBAC, teacher ownership scoping, answer-key/PII sanitization, `Idempotency-Key` for mutating actions, AuditLog + BullMQ async side effects, pagination & error format.
  - Backward compatibility, additive-only evolution, and deprecation lifecycle rules (`/api/v1` vs `/api/v2`).
  - Copy-pasteable **New Domain Contract Template** (`docs/contract/XX-<domain>.md`).
  - Concrete **Contract Verification Workflow** (`cd Backend && npm run export:openapi`, `cd frontend && npm run typecheck && npm run test` covering `src/lib/api/*.test.ts`).

- [ ] **Step 3: Final Whole-Suite Verification**
  Run a verification check confirming:
  1. All 9 files exist in `docs/contract/`.
  2. All 22 Backend controllers and all 18 Mongoose schemas are referenced in the contract suite.
  3. All internal relative links in `docs/contract/README.md` resolve to existing files.
  4. `git status` confirms zero unintended edits outside `docs/superpowers/` and `docs/contract/`.
