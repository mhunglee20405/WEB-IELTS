# Backend, MongoDB & Frontend Logic Bugs Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all verified P0, P1, and P2 logic, security/IDOR, MongoDB schema/index/transaction, and Frontend contract/state bugs across `Backend/` and `frontend/`, plus fix the 3 currently failing tests so both full test suites and builds are 100% green.

**Architecture:** Fix root causes bottom-up by layer so later tasks rely on stable contracts: (1) MongoDB schemas & indexes, (2) Auth session revocation & password-reset mail delivery, (3) Backend authorization/IDOR & data-scoping guards, (4) Exam attempt & legacy submission lifecycle/grading/concurrency, (5) Assignments/deadlines/extensions/penalties/courses/users transactional integrity, and (6) Frontend API normalization, UI state locks, form payloads & cache invalidation. Every fix follows strict Red-Green-Refactor TDD.

**Tech Stack:** NestJS, TypeScript, Mongoose / MongoDB (with sessions/transactions), ioredis, Jest, Next.js (App Router), React Query, Zod, React Hook Form, Vitest, Testing Library.

**Spec:** Verified 3-domain audit report from this session (Backend + MongoDB + Frontend) and canonical API contract in `docs/contract/06-data-models-and-enums.md` & `docs/contract/07-drift-audit-be-fe.md`.

## Global Constraints

- Global NestJS `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` is enabled in `Backend/src/main.ts` — every Frontend request body/query field must be declared on the matching Backend DTO.
- MongoDB unique constraints on optional fields must use `partialFilterExpression` (never compound `sparse: true`).
- Vietnam timezone (`Asia/Ho_Chi_Minh`, UTC+7) is the canonical timezone for assignment windows and monthly extension quotas (`createVnMonthBounds`).
- No `Assignment` or `ExamAttempt` logic may hardcode `70` when `assignment.targetScorePercent` is configured (default fallback `70` only when unset).
- Every task must leave both `Backend` (`npm run build && npm test`) and `frontend` (`npx tsc --noEmit && npm test`) passing with 0 failures (except pre-existing failures owned by a later task in this plan, which must be called out explicitly until that task completes).
- Keep mock-mode compatibility intact on Frontend (`NEXT_PUBLIC_API_MODE=mock`).

## Review Focus

1. **Zero-enrollment student / zero-course teacher dashboard access:** A newly registered student (`enrolledCourseIds = []`) or teacher (`courseIds = []`) requesting `/dashboard/*` must receive empty arrays (`[]`), never unfiltered platform lessons/meetUrls/assignments. *(Pinned in Task 3)*
2. **Two different students submitting standalone translations for the same passage & one student submitting translations for two different assignments:** Must both succeed without MongoDB `E11000` duplicate-key crashes. *(Pinned in Task 1)*
3. **Concurrent double-submit or post-expiry submit on an `ExamAttempt`:** Second concurrent submit must be idempotent (single `Submission`, single `attemptsCount` increment, no `E11000`); submitting body answers after `expiresAt` must not accept late answers or resurrect `EXPIRED` attempts; `AUTO_SUBMITTED` via `saveAnswers` must still persist `Submission` & update `StudentAssignment`. *(Pinned in Task 4)*
4. **Teacher editing an existing 1:1 course on Frontend:** Opening `/teacher/courses/:id` on a `type: "one_to_one"` course with populated `teacherId` object must preserve `1:1` format, `startDate`/`endDate`, omit `teacherId` from `PATCH /courses/:id`, and succeed with HTTP 200 without corrupting the course into `group`. *(Pinned in Task 6)*
5. **Student attempting to edit or revert an already-reviewed translation (both via UI and direct API call):** UI must freeze the editor on `status === "reviewed"`, and Backend `PUT /student-assignments/:id/translation/draft` must reject edits on `SUBMITTED`/`REVIEWED` translations and reject cross-student IDOR access with `403`. *(Pinned in Task 3 & Task 6)*

---

### Task 1: MongoDB Schema & Index Integrity

**Files:**
- Modify: `Backend/src/database/schemas/translation-submission.schema.ts:59-63`
- Modify: `Backend/src/database/schemas/exam-attempt.schema.ts:95-114`
- Modify: `Backend/src/database/schemas/assignment.schema.ts:20-35`
- Modify: `Backend/src/database/schemas/notification.schema.ts:8-11`
- Modify: `Backend/src/database/schemas/extension-request.schema.ts:8-17`
- Modify: `Backend/src/database/schemas/penalty-transaction.schema.ts:7-10`
- Modify: `Backend/src/database/schemas/audit-log.schema.ts:10-16`
- Modify: `Backend/src/database/schemas/email-delivery.schema.ts:24-27`
- Test: `Backend/src/database/schemas/schemas-integrity.spec.ts` (Create)

