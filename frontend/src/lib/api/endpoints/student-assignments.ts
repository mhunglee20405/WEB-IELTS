import { apiRequest, createIdempotencyKey } from "../client";
import {
  AnswerReviewResponseSchema,
  StudentAssignmentDetailSchema,
  SubmissionResultSchema,
} from "../schemas";
import type {
  AnswerReviewResponse,
  ReviewTranslationRequest,
  SaveTranslationDraftRequest,
  StudentAssignmentDetail,
  SubmissionHistoryItem,
  SubmissionResult,
  SubmitAnswersRequest,
  SubmitTranslationRequest,
  TranslationWorkspace,
} from "../types";

export const studentAssignmentsApi = {
  async getDetail(id: string): Promise<StudentAssignmentDetail> {
    const data = await apiRequest<StudentAssignmentDetail>({
      method: "GET",
      path: `/student-assignments/${encodeURIComponent(id)}`,
    });
    // Strips any stray answer keys or explanations if accidentally returned
    return StudentAssignmentDetailSchema.parse(data);
  },

  async submitAnswers(
    id: string,
    payload: SubmitAnswersRequest,
    idempotencyKey: string = createIdempotencyKey(),
  ): Promise<SubmissionResult> {
    const data = await apiRequest<SubmissionResult, SubmitAnswersRequest>({
      method: "POST",
      path: `/student-assignments/${encodeURIComponent(id)}/submissions`,
      body: payload,
      idempotencyKey,
    });
    return SubmissionResultSchema.parse(data);
  },

  listSubmissions(id: string): Promise<SubmissionHistoryItem[]> {
    return apiRequest<SubmissionHistoryItem[]>({
      method: "GET",
      path: `/student-assignments/${encodeURIComponent(id)}/submissions`,
    });
  },

  async getReview(id: string): Promise<AnswerReviewResponse> {
    const data = await apiRequest<AnswerReviewResponse>({
      method: "GET",
      path: `/student-assignments/${encodeURIComponent(id)}/review`,
    });
    return AnswerReviewResponseSchema.parse(data);
  },

  getTranslation(id: string): Promise<TranslationWorkspace> {
    return apiRequest<TranslationWorkspace>({
      method: "GET",
      path: `/student-assignments/${encodeURIComponent(id)}/translation`,
    });
  },

  saveTranslationDraft(
    id: string,
    payload: SaveTranslationDraftRequest,
  ): Promise<TranslationWorkspace> {
    return apiRequest<TranslationWorkspace, SaveTranslationDraftRequest>({
      method: "PUT",
      path: `/student-assignments/${encodeURIComponent(id)}/translation/draft`,
      body: payload,
    });
  },

  submitTranslation(
    id: string,
    payload: SubmitTranslationRequest,
  ): Promise<TranslationWorkspace> {
    return apiRequest<TranslationWorkspace, SubmitTranslationRequest>({
      method: "POST",
      path: `/student-assignments/${encodeURIComponent(id)}/translation/submit`,
      body: payload,
    });
  },

  reviewTranslation(
    translationId: string,
    payload: ReviewTranslationRequest,
  ): Promise<TranslationWorkspace> {
    return apiRequest<TranslationWorkspace, ReviewTranslationRequest>({
      method: "POST",
      path: `/translations/${encodeURIComponent(translationId)}/review`,
      body: payload,
    });
  },
};

