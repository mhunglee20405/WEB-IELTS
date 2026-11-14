import { isMockApiMode } from "../../env";
import { apiRequest, buildQueryString } from "../client";
import type {
  CreateExtensionRequest,
  ExtensionDecisionRequest,
  ExtensionRequestItem,
  PaginatedResponse,
} from "../types";

export const extensionsApi = {
  requestForAssignment(
    studentAssignmentId: string,
    payload: CreateExtensionRequest,
  ): Promise<ExtensionRequestItem> {
    if (isMockApiMode()) {
      return apiRequest<ExtensionRequestItem, CreateExtensionRequest>({
        method: "POST",
        path: `/student-assignments/${encodeURIComponent(studentAssignmentId)}/extensions`,
        body: payload,
      });
    }

    return apiRequest<ExtensionRequestItem, Record<string, unknown>>({
      method: "POST",
      path: "/extension-requests",
      body: {
        studentAssignmentId,
        reason: payload.reason,
        requestedDeadlineAt: payload.requestedDueAt,
      },
    });
  },

  getQuota(): Promise<{ month: string; used: number; limit: number; remaining: number }> {
    return apiRequest<{ month: string; used: number; limit: number; remaining: number }>({
      method: "GET",
      path: "/extension-requests/quota",
    });
  },

  listMine(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResponse<ExtensionRequestItem>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExtensionRequestItem>>({
      method: "GET",
      path: isMockApiMode() ? `/extensions/mine${qs}` : `/extension-requests/mine${qs}`,
    });
  },

  listPending(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResponse<ExtensionRequestItem>> {
    const qs = buildQueryString({ ...query });
    if (isMockApiMode()) {
      return apiRequest<PaginatedResponse<ExtensionRequestItem>>({
        method: "GET",
        path: `/extensions/pending${qs}`,
      });
    }

    const liveQuery = buildQueryString({ status: "PENDING", ...query });
    return apiRequest<PaginatedResponse<ExtensionRequestItem>>({
      method: "GET",
      path: `/extension-requests${liveQuery}`,
    });
  },

  decide(id: string, payload: ExtensionDecisionRequest): Promise<ExtensionRequestItem> {
    if (isMockApiMode()) {
      return apiRequest<ExtensionRequestItem, ExtensionDecisionRequest>({
        method: "POST",
        path: `/extensions/${encodeURIComponent(id)}/decision`,
        body: payload,
      });
    }

    return apiRequest<ExtensionRequestItem, Record<string, unknown>>({
      method: "PATCH",
      path: `/extension-requests/${encodeURIComponent(id)}/review`,
      body: {
        decision: payload.decision === "approved" ? "APPROVED" : "REJECTED",
        reviewNote: payload.decisionNote,
      },
    });
  },
};