**Interfaces:**
- Consumes: Mongoose `SchemaFactory` definitions in `Backend/src/database/schemas/`.
- Produces:
  - `TranslationSubmissionSchema` partial unique indexes:
    - `{ studentAssignmentId: 1, passageId: 1 }` with `partialFilterExpression: { studentAssignmentId: { $type: 'objectId' }, passageId: { $type: 'string' } }`
    - `{ studentAssignmentId: 1 }` with `partialFilterExpression: { studentAssignmentId: { $type: 'objectId' }, passageId: { $exists: false } }`
    - `{ studentId: 1, testId: 1, passageId: 1 }` with `partialFilterExpression: { testId: { $type: 'objectId' }, passageId: { $type: 'string' } }`
  - `ExamAttempt` optional persisted fields `scorePercent?: number` and `passed?: boolean`, plus partial unique index `{ studentId: 1, testId: 1, mode: 1, partId: 1 }` with `partialFilterExpression: { status: 'IN_PROGRESS' }`.
  - `Assignment.examTestId?: Types.ObjectId` (`ref: 'ExamTest'`, optional) alongside existing `exerciseId` (`ref: 'Exercise'`, optional when `examTestId` is used, or populated explicitly without corrupting `ExamTest` ids).

- [ ] **Step 1: Write failing schema & index integrity tests**

Create `Backend/src/database/schemas/schemas-integrity.spec.ts` asserting:
1. `TranslationSubmissionSchema.indexes()` contains NO `{ unique: true, sparse: true }` compound indexes and defines the 3 `partialFilterExpression` unique indexes above.
2. `ExamAttemptSchema.path('scorePercent')` and `ExamAttemptSchema.path('passed')` exist as Number / Boolean paths, and `ExamAttemptSchema.indexes()` includes the `IN_PROGRESS` partial unique index.
3. `AssignmentSchema.path('examTestId')` exists with `ref: 'ExamTest'`.
4. Redundant prefix single-field indexes (`Notification.userId`, `ExtensionRequest.studentAssignmentId/studentId/courseId`, `PenaltyTransaction.studentId`, `AuditLog.action/entityType`, `EmailDelivery.status`) are removed while their covering compound indexes remain intact.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx jest src/database/schemas/schemas-integrity.spec.ts`
Expected: FAIL on all 4 assertions.

- [ ] **Step 3: Update the 8 Mongoose schema files**

Apply the exact index and field updates defined in **Interfaces** above. Do not alter existing field names or break backwards-compatible reads of legacy `Assignment` docs that stored an `ExamTest._id` in `exerciseId` (handled in Task 5).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd Backend && npx jest src/database/schemas/schemas-integrity.spec.ts && npm run build`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/database/schemas/
git commit -m "fix(mongo): replace compound sparse indexes with partialFilterExpression and add missing schema fields"
```

---

### Task 2: Auth Session Revocation & Password Reset Email Delivery

**Files:**
- Modify: `Backend/src/modules/auth/auth.module.ts:1-33`
- Modify: `Backend/src/modules/auth/auth.service.ts:68-80,234-265,394-423`
- Modify: `Backend/src/modules/mail/mail.service.ts:57-125`
- Test: `Backend/src/modules/auth/auth.service.spec.ts`
- Test: `Backend/src/modules/mail/mail.service.spec.ts`

**Interfaces:**
- Consumes: `MailService.renderTemplate(templateKey, payload)` and `MailService.sendMail(options)` from `Backend/src/modules/mail/mail.service.ts`.
- Produces:
  - `MailService.renderTemplate('password-reset', { fullName, resetToken, resetUrl, expiresInMinutes })` returning `{ subject, html, text }`.
  - `AuthService.revokeAllUserSessions(userId: string): Promise<void>` scanning `${this.redisKeyPrefix}auth:refresh:*`, stripping `this.redisKeyPrefix` before `get()`/`del()`, and awaiting every chunk's async deletion before resolving.
  - `AuthService.forgotPassword(dto: ForgotPasswordDto)` delivering the reset token via `MailService.sendMail(...)` (catching/logging mail errors without leaking account existence).

- [ ] **Step 1: Write failing tests in `auth.service.spec.ts` and `mail.service.spec.ts`**

Add tests asserting:
1. `mail.service.spec.ts`: `renderTemplate('password-reset', { fullName: 'Minh', resetToken: 'id.sec', expiresInMinutes: 15 })` includes `id.sec` and `15` in `html` and `text`.
2. `auth.service.spec.ts`: `revokeAllUserSessions(userId)` calls `redisClient.scanStream({ match: 'ielts:customer:auth:refresh:*', count: 100 })`, strips the prefix `'ielts:customer:'` when calling `get('auth:refresh:t1')` and `del('auth:refresh:t1')`, and does NOT resolve until the async `del` promise completes.
3. `auth.service.spec.ts`: `forgotPassword({ email })` invokes `mailService.sendMail` with the generated `${tokenId}.${rawSecret}` for active users, and does NOT call `sendMail` for unknown emails while returning the identical non-enumerating response.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx jest src/modules/auth/auth.service.spec.ts src/modules/mail/mail.service.spec.ts`
Expected: FAIL on the 3 new tests.

