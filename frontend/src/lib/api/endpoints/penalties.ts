import { apiRequest, buildQueryString } from "../client";
import type {
  PaginatedResponse,
  PenaltyQuery,
  PenaltyRecord,
  PenaltySummary,
  ReversePenaltyRequest,
} from "../types";

export const penaltiesApi = {
  list(query: PenaltyQuery = {}): Promise<PaginatedResponse<PenaltyRecord>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<PenaltyRecord>>({
      method: "GET",
      path: `/penalties${qs}`,
    });
  },

  getMine(): Promise<PenaltySummary> {
    return apiRequest<PenaltySummary>({
      method: "GET",
      path: "/penalties/mine",
    });
  },

  getByStudent(studentId: string): Promise<PenaltySummary> {
    return apiRequest<PenaltySummary>({
      method: "GET",
      path: `/students/${encodeURIComponent(studentId)}/penalties`,
    });
  },

  reverse(penaltyId: string, payload: ReversePenaltyRequest): Promise<PenaltyRecord> {
    return apiRequest<PenaltyRecord, ReversePenaltyRequest>({
      method: "POST",
      path: `/penalties/${encodeURIComponent(penaltyId)}/reverse`,
      body: payload,
    });
  },
};

