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
    const raw = await apiRequest<ExamResultResponse, SubmitExamAttemptRequest>({
      method: "POST",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/submit`,
      body: payload,
      idempotencyKey: idempotencyKey ?? createIdempotencyKey(),
    });
    return ExamResultResponseSchema.parse(raw);
  },

  async getResult(attemptId: string): Promise<ExamResultResponse> {
    const raw = await apiRequest<ExamResultResponse>({
      method: "GET",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/result`,
    });
    return ExamResultResponseSchema.parse(raw);
  },

  getReview(attemptId: string): Promise<ExamReviewResponse> {
    return apiRequest<ExamReviewResponse>({
      method: "GET",
      path: `/exam-attempts/${encodeURIComponent(attemptId)}/review`,
    });
  },
};

