import { apiRequest, buildQueryString } from "../client";
import {
  ExamPartPublicSchema,
  ExamTestDetailStudentSchema,
} from "../schemas";
import type {
  ExamMode,
  ExamPartPublic,
  ExamSkill,
  ExamTestDetailStudent,
  ExamTestSummary,
  PaginatedResponse,
} from "../types";

export interface ListStudentExamTestsQuery {
  skill?: ExamSkill;
  mode?: ExamMode;
  difficulty?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export const examTestsApi = {
  list(query: ListStudentExamTestsQuery = {}): Promise<PaginatedResponse<ExamTestSummary>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExamTestSummary>>({
      method: "GET",
      path: `/exam-tests${qs}`,
    });
  },

  async getById(testId: string): Promise<ExamTestDetailStudent> {
    const raw = await apiRequest<ExamTestDetailStudent>({
      method: "GET",
      path: `/exam-tests/${encodeURIComponent(testId)}`,
    });
    return ExamTestDetailStudentSchema.parse(raw);
  },

  async getPart(testId: string, partId: string): Promise<ExamPartPublic> {
    const raw = await apiRequest<ExamPartPublic>({
      method: "GET",
      path: `/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}`,
    });
    return ExamPartPublicSchema.parse(raw);
  },
};

