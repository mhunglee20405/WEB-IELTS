import { apiRequest, buildQueryString, createIdempotencyKey } from "../client";
import {
  ExamAttemptDetailSchema,
  ExamResultResponseSchema,
} from "../schemas";
import type {
  ExamAttemptDetail,
  ExamAttemptStatus,
  ExamAttemptSummaryItem,
  ExamResultResponse,
  ExamReviewResponse,
  PaginatedResponse,
  SaveExamAnswersRequest,
  SaveExamAnswersResponse,
  StartExamAttemptRequest,
  SubmitExamAttemptRequest,
} from "../types";

export interface ListExamAttemptsQuery {
  testId?: string;
  status?: ExamAttemptStatus;
  page?: number;
  limit?: number;
}

function normalizeExamResult(raw: unknown): ExamResultResponse {
  const unwrapped =
    raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).data
      : raw;
  const target = (unwrapped ?? {}) as Record<string, unknown>;
  const normalized = {
    ...target,
    attemptId: target.attemptId ?? target.id ?? "",
  };
  return ExamResultResponseSchema.parse(normalized);
}

export const examAttemptsApi = {
  list(query: ListExamAttemptsQuery = {}): Promise<PaginatedResponse<ExamAttemptSummaryItem>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExamAttemptSummaryItem>>({
      method: "GET",
      path: `/exam-attempts${qs}`,
    });
  },

  async start(payload: StartExamAttemptRequest): Promise<ExamAttemptDetail> {
    const raw = await apiRequest<ExamAttemptDetail, StartExamAttemptRequest>({
      method: "POST",
      path: "/exam-attempts",
      body: payload,
      idempotencyKey: createIdempotencyKey(),
    });
    return ExamAttemptDetailSchema.parse(raw);
  },

  async getById(attemptId: string): Promise<ExamAttemptDetail> {
    const raw = await apiRequest<ExamAttemptDetail>({
      method: "GET",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}`,
    });
    return ExamAttemptDetailSchema.parse(raw);
  },

  saveAnswers(
    attemptId: string,
    payload: SaveExamAnswersRequest,
  ): Promise<SaveExamAnswersResponse> {
    return apiRequest<SaveExamAnswersResponse, SaveExamAnswersRequest>({
      method: "PUT",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/answers`,
      body: payload,
    });
  },

  async submit(
    attemptId: string,
    payload: SubmitExamAttemptRequest,
    idempotencyKey?: string,
  ): Promise<ExamResultResponse> {
    const finalIdemKey = idempotencyKey ?? (payload as any)?.idempotencyKey ?? createIdempotencyKey();
    const raw = await apiRequest<unknown, Record<string, unknown>>({
      method: "POST",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/submit`,
      body: {
        ...payload,
        ...(finalIdemKey ? { idempotencyKey: finalIdemKey } : {}),
      },
      idempotencyKey: finalIdemKey,
    });
    return normalizeExamResult(raw);
  },

  async getResult(attemptId: string): Promise<ExamResultResponse> {
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/result`,
    });
    return normalizeExamResult(raw);
  },

  async getReview(attemptId: string): Promise<ExamReviewResponse> {
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/review`,
    });
    const unwrapped =
      raw && typeof raw === "object" && "data" in (raw as Record<string, unknown>)
        ? (raw as Record<string, unknown>).data
        : raw;
    const target = (unwrapped ?? {}) as Record<string, unknown>;
    return {
      attemptId: (target.attemptId as string) ?? attemptId,
      testId: (target.testId as string) ?? "",
      testTitle: (target.testTitle as string) ?? "",
      skill: target.skill as any,
      answerReviewAvailable: true,
      items: (target.items ?? target.questions ?? []) as any,
    };
  },
};

