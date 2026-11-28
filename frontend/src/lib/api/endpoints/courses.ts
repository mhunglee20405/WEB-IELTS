import { apiRequest, buildQueryString } from "../client";
import { CourseSchema } from "../schemas";
import type {
  AddCourseStudentRequest,
  Course,
  CourseStudent,
  CreateCourseRequest,
  PaginatedResponse,
  UpdateCourseRequest,
} from "../types";

export interface ListCoursesQuery {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}

function normalizeCourse(raw: unknown): Course {
  return CourseSchema.parse(raw);
}

function normalizeCoursePage(
  raw: PaginatedResponse<unknown>,
  fallbackPage: number,
  fallbackLimit: number,
): PaginatedResponse<Course> {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = rawItems.map((item) => normalizeCourse(item));
  const total = typeof raw?.total === "number" ? raw.total : items.length;
  const page = typeof raw?.page === "number" ? raw.page : fallbackPage;
  const limit = typeof raw?.limit === "number" ? raw.limit : fallbackLimit;
  const totalPages =
    typeof raw?.totalPages === "number"
      ? raw.totalPages
      : Math.max(1, Math.ceil(total / Math.max(1, limit)));

  return { items, page, limit, total, totalPages };
}

export const coursesApi = {
  async list(query: ListCoursesQuery = {}): Promise<PaginatedResponse<Course>> {
    const qs = buildQueryString({ ...query });
    const raw = await apiRequest<PaginatedResponse<unknown>>({
      method: "GET",
      path: `/courses${qs}`,
    });
    return normalizeCoursePage(raw, query.page ?? 1, query.limit ?? 20);
  },

  async listMine(query: ListCoursesQuery = {}): Promise<PaginatedResponse<Course>> {
    const qs = buildQueryString({ ...query });
    const raw = await apiRequest<PaginatedResponse<unknown>>({
      method: "GET",
      path: `/courses/mine${qs}`,
    });
    return normalizeCoursePage(raw, query.page ?? 1, query.limit ?? 20);
  },

  async create(payload: CreateCourseRequest): Promise<Course> {
    const rawPayload = payload as unknown as Record<string, unknown>;
    const rawType = (payload.courseType || rawPayload.type || "group") as string;
    const type = rawType === "1:1" || rawType === "one_to_one" ? "one_to_one" : "group";
    const body: Record<string, unknown> = {
      code: payload.code,
      title: payload.title,
      startBand: Number(payload.startBand ?? 5.0),
      targetBand: Number(payload.targetBand ?? 6.5),
      type,
      courseType: rawType,
      teacherId: payload.teacherId,
    };
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.timezone !== undefined) body.timezone = payload.timezone;
    const startVal = payload.startDate || (rawPayload.startAt as string | undefined);
    if (startVal) {
      body.startAt = startVal;
      body.startDate = payload.startDate || startVal;
    }
    const endVal = payload.endDate || (rawPayload.endAt as string | undefined);
    if (endVal) {
      body.endAt = endVal;
      body.endDate = payload.endDate || endVal;
    }
    const raw = await apiRequest<unknown, typeof body>({
      method: "POST",
      path: "/courses",
      body,
    });
    return normalizeCourse(raw);
  },

  async getById(id: string): Promise<Course> {
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: `/courses/${encodeURIComponent(id)}`,
    });
    return normalizeCourse(raw);
  },

  async update(id: string, payload: UpdateCourseRequest): Promise<Course> {
    const rawPayload = payload as unknown as Record<string, unknown>;
    const rawType = (payload.courseType || rawPayload.type) as string | undefined;
    const body: Record<string, unknown> = {};
    if (payload.title !== undefined) body.title = payload.title;
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.startBand !== undefined) body.startBand = Number(payload.startBand);
    if (payload.targetBand !== undefined) body.targetBand = Number(payload.targetBand);
    if (payload.teacherId !== undefined) body.teacherId = payload.teacherId;
    if (payload.status !== undefined) body.status = payload.status;
    if (payload.timezone !== undefined) body.timezone = payload.timezone;

    const startVal = payload.startDate || (rawPayload.startAt as string | undefined);
    if (startVal) {
      body.startAt = startVal;
      body.startDate = payload.startDate || startVal;
    }
    const endVal = payload.endDate || (rawPayload.endAt as string | undefined);
    if (endVal) {
      body.endAt = endVal;
      body.endDate = payload.endDate || endVal;
    }
    if (rawType) {
      const type = rawType === "1:1" || rawType === "one_to_one" ? "one_to_one" : "group";
      body.type = type;
      body.courseType = rawType;
    }
    const raw = await apiRequest<unknown, typeof body>({
      method: "PATCH",
      path: `/courses/${encodeURIComponent(id)}`,
      body,
    });
    return normalizeCourse(raw);
  },

  async listStudents(
    courseId: string,
    query: { page?: number; limit?: number; status?: string } = {},
  ): Promise<PaginatedResponse<CourseStudent>> {
    const qs = buildQueryString({ ...query });
    const res = await apiRequest<PaginatedResponse<Record<string, unknown>>>({
      method: "GET",
      path: `/courses/${encodeURIComponent(courseId)}/students${qs}`,
    });
    const items: CourseStudent[] = (res.items || []).map((raw: Record<string, unknown>) => {
      const stu = (raw.student || {}) as Record<string, unknown>;
      const studentId = String(
        raw.studentId ||
        stu._id ||
        stu.id ||
        raw._id ||
        raw.id ||
        ""
      );
      const fullName = String(raw.fullName || stu.fullName || stu.name || "");
      const email = String(raw.email || stu.email || "");
      const enrolledAt = String(raw.enrolledAt || raw.joinedAt || raw.createdAt || new Date().toISOString());
      const rawStatus = String(raw.status || "active");
      const status = rawStatus === "dropped" ? "inactive" : (rawStatus as CourseStudent["status"]);

      return {
        studentId,
        fullName,
        email,
        enrolledAt,
        status,
      };
    });
    return {
      ...res,
      items,
    };
  },

  async addStudent(courseId: string, payload: AddCourseStudentRequest): Promise<CourseStudent> {
    const raw = await apiRequest<Record<string, unknown>, AddCourseStudentRequest>({
      method: "POST",
      path: `/courses/${encodeURIComponent(courseId)}/students`,
      body: payload,
    });
    const stu = (raw.student || {}) as Record<string, unknown>;
    return {
      studentId: String(raw.studentId || stu._id || stu.id || payload.studentId),
      fullName: String(raw.fullName || stu.fullName || "Học viên"),
      email: String(raw.email || stu.email || ""),
      enrolledAt: String(raw.enrolledAt || raw.joinedAt || new Date().toISOString()),
      status: (raw.status as CourseStudent["status"]) || "active",
    };
  },

  removeStudent(courseId: string, studentId: string): Promise<{ ok?: boolean }> {
    return apiRequest<{ ok?: boolean }>({
      method: "DELETE",
      path: `/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}`,
    });
  },
};

