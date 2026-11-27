import { beforeEach, describe, expect, it } from "vitest";
import { formatStudyDuration } from "@/hooks/use-study-time-heartbeat";
import { getDocumentTitleForPathname, getPortalNavItems } from "@/lib/auth/roles";
import { ApiError, CODE_MESSAGES_VI, getFriendlyErrorMessage } from "./error";
import { dispatchMockRequest, resetMockStore } from "./mocks/router";
import { adminKeys, studentKeys, teacherKeys } from "./query-keys";
import {
  AdminResetPasswordResponseSchema,
  AuthUserSchema,
  FeedbackCreateResponseSchema,
  FeedbackItemSchema,
  FeedbackListResponseSchema,
  NotificationTypeSchema,
  StudyHeartbeatResponseSchema,
  StudySummarySchema,
  TeacherStudySummaryResponseSchema,
} from "./schemas";
import type {
  AdminResetPasswordResponse,
  FeedbackCreateResponse,
  FeedbackItem,
  FeedbackListResponse,
  StudyHeartbeatResponse,
  StudySummary,
  TeacherStudySummaryResponse,
} from "./types";

describe("Phase 12 API contracts, schemas, query keys & mock parity", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("validates Phase 12 Zod schemas and strips unexpected author fields on feedbacks", () => {
    const parsedUser = AuthUserSchema.parse({
      id: "stu-01",
      email: "student@ielts.vn",
      fullName: "Khổng Phú Cường",
      roles: ["student"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
      mustChangePassword: true,
    });
    expect(parsedUser.mustChangePassword).toBe(true);

    expect(NotificationTypeSchema.parse("assignment_schedule_reminder")).toBe(
      "assignment_schedule_reminder",
    );

    const parsedFeedback = FeedbackItemSchema.parse({
      id: "fb-01",
      category: "SYSTEM_BUG",
      rating: 4,
      content: "Giao diện đồng hồ đếm giờ bị che nhẹ trên màn hình 360px.",
      status: "NEW",
      adminNote: null,
      reviewedAt: null,
      createdAt: "2026-11-27T07:00:00.000Z",
      studentId: "should-be-stripped",
      email: "leak@example.com",
    }) as Record<string, unknown>;

    expect("studentId" in parsedFeedback).toBe(false);
    expect("email" in parsedFeedback).toBe(false);

    const listParsed = FeedbackListResponseSchema.parse({
      items: [parsedFeedback],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      unreadCount: 1,
    });
    expect(listParsed.unreadCount).toBe(1);

    const createParsed = FeedbackCreateResponseSchema.parse({
      id: "fb-02",
      category: "CONTENT",
      rating: null,
      status: "NEW",
      createdAt: "2026-11-27T07:10:00.000Z",
    });
    expect(createParsed.status).toBe("NEW");

    const hbParsed = StudyHeartbeatResponseSchema.parse({
      accepted: true,
      creditedSeconds: 60,
      todayStudySeconds: 1860,
      totalStudySeconds: 42600,
    });
    expect(hbParsed.creditedSeconds).toBe(60);

    const summaryParsed = StudySummarySchema.parse({
      totalStudySeconds: 42600,
      todayStudySeconds: 1860,
      last7DaysStudySeconds: 14400,
      lastActiveAt: "2026-11-27T07:05:00.000Z",
      dailyBreakdown: [{ dateVn: "2026-11-27", studySeconds: 1860 }],
    });
    expect(summaryParsed.dailyBreakdown).toHaveLength(1);

    const teacherSummaryParsed = TeacherStudySummaryResponseSchema.parse({
      items: [
        {
          studentId: "stu-01",
          totalStudySeconds: 42600,
          last7DaysStudySeconds: 14400,
          lastActiveAt: "2026-11-27T07:05:00.000Z",
        },
      ],
    });
    expect(teacherSummaryParsed.items[0]?.studentId).toBe("stu-01");

    const resetParsed = AdminResetPasswordResponseSchema.parse({
      userId: "stu-01",
      email: "student@ielts.vn",
      temporaryPassword: "IELTS-7K4M9P",
      mustChangePassword: true,
      revokedAllSessions: true,
    });
    expect(resetParsed.temporaryPassword).toBe("IELTS-7K4M9P");
  });

  it("exposes Phase 12 Vietnamese error messages and deterministic query keys", () => {
    expect(CODE_MESSAGES_VI.FEEDBACK_DAILY_LIMIT_EXCEEDED).toBe(
      "Bạn đã đạt giới hạn gửi góp ý trong ngày hôm nay (tối đa 5 lần).",
    );
    expect(CODE_MESSAGES_VI.ADMIN_RESET_STUDENT_ONLY).toBe(
      "Chỉ được cấp lại mật khẩu trực tiếp cho tài khoản học viên.",
    );

    const limitErr = new ApiError({
      statusCode: 429,
      code: "FEEDBACK_DAILY_LIMIT_EXCEEDED",
      message: "Too many",
    });
    expect(getFriendlyErrorMessage(limitErr)).toBe(
      CODE_MESSAGES_VI.FEEDBACK_DAILY_LIMIT_EXCEEDED,
    );

    const resetErr = new ApiError({
      statusCode: 403,
      code: "ADMIN_RESET_STUDENT_ONLY",
      message: "Forbidden",
    });
    expect(getFriendlyErrorMessage(resetErr)).toBe(
      CODE_MESSAGES_VI.ADMIN_RESET_STUDENT_ONLY,
    );

    expect(studentKeys.studySummary).toEqual(["student", "study-summary"]);
    expect(teacherKeys.studentsStudySummary()).toEqual([
      "teacher",
      "students-study-summary",
      "all",
    ]);
    expect(teacherKeys.studentsStudySummary("crs-01")).toEqual([
      "teacher",
      "students-study-summary",
      "crs-01",
    ]);
    expect(teacherKeys.studentStudyDetail("stu-01")).toEqual([
      "teacher",
      "student-study-detail",
      "stu-01",
      14,
    ]);
    expect(adminKeys.feedbacksRoot).toEqual(["admin", "feedbacks"]);
    expect(adminKeys.feedbacks("NEW", "SYSTEM_BUG", "clock", 2)).toEqual([
      "admin",
      "feedbacks",
      "NEW",
      "SYSTEM_BUG",
      "clock",
      2,
    ]);

    expect(getPortalNavItems("student")).toContainEqual({
      href: "/student/feedback",
      label: "Góp ý ẩn danh",
    });
    expect(getPortalNavItems("admin")).toContainEqual({
      href: "/admin/feedbacks",
      label: "Góp ý học viên",
    });
    expect(getDocumentTitleForPathname("/student/feedback")).toContain("Góp ý ẩn danh");
    expect(getDocumentTitleForPathname("/admin/feedbacks")).toContain("Góp ý học viên");
  });

  it("formats study durations accurately in Vietnamese", () => {
    expect(formatStudyDuration(0)).toBe("0 phút");
    expect(formatStudyDuration(300)).toBe("5 phút");
    expect(formatStudyDuration(3600)).toBe("1 giờ");
    expect(formatStudyDuration(42600)).toBe("11 giờ 50 phút");
  });

  it("supports mock anonymous feedback creation, 5/day rate-limit, and admin triage", async () => {
    for (let i = 1; i <= 5; i += 1) {
      const created = await dispatchMockRequest<FeedbackCreateResponse>({
        method: "POST",
        path: "/feedbacks",
        body: {
          category: "FEATURE_REQUEST",
          rating: 5,
          content: `Đề xuất tính năng mới số ${i} giúp luyện đọc hiệu quả hơn.`,
        },
      });
      expect(created.status).toBe("NEW");
    }

    await expect(
      dispatchMockRequest({
        method: "POST",
        path: "/feedbacks",
        body: {
          category: "OTHER",
          content: "Góp ý thứ 6 trong ngày phải bị chặn do vượt hạn mức.",
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: "FEEDBACK_DAILY_LIMIT_EXCEEDED",
    });

    const list = await dispatchMockRequest<FeedbackListResponse>({
      method: "GET",
      path: "/feedbacks?status=NEW",
    });
    expect(list.items.length).toBeGreaterThanOrEqual(5);
    expect(list.unreadCount).toBeGreaterThanOrEqual(5);
    const first = list.items[0] as unknown as Record<string, unknown>;
    expect("studentId" in first).toBe(false);
    expect("email" in first).toBe(false);

    const updated = await dispatchMockRequest<FeedbackItem>({
      method: "PATCH",
      path: `/feedbacks/${list.items[0]!.id}/status`,
      body: {
        status: "RESOLVED",
        adminNote: "Đã tiếp nhận và đưa vào backlog tuần tới.",
      },
    });
    expect(updated.status).toBe("RESOLVED");
    expect(updated.adminNote).toBe("Đã tiếp nhận và đưa vào backlog tuần tới.");
  });

  it("supports mock study-time heartbeat deduplication, summaries, and student-only password reset", async () => {
    const firstBeat = await dispatchMockRequest<StudyHeartbeatResponse>({
      method: "POST",
      path: "/study-sessions/heartbeat",
      body: { deltaSeconds: 60, route: "/student/dashboard" },
    });
    expect(firstBeat.accepted).toBe(true);
    expect(firstBeat.creditedSeconds).toBe(60);

    const rapidDuplicate = await dispatchMockRequest<StudyHeartbeatResponse>({
      method: "POST",
      path: "/study-sessions/heartbeat",
      body: { deltaSeconds: 60, route: "/student/dashboard" },
    });
    expect(rapidDuplicate.accepted).toBe(false);
    expect(rapidDuplicate.creditedSeconds).toBe(0);

    const meSummary = await dispatchMockRequest<StudySummary>({
      method: "GET",
      path: "/study-sessions/me/summary",
    });
    expect(meSummary.totalStudySeconds).toBeGreaterThanOrEqual(42660);

    const teacherSummary = await dispatchMockRequest<TeacherStudySummaryResponse>({
      method: "GET",
      path: "/study-sessions/teacher/summary",
    });
    expect(teacherSummary.items.some((i) => i.studentId === "stu-01")).toBe(true);

    const studentDetail = await dispatchMockRequest<StudySummary>({
      method: "GET",
      path: "/study-sessions/students/stu-01?days=14",
    });
    expect(studentDetail.dailyBreakdown.length).toBeGreaterThan(0);

    const resetRes = await dispatchMockRequest<AdminResetPasswordResponse>({
      method: "POST",
      path: "/users/stu-01/reset-password",
      body: { reason: "Học viên quên mật khẩu trước buổi thi thử." },
    });
    expect(resetRes.userId).toBe("stu-01");
    expect(resetRes.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(resetRes.mustChangePassword).toBe(true);
    expect(resetRes.revokedAllSessions).toBe(true);

    await expect(
      dispatchMockRequest({
        method: "POST",
        path: "/users/tch-01/reset-password",
        body: {},
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "ADMIN_RESET_STUDENT_ONLY",
    });
  });
});
