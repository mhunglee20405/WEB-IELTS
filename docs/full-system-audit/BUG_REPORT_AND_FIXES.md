# BUG REPORT AND APPLIED FIXES — WEB-IELTS AUDIT

This document details all bugs and contract incompatibilities discovered during the full system audit, providing root cause analyses, files modified, code changes, and verification proofs.

---

## BUG-01: Student Course Access Returns 403 Forbidden

- **Severity:** High (Broken Core Flow)
- **Symptoms:** When a student navigated to `/student/courses`, the page showed an error alert: *"Không thể tải danh sách khóa học (403 Forbidden)"*.
- **Root Cause:** In `Backend/src/modules/courses/courses.controller.ts`, `@Roles(UserRole.ADMIN, UserRole.TEACHER)` was placed on `findAll()`. When the frontend student portal called `coursesApi.list()`, the backend rejected the request because `STUDENT` was omitted from `@Roles`.
- **Files Modified:**
  - `Backend/src/modules/courses/courses.controller.ts`
  - `Backend/src/modules/courses/courses.service.ts`
  - `frontend/src/lib/api/endpoints/courses.ts`
  - `frontend/src/app/student/courses/page.tsx`
- **Solution:**
  1. Updated `CoursesController.findAll()` to allow `UserRole.STUDENT`, internally delegating to `findMine(actor, query)` when the actor is a student to preserve student privacy and multi-tenant isolation.
  2. Added `coursesApi.listMine` to frontend client endpoints and updated `frontend/src/app/student/courses/page.tsx` to target `/courses/mine`.
- **Verification:**
  - Playwright live audit Flow C step `/student/courses` verified: Student enrolled courses loaded with HTTP 200 without permission errors.

---

## BUG-02: Teacher Student Picker Returns 403 Forbidden

- **Severity:** High (Teacher Course Management Blocked)
- **Symptoms:** When a teacher attempted to enroll students into a course from the Teacher Course Management screen, the student selection dropdown failed to load with a 403 Forbidden error.
- **Root Cause:** In `Backend/src/modules/users/users.controller.ts`, `findAll()` was protected with `@Roles(UserRole.ADMIN)` only. Teachers could not query users even when filtering by `role=student`.
- **Files Modified:**
  - `Backend/src/modules/users/users.controller.ts`
- **Solution:**
  - Added `UserRole.TEACHER` to `@Roles(UserRole.ADMIN, UserRole.TEACHER)`.
  - Added logic in `UsersController.findAll`: if the requester has the `TEACHER` role and is not an Admin, `query.role` is forcibly pinned to `UserRole.STUDENT`, preventing teachers from enumerating other teachers or administrators.
- **Verification:**
  - Backend unit test `users.service.spec.ts` passed; teacher enrollment workflows validated.

---

## BUG-03: Dashboard Upcoming Lessons Contract Incompatibility

- **Severity:** Medium (Degraded Student/Teacher Experience)
- **Symptoms:** Upcoming lessons displayed on the Student and Teacher dashboards had missing meeting links and missing description badges, defaulting to blank fields.
- **Root Cause:** `Backend/src/modules/dashboard/dashboard.service.ts` populated lessons from Mongoose with fields `meetUrl` and `content`. However, frontend `Lesson` interface expects `meetingUrl`, `description`, and `type: "live_meet" | "workshop" | "recorded"`.
- **Files Modified:**
  - `Backend/src/modules/dashboard/dashboard.service.ts`
- **Solution:**
  - In `dashboard.service.ts`, enriched `upcomingLessons` mapping to emit:
    ```typescript
    content: l.content ?? '',
    description: l.content ?? '',
    meetUrl: l.meetUrl,
    meetingUrl: l.meetUrl,
    type: l.meetUrl ? 'live_meet' : 'workshop',
    ```
- **Verification:**
  - Live Playwright audit confirmed upcoming lessons render active Google Meet launch buttons on the dashboard.

---

## BUG-04: Notifications Query Parameter Whitelist Error (400 Bad Request)

- **Severity:** Medium (Console Errors & Broken Notification Filters)
- **Symptoms:** When frontend queried `/notifications?read=false`, NestJS returned `400 Bad Request: ["property read should not exist"]`.
- **Root Cause:** NestJS `ValidationPipe` with `forbidNonWhitelisted: true` was rejecting `read` because `Backend/src/modules/notifications/dto/notification-query.dto.ts` only defined `isRead`. Meanwhile, the frontend notifications endpoint was passing `read: false`.
- **Files Modified:**
  - `Backend/src/modules/notifications/dto/notification-query.dto.ts`
  - `Backend/src/modules/notifications/notifications.service.ts`
  - `frontend/src/lib/api/endpoints/notifications.ts`
- **Solution:**
  - Added `@IsOptional() @Type(() => Boolean) @IsBoolean() read?: boolean;` to `NotificationQueryDto`.
  - In `notifications.service.ts`, checked `const isRead = query.isRead ?? query.read;`.
  - In `frontend/src/lib/api/endpoints/notifications.ts`, supported both `isRead` and `read`.
- **Verification:**
  - Tested with both `?read=false` and `?isRead=false`; both return HTTP 200 with filtered unread notifications.

