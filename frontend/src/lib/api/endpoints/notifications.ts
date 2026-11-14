import { apiRequest, buildQueryString } from "../client";
import type { NotificationItem, PaginatedResponse } from "../types";

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  read?: boolean;
}

export const notificationsApi = {
  list(query: ListNotificationsQuery = {}): Promise<PaginatedResponse<NotificationItem>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<NotificationItem>>({
      method: "GET",
      path: `/notifications${qs}`,
    });
  },

  markAsRead(id: string): Promise<NotificationItem> {
    return apiRequest<NotificationItem>({
      method: "PATCH",
      path: `/notifications/${encodeURIComponent(id)}/read`,
    });
  },
};

