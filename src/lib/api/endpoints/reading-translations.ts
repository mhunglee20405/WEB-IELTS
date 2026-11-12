import { apiRequest, buildQueryString } from "../client";
import type {
  PaginatedResponse,
  ReadingTranslationDetail,
  ReadingTranslationEligibilityResponse,
  ReviewReadingTranslationRequest,
  SaveReadingTranslationDraftRequest,
  SubmitReadingTranslationRequest,
  TeacherReadingTranslationItem,
} from "../types";

export interface ListTeacherReadingTranslationsQuery {
  status?: "SUBMITTED" | "REVIEWED" | "DRAFT";
  testId?: string;
  page?: number;
  limit?: number;
}

export const readingTranslationsApi = {
  getEligibility(testId: string): Promise<ReadingTranslationEligibilityResponse> {
    const qs = buildQueryString({ testId });
    return apiRequest<ReadingTranslationEligibilityResponse>({
      method: "GET",
      path: `/reading-translations/eligibility${qs}`,
    });
  },

  getPassage(passageId: string): Promise<ReadingTranslationDetail> {
    return apiRequest<ReadingTranslationDetail>({
      method: "GET",
      path: `/reading-translations/${encodeURIComponent(passageId)}`,
    });
  },

  saveDraft(
    passageId: string,
    payload: SaveReadingTranslationDraftRequest,
  ): Promise<ReadingTranslationDetail> {
    return apiRequest<ReadingTranslationDetail, SaveReadingTranslationDraftRequest>({
      method: "PUT",
      path: `/reading-translations/${encodeURIComponent(passageId)}/draft`,
      body: payload,
    });
  },

  submit(
    passageId: string,
    payload: SubmitReadingTranslationRequest,
  ): Promise<ReadingTranslationDetail> {
    return apiRequest<ReadingTranslationDetail, SubmitReadingTranslationRequest>({
      method: "POST",
      path: `/reading-translations/${encodeURIComponent(passageId)}/submit`,
      body: payload,
    });
  },

  listTeacherQueue(
    query: ListTeacherReadingTranslationsQuery = {},
  ): Promise<PaginatedResponse<TeacherReadingTranslationItem>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<TeacherReadingTranslationItem>>({
      method: "GET",
      path: `/teacher/reading-translations${qs}`,
    });
  },

  reviewTranslation(
    translationId: string,
    payload: ReviewReadingTranslationRequest,
  ): Promise<TeacherReadingTranslationItem> {
    return apiRequest<TeacherReadingTranslationItem, ReviewReadingTranslationRequest>({
      method: "POST",
      path: `/teacher/reading-translations/${encodeURIComponent(translationId)}/review`,
      body: payload,
    });
  },
};

