import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, getFriendlyErrorMessage } from "./error";
import { dispatchMockRequest, resetMockStore } from "./mocks/router";
import {
  ExamAttemptDetailSchema,
  ExamPartPublicSchema,
  ExamTestDetailStudentSchema,
} from "./schemas";
import type {
  ExamAttemptDetail,
  ExamResultResponse,
  ExamTestDetailAuthoring,
  ReadingTranslationEligibilityResponse,
  SaveExamAnswersResponse,
} from "./types";
import { serializeAttemptAnswers } from "@/lib/exam/question-meta";

describe("Phase 9 Exam Modes v2 Contracts, Security & State Machine", () => {
  beforeEach(() => {
    resetMockStore();
  });

  it("strips answer keys, acceptedAnswers, explanations, and listening transcripts from student DTO schemas", () => {
    const rogueTestPayload = {
      id: "exam-read-full-01",
      title: "Rogue Test",
      skill: "LISTENING",
      status: "PUBLISHED",
      version: 1,
      partCount: 1,
      totalQuestions: 1,
      totalDurationSeconds: 600,
      tags: ["Listening"],
      allowedModes: ["PART"],
      updatedAt: "2026-11-10T00:00:00.000Z",
      parts: [
        {
          id: "part-sec-1",
          partNumber: 1,
          partType: "SECTION",
          title: "Section 1",
          transcript: "LEAKED TEACHER TRANSCRIPT SHOULD NEVER SURVIVE",
          questionCount: 1,
          questionNumberRange: { start: 1, end: 1 },
          audioAsset: { assetId: "audio-1" },
          questionGroups: [
            {
              id: "grp-1",
              partId: "part-sec-1",
              groupNumber: 1,
              instructionHtml: "<p>Answer</p>",
              questionType: "SHORT_ANSWER",
              questionNumberStart: 1,
              questionNumberEnd: 1,
              questions: [
                {
                  id: "q-1",
                  groupId: "grp-1",
                  questionNumber: 1,
                  prompt: "Closing time?",
                  questionType: "SHORT_ANSWER",
                  correctAnswer: "LEAKED_ANSWER",
                  acceptedAnswers: ["LEAKED_ALT"],
                  explanation: "LEAKED_EXPLANATION",
                },
              ],
            },
          ],
        },
      ],
    };

    const parsedTest = ExamTestDetailStudentSchema.parse(rogueTestPayload);
    const parsedPart = ExamPartPublicSchema.parse(rogueTestPayload.parts[0]);
    const serialized = JSON.stringify({ parsedTest, parsedPart });

    expect(serialized).not.toContain("LEAKED TEACHER TRANSCRIPT");
    expect(serialized).not.toContain("LEAKED_ANSWER");
    expect(serialized).not.toContain("LEAKED_ALT");
    expect(serialized).not.toContain("LEAKED_EXPLANATION");

    const attemptPayload = {
      attemptId: "att-1",
      testId: "exam-1",
      testTitle: "Test",
      skill: "LISTENING",
      mode: "PART",
      status: "IN_PROGRESS",
      revision: 1,
      startedAt: "2026-11-12T00:00:00Z",
      expiresAt: "2026-11-12T00:20:00Z",
      serverTime: "2026-11-12T00:00:00Z",
      remainingSeconds: 1200,
      durationSeconds: 1200,
      parts: [rogueTestPayload.parts[0]],
      answers: {},
      totalQuestions: 1,
      answeredCount: 0,
    };
    const parsedAttempt = ExamAttemptDetailSchema.parse(attemptPayload);
    expect(JSON.stringify(parsedAttempt)).not.toContain("LEAKED");
  });

  it("serializes all single and multi-select answer shapes cleanly", () => {
    const cleaned = serializeAttemptAnswers({
      q1: "  TRUE  ",
      q2: [" B ", "A", "A", ""],
      q3: "   ",
      q4: undefined,
    });
    expect(cleaned).toEqual({
      q1: "TRUE",
      q2: ["B", "A"],
    });
  });

  it("enforces optimistic revision 409 conflicts, idempotent submission, and 70% PASS gating", async () => {
    const attempt = await dispatchMockRequest<ExamAttemptDetail>({
      method: "POST",
      path: "/exam-attempts",
      body: {
        testId: "exam-read-full-01",
        mode: "PART",
        partId: "part-r1-p2",
      },
    });
    expect(attempt.revision).toBe(1);

    // Save once -> revision increments to 2
    const saved = await dispatchMockRequest<SaveExamAnswersResponse>({
      method: "PUT",
      path: `/exam-attempts/${attempt.attemptId}/answers`,
      body: {
        baseRevision: 1,
        answers: { "q-r1-6": "WRONG" },
      },
    });
    expect(saved.revision).toBe(2);

    // Stale revision 1 triggers 409 ANSWERS_REVISION_CONFLICT
    await expect(
      dispatchMockRequest({
        method: "PUT",
        path: `/exam-attempts/${attempt.attemptId}/answers`,
        body: {
          baseRevision: 1,
          answers: { "q-r1-6": "i" },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "ANSWERS_REVISION_CONFLICT",
    });

    // Submit with only wrong answers -> FAIL (< 70%), review & translation stay locked
    const failResult = await dispatchMockRequest<ExamResultResponse>({
      method: "POST",
      path: `/exam-attempts/${attempt.attemptId}/submit`,
      headers: { "Idempotency-Key": "idem-fail-01" },
      body: { expectedRevision: 2 },
    });
    expect(failResult.passed).toBe(false);
    expect(failResult.answerReviewAvailable).toBe(false);
    expect(failResult.translationEligible).toBe(false);

    // Same idempotency key returns identical result
    const replayResult = await dispatchMockRequest<ExamResultResponse>({
      method: "POST",
      path: `/exam-attempts/${attempt.attemptId}/submit`,
      headers: { "Idempotency-Key": "idem-fail-01" },
      body: { expectedRevision: 2 },
    });
    expect(replayResult.submittedAt).toBe(failResult.submittedAt);

    // Locked review & passage 2 translation throw 403
    await expect(
      dispatchMockRequest({
        method: "GET",
        path: `/exam-attempts/${attempt.attemptId}/review`,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "ANSWER_REVIEW_LOCKED" });

    await expect(
      dispatchMockRequest({
        method: "GET",
        path: "/reading-translations/part-r1-p2",
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: "TRANSLATION_LOCKED" });

    // Start new attempt on Passage 2 and score >= 70% -> unlocks ONLY Passage 2 (Passage 3 remains locked)
    const passAttempt = await dispatchMockRequest<ExamAttemptDetail>({
      method: "POST",
      path: "/exam-attempts",
      body: { testId: "exam-read-full-01", mode: "PART", partId: "part-r1-p2" },
    });
    const passResult = await dispatchMockRequest<ExamResultResponse>({
      method: "POST",
      path: `/exam-attempts/${passAttempt.attemptId}/submit`,
      body: {
        expectedRevision: 1,
        answers: {
          "q-r1-6": "i",
          "q-r1-7": "iii",
          "q-r1-8": "clover",
          "q-r1-9": "18",
          "q-r1-10": "NO",
        },
      },
    });
    expect(passResult.scorePercent).toBe(100);
    expect(passResult.passed).toBe(true);
    expect(passResult.translationEligible).toBe(true);

    const elig = await dispatchMockRequest<ReadingTranslationEligibilityResponse>({
      method: "GET",
      path: "/reading-translations/eligibility?testId=exam-read-full-01",
    });
    expect(elig.passages.find((p) => p.passageId === "part-r1-p2")?.eligible).toBe(true);
    expect(elig.passages.find((p) => p.passageId === "part-r1-p3")?.eligible).toBe(false);
  });

  it("never exposes translation eligibility for Listening exams & keeps published teacher tests immutable", async () => {
    const listAttempt = await dispatchMockRequest<ExamAttemptDetail>({
      method: "POST",
      path: "/exam-attempts",
      body: { testId: "exam-list-full-01", mode: "PART", partId: "part-l1-s1" },
    });
    const listRes = await dispatchMockRequest<ExamResultResponse>({
      method: "POST",
      path: `/exam-attempts/${listAttempt.attemptId}/submit`,
      body: {
        expectedRevision: 1,
        answers: { "q-l1-1": "21:30", "q-l1-2": "HORIZON" },
      },
    });
    expect(listRes.passed).toBe(true);
    expect(listRes.translationEligible).toBe(false);

    // Teacher published test PATCH throws 409 EXAM_VERSION_CONFLICT
    await expect(
      dispatchMockRequest<ExamTestDetailAuthoring>({
        method: "PATCH",
        path: "/teacher/exam-tests/exam-read-full-01",
        body: { title: "Mutate published directly" },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: "EXAM_VERSION_CONFLICT" });
  });

  it("maps Phase 9 v2 backend error codes to accessible Vietnamese feedback", () => {
    const codes = [
      "INVALID_EXAM_SCOPE",
      "TRANSLATION_LOCKED",
      "ANSWERS_REVISION_CONFLICT",
      "EXAM_VERSION_CONFLICT",
      "EXAM_PUBLISH_VALIDATION_FAILED",
      "ATTEMPT_EXPIRED",
    ];
    for (const code of codes) {
      const msg = getFriendlyErrorMessage(
        new ApiError({ statusCode: 400, code, message: "raw" }),
      );
      expect(msg).not.toBe("raw");
      expect(msg.length).toBeGreaterThan(10);
    }
  });
});

