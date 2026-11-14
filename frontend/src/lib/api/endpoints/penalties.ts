import { apiRequest } from "../client";
import type {
  PenaltyRecord,
  PenaltySummary,
  ReversePenaltyRequest,
} from "../types";

export const penaltiesApi = {
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

