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
    return apiRequest<PaginatedResponse<Lesson>>({
      method: "GET",
      path: `/lessons${qs}`,
    });
  },

  create(payload: CreateLessonRequest): Promise<Lesson> {
    return apiRequest<Lesson, CreateLessonRequest>({
      method: "POST",
      path: "/lessons",
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