- [ ] **Step 3: Implement Redis prefix-safe revocation and password-reset mail delivery**

- Store `private readonly redisKeyPrefix: string` in `AuthService` constructor (default `'ielts:customer:'`).
- In `revokeAllUserSessions`, scan with `match: \`${this.redisKeyPrefix}auth:refresh:*\``, collect per-chunk work promises into `const pending: Promise<void>[] = []`, strip leading `this.redisKeyPrefix` from each returned key before calling `get`/`del`, and on `end` `await Promise.all(pending)` before resolving.
- Import `MailModule` into `AuthModule` and inject `@Optional() private readonly mailService?: MailService` in `AuthService` (keeps existing unit test mocks backwards-compatible while always injecting in runtime NestJS DI).
- Add `'password-reset'` case in `MailService.renderTemplate` and call `mailService.sendMail(...)` inside `AuthService.forgotPassword` wrapped in `try/catch`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd Backend && npx jest src/modules/auth/auth.service.spec.ts src/modules/mail/mail.service.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/auth/ Backend/src/modules/mail/
git commit -m "fix(auth): fix Redis refresh revocation keyPrefix/async handling and send password-reset email"
```

---

### Task 3: Backend Authorization, IDOR & Data-Scoping Fixes

**Files:**
- Modify: `Backend/src/modules/submissions/student-assignments.controller.ts:160-200,258-287,315-335,397-567`
- Modify: `Backend/src/modules/penalties/penalties.service.ts:124-175`
- Modify: `Backend/src/modules/dashboard/dashboard.controller.ts:46-55`
- Modify: `Backend/src/modules/dashboard/dashboard.service.ts:125-260,310-365`
- Modify: `Backend/src/modules/reading-translations/reading-translations.service.ts:195-215,250-270,320-340,400-425,475-515`
- Modify: `Backend/src/modules/translations/translations.service.ts:135-180`
- Modify: `Backend/src/modules/translations/translations.controller.ts:88-105`
- Test: `Backend/src/modules/submissions/student-assignments.controller.spec.ts` (Create)
- Test: `Backend/src/modules/penalties/penalties.service.spec.ts`
- Test: `Backend/src/modules/dashboard/dashboard.service.spec.ts` (Create)
- Test: `Backend/src/modules/reading-translations/reading-translations.service.spec.ts`
- Test: `Backend/src/modules/translations/translations.service.spec.ts`

**Interfaces:**
- Consumes: `createVnMonthBounds` from `Backend/src/common/utils/vn-time.util.ts`, `UserRole`, `AssignmentStatus`, `TranslationSubmissionStatus`, `EnrollmentStatus`.
- Produces:
  - `StudentAssignmentsController` ownership/lock guard helper enforcing: Student must match `sa.studentId`, Teacher must own `assignment.courseId`, `openAt` must have passed for students on translation endpoints, and `PUT /:id/translation/draft` throws `BadRequestException` if existing translation status is `SUBMITTED` or `REVIEWED`.
  - `PenaltiesService.findAll(query, actor)` intersecting `query.studentId` with teacher's enrolled `studentIds` (throwing `ForbiddenException` if outside teacher's courses).
  - `DashboardService.getStudentPenalties(studentId, actor)` verifying teacher ownership before returning penalties.
  - `DashboardService.getStudentDashboard` / `getTeacherDashboard` / `getStudentProfile` / `getTeacherProfile` returning empty lessons/assignments when course list is empty, scoping teacher counts (`pendingExtensionsCount`, `pendingTranslationsCount`, `overdueStudentsCount`) to teacher's courses, computing student monthly extension quota using `createVnMonthBounds(now)` across all statuses, and setting `recentScores[].submittedAt` from `sa.lastSubmittedAt`.
  - `ReadingTranslationsService.findAllForTeacher` scoping to teacher's courses/tests + filtering by `query.courseId`; `reviewTranslation` checking teacher ownership and rejecting `DRAFT` submissions; validating `Types.ObjectId.isValid(passageId)` before querying `examTestModel`.
  - `TranslationsController.reviewPost` forwarding `decision: dto.decision`; `TranslationsService.findMine` hiding `passage` before `assignment.openAt`.

- [ ] **Step 1: Write failing unit tests covering all IDOR, scoping, quota, and lock bugs**

Write targeted tests in the 5 spec files above asserting:
1. `student-assignments.controller.spec.ts`: Student B calling `GET /:saA/submissions`, `GET /:saA/translation`, `PUT /:saA/translation/draft`, or `POST /:saA/translation/submit` receives `ForbiddenException`; Student A calling `PUT /:saA/translation/draft` on a `REVIEWED` or `SUBMITTED` translation receives `BadRequestException`; Student A calling `GET /:saA/translation` before `openAt` receives `ForbiddenException`.
2. `penalties.service.spec.ts`: Teacher A querying `findAll({ studentId: otherTeachersStudentId }, teacherA)` throws `ForbiddenException` (or returns empty) instead of returning another teacher's student's penalties.
3. `dashboard.service.spec.ts`: Student with 0 enrollments receives `upcomingLessons: []` (lesson query not run / scoped to empty); Teacher with 0 courses receives `recentAssignments: []`, `upcomingLessons: []`, and `0` for all pending/overdue counts; Student extension quota counts all statuses within `createVnMonthBounds(now)`; `recentScores[0].submittedAt` equals `sa.lastSubmittedAt.toISOString()`.
4. `reading-translations.service.spec.ts`: `getPassageWorkspace('not-an-object-id', student)` throws `NotFoundException`/`BadRequestException` (not Mongoose `CastError`); `findAllForTeacher` applies `courseId` and scopes to teacher; `reviewTranslation` rejects `DRAFT` and rejects non-owner teacher with `ForbiddenException`.
5. `translations.service.spec.ts`: `findMine` omits/masks `passage` before `openAt`; `TranslationsController.reviewPost` forwards `decision: 'needs_revision'` to `translationsService.review`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx jest src/modules/submissions/student-assignments.controller.spec.ts src/modules/penalties/penalties.service.spec.ts src/modules/dashboard/dashboard.service.spec.ts src/modules/reading-translations/reading-translations.service.spec.ts src/modules/translations/translations.service.spec.ts`
Expected: FAIL on all new security/scoping assertions.

