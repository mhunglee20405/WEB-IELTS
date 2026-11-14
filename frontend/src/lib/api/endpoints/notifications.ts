import { apiRequest, buildQueryString } from "../client";
import type { NotificationItem, PaginatedResponse } from "../types";

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  read?: boolean;
  isRead?: boolean;
}

export const notificationsApi = {
  list(query: ListNotificationsQuery = {}): Promise<PaginatedResponse<NotificationItem>> {
    const isRead = query.isRead !== undefined ? query.isRead : query.read;
    const params: Record<string, string | number | boolean | undefined> = { ...query };
    if (isRead !== undefined) {
      params.isRead = isRead;
      params.read = isRead;
    }
    const qs = buildQueryString(params);
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

