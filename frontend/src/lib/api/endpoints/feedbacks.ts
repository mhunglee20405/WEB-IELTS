import { apiRequest, buildQueryString } from "../client";
import {
  FeedbackCreateResponseSchema,
  FeedbackItemSchema,
  FeedbackListResponseSchema,
} from "../schemas";
import type {
  FeedbackCategory,
  FeedbackCreateRequest,
  FeedbackCreateResponse,
  FeedbackItem,
  FeedbackListResponse,
  FeedbackStatus,
  UpdateFeedbackStatusRequest,
} from "../types";

export interface ListFeedbacksQuery {
  page?: number;
  limit?: number;
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  search?: string;
}

export const feedbacksApi = {
  async create(payload: FeedbackCreateRequest): Promise<FeedbackCreateResponse> {
    const body: FeedbackCreateRequest = {
      category: payload.category,
      content: payload.content.trim(),
      ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
    };
    const raw = await apiRequest<unknown, FeedbackCreateRequest>({
      method: "POST",
      path: "/feedbacks",
      body,
    });
    return FeedbackCreateResponseSchema.parse(raw);
  },

  async list(query: ListFeedbacksQuery = {}): Promise<FeedbackListResponse> {
    const qs = buildQueryString({
      page: query.page,
      limit: query.limit,
      status: query.status,
      category: query.category,
      search: query.search?.trim() || undefined,
    });
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: `/feedbacks${qs}`,
    });
    return FeedbackListResponseSchema.parse(raw);
  },

  async updateStatus(
    id: string,
    payload: UpdateFeedbackStatusRequest,
  ): Promise<FeedbackItem> {
    const trimmedNote = payload.adminNote?.trim();
    const body: UpdateFeedbackStatusRequest = {
      status: payload.status,
      ...(payload.adminNote !== undefined ? { adminNote: trimmedNote ?? "" } : {}),
    };
    const raw = await apiRequest<unknown, UpdateFeedbackStatusRequest>({
      method: "PATCH",
      path: `/feedbacks/${encodeURIComponent(id)}/status`,
      body,
    });
    return FeedbackItemSchema.parse(raw);
  },
};