- [ ] **Step 3: Implement the authorization, scoping, quota, and lock fixes**

Implement each item listed under **Interfaces** in the 7 Backend files. Also update `StudentAssignmentsController.getDetail` & `getReview` to use `assignment.targetScorePercent ?? 70` (instead of hardcoded `70`) and `Boolean(sa.penaltyAppliedAt)`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd Backend && npx jest src/modules/submissions/student-assignments.controller.spec.ts src/modules/penalties/penalties.service.spec.ts src/modules/dashboard/dashboard.service.spec.ts src/modules/reading-translations/reading-translations.service.spec.ts src/modules/translations/translations.service.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/submissions/ Backend/src/modules/penalties/ Backend/src/modules/dashboard/ Backend/src/modules/reading-translations/ Backend/src/modules/translations/
git commit -m "fix(security): close IDOR, teacher/student scoping leaks, quota mismatch, and translation review bugs"
```

---

### Task 4: Exam Attempts, Exam Tests & Legacy Submissions Lifecycle, Grading & Concurrency

**Files:**
- Modify: `Backend/src/modules/exam-attempts/exam-attempts.service.ts:85-105,175-245,315-645,915-935`
- Modify: `Backend/src/modules/exam-tests/exam-tests.service.ts:55-70`
- Modify: `Backend/src/modules/submissions/submissions.service.ts:85-160,315-395`
- Test: `Backend/src/modules/exam-attempts/exam-attempts.service.spec.ts`
- Test: `Backend/src/modules/exam-tests/exam-tests.service.spec.ts`
- Test: `Backend/src/modules/submissions/submissions.service.spec.ts`

**Interfaces:**
- Consumes: `ExamAttempt.scorePercent` and `ExamAttempt.passed` added in Task 1; `gradeQuestion` in `Backend/src/modules/exam-attempts/exam-grading.util.ts`.
- Produces:
  - `ExamAttemptsService.createAttempt`: scopes `idempotencyKey` lookup by `studentId`, checks `linkedAssignment.allowRetake` (blocks if already submitted/passed when `allowRetake === false`) and `linkedAssignment.maxAttempts` (blocks when `sa.attemptsCount >= maxAttempts`), catches `E11000` on concurrent `idempotencyKey` or active attempt race.
  - `ExamAttemptsService.saveAnswers`: atomic `findOneAndUpdate({ _id, status: IN_PROGRESS, answersRevision: dto.baseRevision }, { $set: ..., $inc: { answersRevision: 1 } })` returning `409 ConflictException` on revision mismatch; if `expiresAt <= now`, delegates to auto-submit persistence so `Submission` & `StudentAssignment` are created atomically.
  - `ExamAttemptsService.submitAttempt`: runs inside MongoDB transaction (`this.connection.startSession()`), rejects `EXPIRED` attempts (`BadRequestException`), atomically transitions `IN_PROGRESS` → `SUBMITTED` (or `AUTO_SUBMITTED` ignoring body `answers` if `now > attempt.expiresAt`), writes `scorePercent` & `passed` onto `ExamAttempt`, evaluates pass against `linkedAsn.targetScorePercent ?? test.passScore ?? 70`, and updates `sa.isTargetAchieved = Boolean(sa.isTargetAchieved) || isTargetAchieved` (never regressing `PASSED`/`isTargetAchieved`).
  - `ExamAttemptsService.getResult`: throws `BadRequestException` if `attempt.status === AttemptStatus.IN_PROGRESS`; enforces teacher course ownership in `getAttempt`/`getResult`/`getReview`.
  - `ExamTestsService.checkDraftStatus`: throws `BadRequestException` when `test.status !== ExamTestStatus.DRAFT`.
  - `SubmissionsService`: grades `MULTIPLE_CHOICE_MULTIPLE` by normalized set equality (matching `exam-grading.util.ts`) and uses `assignment.targetScorePercent ?? snapshot.passScore ?? 70`.

- [ ] **Step 1: Write failing tests for all attempt lifecycle, concurrency, immutability, and grading bugs**

Add tests in the 3 spec files asserting:
1. `exam-attempts.service.spec.ts`:
   - `createAttempt` with another student's `idempotencyKey` does NOT return the other student's attempt.
   - `createAttempt` rejects when `linkedAssignment.allowRetake === false` and `sa.attemptsCount >= 1`, or when `sa.attemptsCount >= maxAttempts`.
   - `saveAnswers` uses atomic `findOneAndUpdate` with `answersRevision: dto.baseRevision` and throws `ConflictException` when null.
   - `submitAttempt` ignores body `answers` when `now > expiresAt` (marks `AUTO_SUBMITTED`), rejects `EXPIRED` attempts, persists `scorePercent` & `passed` on `ExamAttempt`, uses `targetScorePercent` (e.g., 85%), and preserves `sa.isTargetAchieved = true` when a retake scores 50%.
   - `getResult` throws `BadRequestException` while `status === IN_PROGRESS`.
2. `exam-tests.service.spec.ts`: mutating a `PUBLISHED` test via `addPart`/`updatePart`/`deletePart` throws `BadRequestException`.
3. `submissions.service.spec.ts`: `MULTIPLE_CHOICE_MULTIPLE` requires exact set equality (`['A', 'C']` passes for `['A', 'C']`, `['A']` or `['A', 'B']` fails) and pass evaluation respects `assignment.targetScorePercent: 85`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx jest src/modules/exam-attempts/exam-attempts.service.spec.ts src/modules/exam-tests/exam-tests.service.spec.ts src/modules/submissions/submissions.service.spec.ts`
Expected: FAIL on all new assertions.

