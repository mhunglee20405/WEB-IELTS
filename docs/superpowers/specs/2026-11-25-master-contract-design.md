# Design Spec: IELTS LMS Master Contract & Extension Standard

**Date:** 2026-11-25
**Status:** Draft (pending user approval)
**Repository:** `d:\WEB-IELTS` (`Backend/` NestJS 10 + MongoDB + Redis/BullMQ ↔ `frontend/` Next.js 16 + React 19 + TanStack Query + Zod)

---

## 1. Intent & Why

The IELTS LMS codebase has evolved rapidly across multiple phases (Phase 1–11 + Exam Modes V2 + Product Readiness). As a result, contract documentation is fragmented across multiple overlapping files:
- `Backend/docs/FRONTEND_API_CONTRACT.md` (v1.0, predates Phase 9–11 & Exam V2)
- `docs/IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md` (written as *PROPOSED* delta)
- `docs/PHASE11_API_COMPATIBILITY_MATRIX.md`
- `docs/integration-audit/API_CONTRACT_MATRIX.md`
- `Backend/docs/openapi.json` (point-in-time snapshot)

Frontend and Backend teams need **one authoritative, codebase-verified Master Contract** that:
1. Reflects **100% of the actual running codebase** today (all 22 Backend controllers, all DTOs, all 18 Mongoose schemas, and all 19 Frontend API endpoint modules + Zod schemas).
2. Explicitly flags every **BE ↔ FE drift** (mismatched field names, optionality, enum values, status codes, unused/orphan endpoints, or legacy vs. canonical routes).
3. Establishes **clear extension & versioning conventions** so future modules (e.g., Writing, Speaking, Billing, Analytics) can be designed and implemented by FE and BE in parallel without contract drift.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **100% Codebase Grounding:** Every endpoint path, HTTP method, guard/role, request DTO, query param, response envelope, error code, enum, and MongoDB schema field MUST be verified directly from source code (`Backend/src/**` and `frontend/src/lib/api/**`), never copied blindly from outdated docs.
- **Modular Single Source of Truth:** Organize the contract under `docs/contract/` with a Master Index (`README.md`) and focused domain specs so humans and AI agents can read only the domain they are working on.
- **Canonical vs. Legacy Clarity:** Clearly classify every domain and endpoint as `Canonical`, `Legacy (Coexisting)`, or `Internal/Ops` — especially separating the Phase 9+ Exam V2 flow (`exam-tests`, `exam-attempts`, `reading-translations`) from the legacy flow (`exercises`, `submissions`, `translations`).
- **Actionable Drift Audit:** Document every real discrepancy found between Backend controllers/DTOs/schemas and Frontend `src/lib/api/` endpoints/Zod schemas, categorized by severity (`P0 Breaking`, `P1 Type/Shape Mismatch`, `P2 Unused/Orphan`, `P3 Cosmetic`).
- **Extension Standard & Verification Loop:** Provide concrete rules, templates, and a verification checklist tied to existing tooling (`npm run export:openapi` in Backend, `npm run test` for `frontend/src/lib/api/*.test.ts` Zod contract tests) for adding new features.

### Non-Goals
- **No Product Code Changes:** This task produces the contract specification and drift audit only. Fixing discovered drifts or refactoring legacy modules is out of scope and should be tracked as follow-up work.
- **No Speculative New Feature APIs:** Do not invent endpoints for unbuilt features (e.g., Writing/Speaking/Payments); instead, define the *rules and templates* for how future features must be contracted.
- **No Deletion of Legacy Docs:** Existing historical phase reports (`docs/full-system-audit/`, `docs/product-readiness/`, `Backend/docs/`) remain untouched; `docs/contract/README.md` will declare itself the canonical contract superseding older API contract docs.

### Anti-Goals (What Would Make This a Failure)
- Copying outdated routes or fields from `FRONTEND_API_CONTRACT.md` or `IELTS_LMS_EXAM_MODES_API_CONTRACT_V2.md` without verifying them in the NestJS controllers and DTOs.
- Omitting edge-case business rules that live in services/guards (e.g., answer-key sanitization for students, `>= 70%` pass threshold and passage-level translation unlock, `Idempotency-Key` behavior, teacher course-ownership scoping, deadline/penalty +1 rules, token rotation & refresh concurrency).
- Producing a wall of text that omits exact TypeScript/JSON shapes, HTTP status codes, or RBAC rules.

