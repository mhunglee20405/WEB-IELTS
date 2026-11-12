import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, getFriendlyErrorMessage } from "./error";
import { dispatchMockRequest, resetMockStore } from "./mocks/router";
import {
  CourseFormSchema,
  ExtensionDecisionFormSchema,
  LessonFormSchema,
  ReversePenaltyFormSchema,
  StudentAssignmentDetailSchema,
} from "./schemas";
import type {
  AnswerReviewResponse,
  ExtensionRequestItem,
  StudentAssignmentDetail,
  SubmissionResult,
} from "./types";

describe("API contracts, error normalization & security invariants", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("strips uncontracted answer keys from StudentAssignmentDetailSchema", () => {
    const roguePayload = {
      studentAssignmentId: "sa-01",
      assignmentId: "asg-01",
      courseId: "crs-01",
      courseTitle: "IELTS",
      title: "Reading",
      exerciseType: "reading",
      assignedDate: "2026-11-12",
      openAt: "2026-11-11T17:00:00Z",
      dueAt: "2026-11-12T17:00:00Z",
      effectiveDueAt: "2026-11-12T17:00:00Z",
      timezone: "Asia/Ho_Chi_Minh",
      status: "not_started",
      attemptsCount: 0,
      bestScore: null,
      passed: false,
      answerReviewUnlocked: false,
      translationAvailable: false,
      translationStatus: "not_started",
      penaltyApplied: false,
      exercise: {
        id: "ex-1",
        title: "Passage",
        type: "reading",
        status: "published",
        version: 1,
        passThreshold: 70,
        questions: [
          {
            id: "q-1",
            orderIndex: 1,
            prompt: "Q1",
            type: "tfng",
            points: 1,
            correctAnswer: "TRUE",
            explanation: "Leaked explanation",
          },
        ],
      },
    };

    const parsed = StudentAssignmentDetailSchema.parse(roguePayload);
    const questionRecord = parsed.exercise.questions[0] as Record<string, unknown>;
    expect("correctAnswer" in questionRecord).toBe(false);
    expect("explanation" in questionRecord).toBe(false);
  });

  it("blocks answer review until PASS (>= 70%) and honors Idempotency-Key on submission", async () => {
    const detail = await dispatchMockRequest<StudentAssignmentDetail>({
      method: "GET",
      path: "/student-assignments/sa-01",
    });
    expect("correctAnswer" in (detail.exercise.questions[0] ?? {})).toBe(false);

    await expect(
      dispatchMockRequest({ method: "GET", path: "/student-assignments/sa-01/review" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "ANSWER_LOCKED" });

    // Submit 50% (< 70% threshold) -> still locked
    const failSubmit = await dispatchMockRequest<SubmissionResult>({
      method: "POST",
      path: "/student-assignments/sa-01/submissions",
      headers: { "Idempotency-Key": "idem-fail-1" },
      body: {
        answers: [
          { questionId: "q-r1-1", value: "TRUE" },
          { questionId: "q-r1-2", value: "TRUE" },
        ],
      },
    });
    expect(failSubmit.score).toBe(50);
    expect(failSubmit.passed).toBe(false);
    expect(failSubmit.answerReviewUnlocked).toBe(false);

    // Submit 100% (>= 70% threshold) -> unlocked + idempotent retry returns identical submissionId
    const passPayload = {
      answers: [
        { questionId: "q-r1-1", value: "TRUE" },
        { questionId: "q-r1-2", value: "FALSE" },
      ],
    };
    const passFirst = await dispatchMockRequest<SubmissionResult>({
      method: "POST",
      path: "/student-assignments/sa-01/submissions",
      headers: { "Idempotency-Key": "idem-pass-1" },
      body: passPayload,
    });
    const passDuplicate = await dispatchMockRequest<SubmissionResult>({
      method: "POST",
      path: "/student-assignments/sa-01/submissions",
      headers: { "Idempotency-Key": "idem-pass-1" },
      body: passPayload,
    });
    expect(passFirst.passed).toBe(true);
    expect(passFirst.answerReviewUnlocked).toBe(true);
    expect(passFirst.translationAvailable).toBe(true);
    expect(passDuplicate.submissionId).toBe(passFirst.submissionId);
    expect(passDuplicate.attemptNo).toBe(passFirst.attemptNo);

    const review = await dispatchMockRequest<AnswerReviewResponse>({
      method: "GET",
      path: "/student-assignments/sa-01/review",
    });
    expect(review.items).toHaveLength(2);
    expect(review.items[0]?.correctAnswer).toBe("TRUE");
  });

  it("enforces max 3 extension requests per month in Asia/Ho_Chi_Minh and single pending request per assignment", async () => {
    const createPayload = {
      reason: "Em bị cảm nặng và cần thêm thời gian hoàn thành bài tập ngày hôm nay.",
      requestedDueAt: "2026-11-14T17:00:00.000Z",
    };

    // sa-01 already has ext-01 pending in initial mock store
    await expect(
      dispatchMockRequest({
        method: "POST",
        path: "/student-assignments/sa-01/extensions",
        body: createPayload,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "EXTENSION_ALREADY_PENDING",
    });

    const req2 = await dispatchMockRequest<ExtensionRequestItem>({
      method: "POST",
      path: "/student-assignments/sa-03/extensions",
      body: createPayload,
    });
    expect(req2.status).toBe("pending");

    await dispatchMockRequest<ExtensionRequestItem>({
      method: "POST",
      path: "/student-assignments/sa-04/extensions",
      body: createPayload,
    });

    await expect(
      dispatchMockRequest({
        method: "POST",
        path: "/student-assignments/sa-05/extensions",
        body: createPayload,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "EXTENSION_MONTHLY_LIMIT_REACHED",
    });
  });

  it("maps ApiError codes to friendly Vietnamese UI messages", () => {
    const err = new ApiError({
      statusCode: 403,
      code: "ANSWER_REVIEW_LOCKED",
      message: "Locked",
      requestId: "req-42",
    });
    expect(getFriendlyErrorMessage(err)).toContain("70%");
    expect(err.isForbidden).toBe(true);
  });

  it("enforces Phase 5 domain form invariants in Zod schemas", () => {
    const badBands = CourseFormSchema.safeParse({
      code: "IELTS-BAD",
      title: "Khóa test band",
      courseType: "one_on_one",
      startBand: 7.0,
      targetBand: 6.5,
      status: "active",
      teacherId: "tch-01",
      timezone: "Asia/Ho_Chi_Minh",
    });
    expect(badBands.success).toBe(false);

    const badLessonTime = LessonFormSchema.safeParse({
      courseId: "crs-01",
      title: "Buổi học kiểm tra",
      type: "live_meet",
      dateKey: "2026-11-12",
      startTimeHm: "20:00",
      endTimeHm: "19:00",
      meetUrl: "http://meet.google.com/abc-defg-hij",
    });
    expect(badLessonTime.success).toBe(false);

    const shortReverseReason = ReversePenaltyFormSchema.safeParse({ reason: "Ngắn" });
    expect(shortReverseReason.success).toBe(false);

    const validDecision = ExtensionDecisionFormSchema.safeParse({
      decisionNote: "Đồng ý gia hạn thêm 24 giờ.",
    });
    expect(validDecision.success).toBe(true);
  });
});

