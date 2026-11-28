import { apiRequest, buildQueryString } from "../client";
import { LessonSchema } from "../schemas";
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
  async list(query: ListLessonsQuery = {}): Promise<PaginatedResponse<Lesson>> {
    const qs = buildQueryString({ ...query });
    const raw = await apiRequest<PaginatedResponse<unknown>>({
      method: "GET",
      path: `/lessons/mine${qs}`,
    });

    const rawItems = Array.isArray(raw?.items) ? raw.items : [];
    const validItems: Lesson[] = [];

    for (const item of rawItems) {
      const parsed = LessonSchema.safeParse(item);
      if (parsed.success) {
        validItems.push(parsed.data);
      } else if (process.env.NODE_ENV !== "production") {
        console.warn("[lessonsApi.list] Skipping malformed lesson record:", item, parsed.error.issues);
      }
    }

    const total = typeof raw?.total === "number" ? raw.total : validItems.length;
    const page = typeof raw?.page === "number" ? raw.page : (query.page ?? 1);
    const limit = typeof raw?.limit === "number" ? raw.limit : (query.limit ?? 20);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      items: validItems,
      total,
      page,
      limit,
      totalPages,
    };
  },

  async create(payload: CreateLessonRequest): Promise<Lesson> {
    const startIso = payload.startAt || payload.startTime;
    const endIso = payload.endAt || payload.endTime;
    const contentText = payload.content ?? payload.description;

    const body: Record<string, unknown> = {
      courseId: payload.courseId,
      title: payload.title,
      startAt: startIso,
      endAt: endIso,
      startTime: startIso,
      endTime: endIso,
    };

    if (contentText !== undefined) {
      body.content = contentText;
      body.description = contentText;
    }
    if (payload.meetUrl !== undefined) {
      body.meetUrl = payload.meetUrl;
    }
    if (payload.status !== undefined) {
      body.status = payload.status;
    }
    if (payload.type !== undefined) {
      body.type = payload.type;
    }

    const res = await apiRequest<unknown>({
      method: "POST",
      path: "/lessons",
      body,
    });
    return LessonSchema.parse(res);
  },

  async update(id: string, payload: UpdateLessonRequest): Promise<Lesson> {
    const body: Record<string, unknown> = {};

    if (payload.title !== undefined) body.title = payload.title;

    const startIso = payload.startAt || payload.startTime;
    if (startIso !== undefined) {
      body.startAt = startIso;
      body.startTime = startIso;
    }

    const endIso = payload.endAt || payload.endTime;
    if (endIso !== undefined) {
      body.endAt = endIso;
      body.endTime = endIso;
    }

    const contentText = payload.content ?? payload.description;
    if (contentText !== undefined) {
      body.content = contentText;
      body.description = contentText;
    }

    if (payload.meetUrl !== undefined) body.meetUrl = payload.meetUrl;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.type !== undefined) body.type = payload.type;

    const res = await apiRequest<unknown>({
      method: "PATCH",
      path: `/lessons/${encodeURIComponent(id)}`,
      body,
    });
    return LessonSchema.parse(res);
  },
};