---

## BUG-05: Admin Courses Table Crash ("Objects are not valid as a React child")

- **Severity:** Critical (Admin UI Page Crash)
- **Symptoms:** Opening `/admin/courses` crashed React with:
  `Error: Objects are not valid as a React child (found: object with keys {_id, fullName, email, id})`.
- **Root Cause:** Backend `CoursesService` populated `teacherId` with the full Mongoose user document `{ _id, fullName, email }`. When the admin courses data table rendered the `teacherId` column or cell, React attempted to render the user object directly.
- **Files Modified:**
  - `Backend/src/modules/courses/courses.service.ts`
  - `frontend/src/lib/api/schemas.ts`
  - `frontend/src/app/admin/courses/page.tsx`
- **Solution:**
  1. In `Backend/src/modules/courses/courses.service.ts`, formatted `teacherId` as a string ID and populated `teacherName: teacher.fullName`.
  2. In `frontend/src/lib/api/schemas.ts`, added a preprocessor to `CourseSchema` that unwraps populated `teacherId` objects into string IDs and extracts `teacherName`.
  3. In `frontend/src/app/admin/courses/page.tsx`, updated the column definition to render `row.original.teacherName ?? row.original.teacherId` defensively.
- **Verification:**
  - Playwright audit Flow A: `/admin/courses` renders table rows with active courses without any React errors.

---

## BUG-06: StatusBadge Component Crash ("Cannot read properties of undefined (reading 'classes')")

- **Severity:** High (Frontend Component Crash)
- **Symptoms:** Teacher dashboard and student assignment lists crashed with `TypeError: Cannot read properties of undefined (reading 'classes')`.
- **Root Cause:** `frontend/src/components/ui/status-badge.tsx` maintained a strict status map (`pending`, `active`, `submitted`, `passed`, `failed`, `overdue`). When backend returned statuses such as `available`, `expired`, `closed`, `reviewed`, or `excused`, `STATUS_MAP[status]` evaluated to `undefined`, causing `STATUS_MAP[status].classes` to throw.
- **Files Modified:**
  - `frontend/src/components/ui/status-badge.tsx`
- **Solution:**
  - Added full status coverage in `STATUS_MAP`:
    ```typescript
    available: { label: "Có thể làm", classes: "bg-blue-50 text-blue-700 ring-blue-600/20" },
    expired: { label: "Hết hạn", classes: "bg-amber-50 text-amber-700 ring-amber-600/20" },
    closed: { label: "Đã đóng", classes: "bg-slate-50 text-slate-700 ring-slate-600/20" },
    reviewed: { label: "Đã chấm", classes: "bg-purple-50 text-purple-700 ring-purple-600/20" },
    excused: { label: "Miễn trừ", classes: "bg-zinc-50 text-zinc-700 ring-zinc-600/20" },
    ```
  - Added a defensive fallback: `const config = STATUS_MAP[normalizedStatus] ?? DEFAULT_STATUS_CONFIG;`.
- **Verification:**
  - Tested with various statuses in Vitest and Playwright; components render cleanly with zero exceptions.

---

## BUG-07: Student Practice Library Crash ("Cannot read properties of undefined (reading 'length')")

- **Severity:** High (Practice Library Unusable)
- **Symptoms:** Navigating to `/student/practice` threw `TypeError: Cannot read properties of undefined (reading 'length')`.
- **Root Cause:** The component inspected `test.tags.length` and `test.allowedModes.includes(...)`. When exam tests from the backend did not specify tags or allowed modes, they were returned as `undefined` or `null`.
- **Files Modified:**
  - `frontend/src/app/student/practice/page.tsx`
  - `frontend/src/lib/api/schemas.ts`
- **Solution:**
  - In `frontend/src/lib/api/schemas.ts`, defaulted `tags` to `z.array(z.string()).default([])` and `allowedModes` to `z.array(ExamModeSchema).default([])`.
  - In `frontend/src/app/student/practice/page.tsx`, guarded all access with `test.tags && test.tags.length > 0` and optional chaining `test.allowedModes?.includes("PART")`.
- **Verification:**
  - Verified in Playwright audit Flow C `/student/practice`: Practice test catalog rendered without error.

---

## BUG-08: Mock Router 404 for `GET /courses/mine` in Vitest

- **Severity:** Medium (Test Suite Inconsistency)
- **Symptoms:** `StudentPortalTest: renders 1:1 and group courses in /student/courses` failed in Vitest with 404 Not Found.
- **Root Cause:** When `frontend/src/app/student/courses/page.tsx` was updated to call `coursesApi.listMine` (`GET /courses/mine`), the mock router in `frontend/src/lib/api/mocks/router.ts` only handled `GET /courses`. The route `/courses/mine` fell through to the regex match `/courses/:id`, which looked for a course with ID `"mine"` and threw a 404.
- **Files Modified:**
  - `frontend/src/lib/api/mocks/router.ts`
- **Solution:**
  - Updated mock router route matcher:
    `if (method === "GET" && (pathname === "/courses" || pathname === "/courses/mine"))`
- **Verification:**
  - Vitest test suite now passes 18/18 files, 85/85 tests.

