import { isMockApiMode } from "../../env";
import { apiRequest, buildQueryString } from "../client";
import type {
  CreateLessonRequest,
  Lesson,
  PaginatedResponse,
  UpdateLessonRequest,
} from "../types";

export interface ListLessonsQuery {
  page?: number;
  limit?: number;
  courseId?: string;
  from?: string;
  to?: string;
}

export const lessonsApi = {
  list(query: ListLessonsQuery = {}): Promise<PaginatedResponse<Lesson>> {
    const qs = buildQueryString({ ...query });
    if (isMockApiMode()) {
      return apiRequest<PaginatedResponse<Lesson>>({
        method: "GET",
        path: `/lessons${qs}`,
      });
    }

    if (query.courseId) {
      return apiRequest<PaginatedResponse<Lesson>>({
        method: "GET",
        path: `/courses/${encodeURIComponent(query.courseId)}/lessons${qs}`,
      });
    }

    return apiRequest<PaginatedResponse<Lesson>>({
      method: "GET",
      path: `/lessons/mine${qs}`,
    });
  },

  create(payload: CreateLessonRequest): Promise<Lesson> {
    if (isMockApiMode()) {
      return apiRequest<Lesson, CreateLessonRequest>({
        method: "POST",
        path: "/lessons",
        body: payload,
      });
    }

    return apiRequest<Lesson, CreateLessonRequest>({
      method: "POST",
      path: `/courses/${encodeURIComponent(payload.courseId)}/lessons`,
      body: payload,
    });
  },

  update(id: string, payload: UpdateLessonRequest): Promise<Lesson> {
    return apiRequest<Lesson, UpdateLessonRequest>({
      method: "PATCH",
      path: `/lessons/${encodeURIComponent(id)}`,
      body: payload,
    });
  },
};

