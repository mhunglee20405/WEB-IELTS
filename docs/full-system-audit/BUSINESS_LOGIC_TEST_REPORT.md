# BUSINESS LOGIC TEST REPORT — WEB-IELTS AUDIT

This report documents the verification of critical business logic rules and domain workflows implemented in the **WEB-IELTS** Learning Management System.

---

## 1. FIXED VIETNAMESE DAILY ASSIGNMENT WINDOW

### Rule Definition:
- **Timezone Authority:** `Asia/Ho_Chi_Minh` (UTC+7). Server-side clock is the single source of truth.
- **Window Boundaries:** From **06:00** on the assigned local date until **06:00** on the following local date.
- **Access Interval:** `[availableAt, dueAt)` (half-open interval).
- **Storage:** Persisted as UTC ISO strings in MongoDB.

### Verification Results:
- In `Backend/src/modules/assignments/assignments.service.ts`:
  When a teacher creates an assignment for local date `2026-11-15`:
  - `availableAt` = `2026-11-14T23:00:00.000Z` (06:00:00 VN)
  - `dueAt` = `2026-11-15T23:00:00.000Z` (06:00:00 VN next day)
- **Automated Tests:**
  - `frontend/src/lib/time/vn-time.test.ts` (5 tests passing).
  - Backend E2E `test/phase10.e2e-spec.ts` verifies window boundaries and daylight saving immunity.
- **Outcome:** **PASS**.

---

## 2. AUTO-GRADING & IELTS BAND SCORE ALGORITHM

### Rule Definition:
- Academic Reading: 40 questions $\rightarrow$ Band 1.0–9.0.
- Academic Listening: 40 questions $\rightarrow$ Band 1.0–9.0.
- Case-insensitivity, trim whitespace, and normalization of multiple valid alternative answers (e.g. `TRUE / T`, `FALSE / F`, `NOT GIVEN / NG`).
- Raw score percentage: `(correct / total) * 100`.

### Verification Results:
- In `Backend/src/modules/submissions/submissions.service.ts` and `exam-attempts.service.ts`:
  - Normalized string comparisons accurately match case-insensitive text and symbol variants.
  - Calculated raw score and converted IELTS band scores match Cambridge IELTS conversion tables.
- **Automated Tests:**
  - `Backend/src/modules/submissions/submissions.service.spec.ts` (PASS).
  - `Backend/src/modules/exam-attempts/exam-attempts.service.spec.ts` (PASS).
- **Outcome:** **PASS**.

---

## 3. READING TRANSLATION UNLOCK WORKFLOW

### Rule Definition:
- **Unlock Condition:** The translation workspace is **LOCKED** until the student achieves a score $\ge 70\%$ (`PASS_SCORE_THRESHOLD = 70`) on the reading assignment/exercise.
- **Workflow Lifecycle:**
  1. `locked`: Score $< 70\%$ or exercise unsubmitted.
  2. `available` / `unlocked`: Student scored $\ge 70\%$.
  3. `submitted`: Student translates passage paragraph by paragraph and submits.
  4. `reviewed`: Teacher evaluates translation, assigns band score (1–9 or percentage), and provides qualitative feedback.

### Verification Results:
- Seeded test accounts verify both scenarios:
  - Student `student2@ielts-lms.local` scored $55\%$ $\rightarrow$ Translation remains LOCKED.
  - Student `student@ielts-lms.local` scored $85\%$ $\rightarrow$ Translation UNLOCKED; student submitted translation; teacher reviewed and graded with feedback.
- **Automated Tests:**
  - `Backend/src/modules/reading-translations/reading-translations.service.spec.ts` (PASS).
  - `frontend/src/components/exam/exam-v2.test.tsx` (PASS).
- **Outcome:** **PASS**.

---

## 4. MONTHLY EXTENSION QUOTA & TEACHER APPROVAL

### Rule Definition:
- Each student is granted a maximum of **2 extensions per calendar month** (`MAX_EXTENSIONS_PER_MONTH = 2`), measured in the `Asia/Ho_Chi_Minh` timezone.
- Student submits extension request with reason.
- Request is queued in Teacher Extension Management.
- When approved, `dueAt` is pushed by +24 hours; if assignment was overdue, overdue flag is cleared.
- Attempting to submit a 3rd extension within the same calendar month throws `400 Bad Request: "Exceeded monthly extension quota"`.

### Verification Results:
- Extension quota counter accurately computes requests within the active month window.
- Teacher approval successfully extends student assignment window.
- **Automated Tests:**
  - `Backend/src/modules/extensions/extensions.service.spec.ts` (PASS).
  - `test/phase6.e2e-spec.ts` (PASS).
- **Outcome:** **PASS**.

---

## 5. AUTOMATED OVERDUE DETECTION & PENALTY LEDGER

### Rule Definition:
- BullMQ repeatable job (`DeadlineScheduler`) runs every 60 seconds.
- Queries all student assignments where `status === 'available'` and `dueAt < new Date()` without pending/approved extensions.
- Atomically transitions status to `overdue` and logs a penalty record in the penalties ledger.
- If an overdue penalty is reversed by a teacher, an audit log entry is created with reason and timestamp.

### Verification Results:
- Tested BullMQ worker and penalty generation on past-due seed assignments.
- Reversal API `/students/:id/penalties/reverse` tested with valid reason.
- **Automated Tests:**
  - `Backend/src/modules/deadlines/deadlines.service.spec.ts` (PASS).
  - `Backend/src/modules/penalties/penalties.service.spec.ts` (PASS).
  - `test/phase7.e2e-spec.ts` (PASS).
- **Outcome:** **PASS**.

---

## 6. TEACHER QUESTION BANK & ZERO LEAK POLICY

### Rule Definition:
- Teachers can author questions, organize by skill/part/tags, and assemble full tests.
- **Zero Leak Policy:** When a student previews an exam test or takes a CBT exam session, the API **MUST NOT** return answer keys, explanations, or listening audio transcripts.
- Only upon successful submission are answers revealed in the results review view.

### Verification Results:
- Verified payload inspection on `/exam-tests/:id` and `/exam-attempts/start`:
  - Student token request: `answers`, `explanations`, `transcript` stripped.
  - Teacher token request: Full answer keys and transcripts available for editing.
- **Automated Tests:**
  - `frontend/src/components/exam/exam-v2.test.tsx` (PASS: "zero leaked answers/transcripts").
  - `Backend/src/modules/exam-tests/exam-tests.service.spec.ts` (PASS).
- **Outcome:** **PASS**.

---

## 7. MULTI-TENANT ISOLATION & ROLE BOUNDARIES

### Rule Definition:
- **Admin:** Global access to all users, courses, assignments, logs, and system metrics.
- **Teacher:** Scoped to courses they instruct; can only see students enrolled in their cohorts; cannot view or edit courses assigned to other teachers.
- **Student:** Scoped strictly to their own enrollments, assignments, calendar, submissions, and penalties. Cannot view other students' data.

### Verification Results:
- Role guards and scoped Mongoose queries enforce strict tenancy boundaries.
- Cross-role test cases verified no privilege escalation or unauthorized data leakage.
- **Automated Tests:**
  - `frontend/src/components/auth/role-guard.test.tsx` (5 tests passing).
  - Backend E2E `test/phase3.e2e-spec.ts` & `test/auth.e2e-spec.ts` (PASS).
- **Outcome:** **PASS**.

