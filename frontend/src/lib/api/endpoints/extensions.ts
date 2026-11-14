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
    return apiRequest<ExtensionRequestItem, CreateExtensionRequest>({
      method: "POST",
      path: `/student-assignments/${encodeURIComponent(studentAssignmentId)}/extensions`,
      body: payload,
    });
  },

  listMine(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResponse<ExtensionRequestItem>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExtensionRequestItem>>({
      method: "GET",
      path: `/extensions/mine${qs}`,
    });
  },

  listPending(
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResponse<ExtensionRequestItem>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExtensionRequestItem>>({
      method: "GET",
      path: `/extensions/pending${qs}`,
    });
  },

  decide(id: string, payload: ExtensionDecisionRequest): Promise<ExtensionRequestItem> {
    return apiRequest<ExtensionRequestItem, ExtensionDecisionRequest>({
      method: "POST",
      path: `/extensions/${encodeURIComponent(id)}/decision`,
      body: payload,
    });
  },
};