- [ ] **Step 3: Implement fixes in `exam-attempts.service.ts`, `exam-tests.service.ts`, and `submissions.service.ts`**

Follow the exact **Interfaces** above. Ensure MongoDB session helper degrades gracefully only in unit test mocks if `connection.startSession` is stubbed, while using real transactions whenever `connection` is present.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd Backend && npx jest src/modules/exam-attempts/exam-attempts.service.spec.ts src/modules/exam-tests/exam-tests.service.spec.ts src/modules/submissions/submissions.service.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/exam-attempts/ Backend/src/modules/exam-tests/ Backend/src/modules/submissions/
git commit -m "fix(exam): enforce attempt lifecycle, timer, transactions, immutability, and multi-select grading"
```

---

### Task 5: Assignments, Deadlines, Extensions, Penalties, Courses & Users Transactional Integrity

**Files:**
- Modify: `Backend/src/modules/assignments/assignments.controller.ts:74-90`
- Modify: `Backend/src/modules/assignments/assignments.service.ts:95-225,530-550,785-950,965-1155,1420-1435,1575-1695`
- Modify: `Backend/src/modules/deadlines/deadlines.service.ts:135-190`
- Modify: `Backend/src/modules/extensions/extensions.service.ts:390-535`
- Modify: `Backend/src/modules/penalties/penalties.service.ts:240-315`
- Modify: `Backend/src/modules/courses/courses.service.ts:355-415`
- Modify: `Backend/src/modules/users/users.service.ts:55-75`
- Test: `Backend/src/modules/assignments/assignments.service.spec.ts`
- Test: `Backend/src/modules/deadlines/deadlines.service.spec.ts`
- Test: `Backend/src/modules/extensions/extensions.service.spec.ts`
- Test: `Backend/src/modules/penalties/penalties.service.spec.ts`
- Test: `Backend/src/modules/courses/courses.service.spec.ts`
- Test: `Backend/src/modules/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `Assignment.examTestId` added in Task 1; `PenaltyTransaction` fields `actorId`, `reversedBy`, `reversedAt`, `reversalReason`.
- Produces:
  - `AssignmentsService`:
    - Stores `examTestId` when creating from `ExamTest` and resolves `ExamTest` metadata via batch lookup (so `.populate('exerciseId')` never nullifies `ExamTest` assignments and `exerciseType` reflects actual Listening/Reading skill).
    - Applies `query.assignedDate` in `findAll`.
    - Includes `AssignmentStatus.AVAILABLE` in `findMine` backfill.
    - Fixes `computeStudentAssignmentLifecycleStatus`: `SUBMITTED` with `!isPassed && allowRetake && now <= effectiveDeadlineAt` returns `isAvailable: true` (not `COMPLETED`).
    - Removes hardcoded `>= 70` promotion in `onModuleInit` (respects each assignment's `targetScorePercent ?? 70`).
    - Reads `Boolean(sa.penaltyAppliedAt)` for `penaltyApplied`.
    - Wraps `create()` + `dispatchStudentAssignments()` in a session/transaction with `E11000` idempotency recovery.
    - Removes `UserRole.STUDENT` from `AssignmentsController.findByCourse` (or routes student callers to `findMine({ courseId })` — pick `findMine({ courseId })` so the declared `@Roles(STUDENT)` contract actually works!).
  - `DeadlinesService.processOverdueAssignments`: re-queries/guards `StudentAssignment` inside transaction (`status: { $nin: [PASSED, OVERDUE, EXCUSED] }, effectiveDeadlineAt: { $lt: now }`) and sets `sa.penaltyAppliedAt = now`.
  - `ExtensionsService.review`: atomically guards `status: PENDING` inside transaction; sets `actorId: actor._id` (not `createdBy`) on reversal penalty and sets `reversedBy: actor._id, reversedAt: new Date(), reversalReason` on `activePenalty`; logs `effectiveStatus` & `effectiveReviewNote` in audit/notification.
  - `PenaltiesService.reverse`: guards inside transaction and translates `E11000` into `ConflictException`.
  - `CoursesService.update`: when `type` changes `GROUP -> ONE_TO_ONE`, sets `isOneToOneActive: true` on the active enrollment; when `ONE_TO_ONE -> GROUP`, unsets `isOneToOneActive` on active enrollments (inside transaction).
  - `UsersService.create`: wraps `User` + `StudentProfile`/`TeacherProfile` save in transaction and translates `E11000` on `email` into `ConflictException`.

- [ ] **Step 1: Write failing tests across all 6 service specs (and fix brittle date in `assignments.service.spec.ts:315`)**

Add tests asserting:
1. `assignments.service.spec.ts`:
   - Fix line 315 to use a dynamic future date (e.g., tomorrow + 5 days in VN time) instead of hardcoded `2026-11-20`.
   - `findAll({ assignedDate: '2026-11-25' })` filters by `assignedDate`.
   - `findMine` backfill includes `AssignmentStatus.AVAILABLE`.
   - `computeStudentAssignmentLifecycleStatus` keeps failed `SUBMITTED` assignment `isAvailable: true` when `allowRetake: true` and deadline is in future.
   - `onModuleInit` does NOT mark a `bestScore: 75` student `PASSED` when assignment `targetScorePercent: 85`.
   - `ExamTest`-backed assignment preserves `examTestId` and `exerciseType: 'listening'` after formatting (never `exerciseId: "null"`).
2. `deadlines.service.spec.ts`: `processOverdueAssignments` sets `penaltyAppliedAt` on `StudentAssignment` and skips a student who already transitioned to `PASSED` before the transaction locks the document.
3. `extensions.service.spec.ts`: `review` with `{ decision: 'approved', decisionNote: 'OK' }` writes `actorId` (never `createdBy`), sets `reversedBy`/`reversedAt`/`reversalReason` on original penalty, rejects concurrent non-`PENDING` review, and logs `effectiveStatus`/`effectiveReviewNote`.
4. `penalties.service.spec.ts`: `reverse` checks inside transaction and converts `E11000` into `ConflictException`.
5. `courses.service.spec.ts`: toggling `GROUP -> ONE_TO_ONE` sets `isOneToOneActive: true` on existing active enrollment; `ONE_TO_ONE -> GROUP` unsets `isOneToOneActive`.
6. `users.service.spec.ts`: `create` runs `User` and profile saves within a transaction session and converts duplicate-email `E11000` to `ConflictException`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && npx jest src/modules/assignments/assignments.service.spec.ts src/modules/deadlines/deadlines.service.spec.ts src/modules/extensions/extensions.service.spec.ts src/modules/penalties/penalties.service.spec.ts src/modules/courses/courses.service.spec.ts src/modules/users/users.service.spec.ts`
Expected: FAIL on all new assertions.

- [ ] **Step 3: Implement all fixes across the 7 Backend files**

Apply the exact changes listed under **Interfaces**.

- [ ] **Step 4: Run full Backend build and test suite**

Run: `cd Backend && npm run build && npm test`
Expected: Build exit 0, ALL Backend test suites PASS (0 failures).

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/assignments/ Backend/src/modules/deadlines/ Backend/src/modules/extensions/ Backend/src/modules/penalties/ Backend/src/modules/courses/ Backend/src/modules/users/
git commit -m "fix(backend): fix assignment ExamTest population, deadline/extension transactions, and 1:1 enrollment sync"
```

---

### Task 6: Frontend Courses Normalization, Translation Locks, Profile Self-Update, Admin Roles & Cache Invalidation

**Files:**
- Modify: `frontend/src/lib/api/schemas.ts:35-70`
- Modify: `frontend/src/lib/api/endpoints/courses.ts:18-95`
- Modify: `frontend/src/app/teacher/courses/[id]/page.tsx:80-105`
- Modify: `frontend/src/app/student/assignments/[studentAssignmentId]/translation/page.tsx:38-55`
- Modify: `frontend/src/app/student/reading/[testId]/translate/[passageId]/page.tsx:35-95,210-300`
- Modify: `frontend/src/app/student/profile/page.tsx:50-78`
- Modify: `frontend/src/app/admin/users/page.tsx:35-65,130-210`
- Modify: `frontend/src/app/setup/page.tsx:38-50`
- Modify: `frontend/src/app/teacher/translations/page.tsx:265-280`
- Modify: `frontend/src/components/student/student-execution.test.tsx:240-255`
- Modify: `frontend/src/components/teacher/teacher-admin-portal.test.tsx:258-268`
- Test: `frontend/src/lib/api/courses-contract.test.ts` (Create)
- Test: `frontend/src/components/student/student-portal.test.tsx` (or dedicated spec for profile/translation lock)

**Interfaces:**
- Consumes: Backend `Course` raw payload (`_id`, `type`, `teacherId` string or populated object, `startAt`, `endAt`), `PATCH /users/me` (`usersApi.updateOwnProfile`), `GET /reading-translations/:passageId` (`status: "LOCKED"`, `unlocked: false`).
- Produces:
  - `CourseSchema` in `schemas.ts` normalizing `startAt -> startDate` and `endAt -> endDate` (ISO date string) in addition to `_id -> id`, populated `teacherId -> string` + `teacherName`, and `type -> courseType`.
  - `coursesApi.list`, `listMine`, `create`, `getById`, `update` parsing/normalizing course objects through `CourseSchema` so `created.id`, `course.courseType`, `course.teacherId`, `course.startDate`, `course.endDate` are always populated reliably.
  - `TeacherEditCoursePage` omitting `teacherId` when updating as Teacher (Admin edit page keeps `teacherId` reassignment).
  - `StudentAssignmentTranslationPage` computing `isFrozen = workspace.status === "submitted" || workspace.status === "approved" || workspace.status === "reviewed"`.
  - `StudentReadingTranslationPage` computing `isLocked = is403Locked || detail?.status === "LOCKED" || detail?.unlocked === false` to render the locked state and block editing; using `mutate()` (with `onError`) instead of unhandled `mutateAsync()`.
  - `StudentProfilePage` calling `usersApi.updateOwnProfile({ fullName: values.fullName.trim() })` (`PATCH /users/me`) instead of Admin-only `usersApi.update`.
  - `AdminUsersPage` using a single-role selector (matching Backend single `role` model) instead of misleading multi-select checkboxes that silently discard `roles[1+]`.
  - `SetupPage` invalidating `["system", "setup-status"]` on bootstrap success; `TeacherTranslationsPage` invalidating `teacherKeys.dashboard` on V2 passage review success.

- [ ] **Step 1: Write failing Frontend unit/component tests + diagnose the 2 existing test failures**

Create `frontend/src/lib/api/courses-contract.test.ts` and add assertions in student/teacher tests verifying:
1. `CourseSchema.parse` normalizes raw MongoDB `{ _id: 'c1', type: 'one_to_one', teacherId: { _id: 't1', fullName: 'Cô Lan' }, startAt: '2026-11-01T00:00:00.000Z', endAt: '2026-12-01T00:00:00.000Z', ... }` into `{ id: 'c1', courseType: '1:1', teacherId: 't1', teacherName: 'Cô Lan', startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-12-01T00:00:00.000Z' }`.
2. `coursesApi.create` returns normalized `.id` from raw `_id` backend response; `TeacherEditCoursePage` submits `PATCH /courses/:id` without `teacherId` and preserves `courseType: "1:1"`.
3. Student Assignment Translation page freezes textarea & hides save/submit buttons when `status === "reviewed"`.
4. Student Reading V2 Translation page shows locked state when backend returns 200 `{ unlocked: false, status: "LOCKED" }`.
5. Student Profile page calls `usersApi.updateOwnProfile` (not `usersApi.update`).
6. Inspect why `student-execution.test.tsx:246` finds 2 `/Làm lại bài tập/i` links and why `teacher-admin-portal.test.tsx:262` receives `teacherComment` alongside `feedback`; fix the root cause (either duplicate link in UI or stale test expectation after DRIFT fix).

- [ ] **Step 2: Run Frontend tests to verify new tests fail**

Run: `cd frontend && npx vitest run src/lib/api/courses-contract.test.ts src/components/student/student-execution.test.tsx src/components/teacher/teacher-admin-portal.test.tsx`
Expected: FAIL on new assertions.

- [ ] **Step 3: Implement all Frontend fixes**

Apply the exact changes listed under **Interfaces** across the 9 Frontend source files and update the 2 stale test assertions if caused by intentional contract updates (verify root cause first — never mask a real UI bug!).

- [ ] **Step 4: Run full Frontend typecheck, tests, and production build**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: TypeScript 0 errors, ALL Vitest tests PASS, Next.js build exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "fix(frontend): normalize Course API payloads, lock reviewed/LOCKED translations, fix profile update and cache invalidation"
```

---

### Task 7: Final Whole-Repo Verification Gate

**Files:**
- Verify: `Backend/` and `frontend/` (read-only verification + `git status` / `git diff --stat`)

- [ ] **Step 1: Run complete Backend verification**

Run: `cd Backend && npm run build && npm test`
Expected: Exit 0, 0 failed tests.

- [ ] **Step 2: Run complete Frontend verification**

Run: `cd frontend && npx tsc --noEmit && npm test && npm run build`
Expected: Exit 0, 0 TypeScript errors, 0 failed tests, build succeeds.

- [ ] **Step 3: Review git diff and confirm zero unintended changes**

Run: `git status -s && git log --oneline -n 10`
Expected: Clean working tree (or only expected tracked files), all commits scoped cleanly per task.