---

## 3. Constraints

- **Source of Truth Priority:**
  1. Actual runtime code: `Backend/src/main.ts`, `Backend/src/common/**`, `Backend/src/modules/**/*.controller.ts`, `*.dto.ts`, `*.service.ts`, `Backend/src/database/schemas/*.ts`.
  2. Actual Frontend consumer code: `frontend/src/lib/api/client.ts`, `error.ts`, `schemas.ts`, `types.ts`, `query-keys.ts`, `endpoints/*.ts`.
  3. Existing docs (`Backend/docs/openapi.json`, etc.) may be referenced only to detect doc drift, never trusted over code.
- **Language:** Write the contract in clear Vietnamese (matching the team's language) while keeping all technical identifiers, HTTP verbs, field names, enum values, and TypeScript/JSON schemas verbatim in English as defined in code.
- **Runtime Conventions Already Locked in Code:**
  - Global prefix: `/api/v1` (`Backend/src/main.ts`)
  - Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } })`
  - Global `TransformInterceptor` (success envelope) & `GlobalExceptionFilter` (error envelope)
  - Global `CorrelationIdMiddleware`, `helmet()`, `cookieParser()`, 10MB body size cap, `ThrottlerModule` (100 req/min default, 10 req/min login)
  - Allowed custom headers: `Authorization`, `Idempotency-Key`, `X-Correlation-Id`, `X-Request-Id`

---

## 4. Approaches Considered

1. **Approach 1 — Single Monolithic File (`docs/MASTER_CONTRACT.md`):**
   - *Trade-off:* Easy to Ctrl+F in one file, but 22 controllers + 18 schemas + full DTOs would exceed 2,500–3,500 lines, causing high maintenance friction, git conflicts, and context bloat for both devs and AI agents.
2. **Approach 2 — Modular Domain Docs (`docs/contract/`):**
   - *Trade-off:* Clean separation by domain and easy to extend, but lacks an explicit BE↔FE drift audit and automated verification loop.
3. **Approach 3 — Modular Domain Docs (`docs/contract/`) + BE↔FE Drift Audit & Verification Rules *(Selected)*:**
   - *Trade-off:* Takes slightly more upfront verification work across all 22 controllers and 19 frontend endpoint modules, but delivers both a complete human/AI-readable contract and an immediately actionable drift report wired into existing OpenAPI & Zod test tooling.

---

## 5. Deliverable Architecture (`docs/contract/`)

The contract suite will live under `d:\WEB-IELTS\docs\contract\` with the following 9 files:

| File | Responsibility | Verified Source Scope |
| :--- | :--- | :--- |
| `docs/contract/README.md` | **Master Index & Global Protocol Contract**: Base URLs, HTTP headers, CORS, rate limits, `TransformInterceptor` success envelope, `GlobalExceptionFilter` error envelope, pagination conventions, `Idempotency-Key`, Auth/JWT/Refresh token rotation flow, RBAC matrix, timezone/date ISO-8601 rules, HTML sanitization/XSS policy, and navigation map to domain files. | `Backend/src/main.ts`, `app.module.ts`, `common/**`, `frontend/src/lib/api/client.ts`, `error.ts`, `token-store.ts` |
| `docs/contract/01-auth-users-system.md` | **Auth, Users, Profiles, System Setup & Health**: `/auth`, `/users`, `/system`, `/health` (including bootstrap/first-time setup, admin/teacher/student profiles, status transitions, password/token rules). | `modules/auth`, `modules/users`, `modules/system`, `modules/health`, `endpoints/auth.ts`, `users.ts`, `system.ts`, `health.ts` |
| `docs/contract/02-courses-lessons-assignments.md` | **Courses, Enrollments, Lessons, Assignments & Student Assignments**: `/courses`, `/lessons`, `/assignments`, `/student-assignments`, `/deadlines` (including teacher ownership scoping, enrollment lifecycle, lesson schedules, assignment targeting & effective due dates). | `modules/courses`, `enrollments`, `lessons`, `assignments`, `deadlines`, `endpoints/courses.ts`, `lessons.ts`, `assignments.ts`, `student-assignments.ts` |
| `docs/contract/03-exam-v2-attempts-translations.md` | **Exam Modes V2 (Canonical)**: `/exam-tests`, `/exam-attempts`, `/reading-translations`, `/media` (PART vs FULL modes, timer & auto-submit, answer-key sanitization, `>= 70%` pass rule, per-passage translation unlock, media upload/serving). | `modules/exam-tests`, `exam-attempts`, `reading-translations`, `media`, `endpoints/exam-tests.ts`, `teacher-exam-tests.ts`, `exam-attempts.ts`, `reading-translations.ts`, `media.ts` |
| `docs/contract/04-legacy-exercises-submissions.md` | **Legacy Exercise & Submission Flow**: `/exercises`, `/submissions`, `/translations` — explicitly marked as `Legacy (Coexisting)` with clear boundaries against Exam V2 and rules on when/how it is still called. | `modules/exercises`, `submissions`, `translations`, `endpoints/exercises.ts` |
| `docs/contract/05-extensions-penalties-notifications-admin.md` | **Extensions, Penalties, Notifications, Dashboard, Audit & Jobs**: `/extensions`, `/penalties`, `/notifications`, `/dashboard`, `/audit`, `/jobs` (penalty ledger +1 rules, extension approval workflow, BullMQ background jobs, audit log guarantees). | `modules/extensions`, `penalties`, `notifications`, `dashboard`, `audit`, `jobs`, `endpoints/extensions.ts`, `penalties.ts`, `notifications.ts`, `dashboard.ts` |
| `docs/contract/06-data-models-and-enums.md` | **Canonical Data Models & Shared Enums**: Complete reference of all 18 Mongoose schemas (fields, types, required/default, unique/compound indexes, relationships) and all enums in `Backend/src/database/schemas/enums.ts` mapped to Frontend `schemas.ts`/`types.ts`. | `Backend/src/database/schemas/*.ts`, `frontend/src/lib/api/schemas.ts`, `types.ts` |
| `docs/contract/07-drift-audit-be-fe.md` | **BE ↔ FE Contract Drift Audit**: Structured table of every verified discrepancy between Backend and Frontend (route mismatches, missing FE consumers, extra/missing DTO fields, enum mismatches, envelope unwrapping quirks, legacy vs V2 overlap) with severity (`P0`–`P3`) and recommended resolution. | Cross-check of all 22 BE controllers + DTOs vs. all 19 FE endpoint files + Zod schemas |
| `docs/contract/08-extension-and-versioning-guide.md` | **Extension Standard & Contract Governance**: Step-by-step playbook for adding a new domain/endpoint without drift — naming conventions, DTO/Zod parity rules, RBAC & audit checklist, pagination/error/idempotency rules, backward-compatibility & deprecation policy, domain spec template, and automated verification workflow (`npm run export:openapi` + `frontend` Vitest contract tests). | `Backend/package.json`, `frontend/package.json`, `frontend/src/lib/api/*.test.ts` |

### Standard Structure Inside Every Domain Contract File (`01`–`05`)
Each domain file MUST document:
1. **Domain Scope & Lifecycle Status** (`Canonical` / `Legacy` / `Internal`) + Ownership & Invariants.
2. **Endpoint Summary Table** (`Method`, `Full Path`, `Auth/Roles`, `Idempotency`, `FE Consumer File`, `Status`).
3. **Detailed Endpoint Specifications** (for every endpoint):
   - Path params, Query params (with types, defaults, validation constraints)
   - Request Body JSON/TypeScript shape (exact DTO fields, required vs optional, validation rules)
   - Success Response (`statusCode`, exact `data` payload shape)
   - Domain-Specific Error Cases (`statusCode`, error condition, message/code)
   - Side Effects & Business Rules (DB writes, Redis/BullMQ jobs, audit logs, notifications, sanitization)
4. **State Machines / Flows** (Mermaid diagrams where helpful, e.g., Auth Refresh, Attempt Lifecycle, Extension Approval, Assignment Deadline/Penalty).

---

## 6. What's Left to the Builder

- Exact markdown table formatting and visual grouping within each domain file.
- Choosing concise, representative JSON payload examples derived directly from the actual DTOs/schemas.
- Grouping small helper endpoints logically while ensuring zero endpoints from any of the 22 controllers are missed.
- Ordering items in `07-drift-audit-be-fe.md` strictly by severity (`P0` → `P3`).
