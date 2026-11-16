import { apiRequest, buildQueryString } from "../client";
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

export const coursesApi = {
  list(query: ListCoursesQuery = {}): Promise<PaginatedResponse<Course>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<Course>>({
      method: "GET",
      path: `/courses${qs}`,
    });
  },

  listMine(query: ListCoursesQuery = {}): Promise<PaginatedResponse<Course>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<Course>>({
      method: "GET",
      path: `/courses/mine${qs}`,
    });
  },

  create(payload: CreateCourseRequest): Promise<Course> {
    const rawPayload = payload as unknown as Record<string, unknown>;
    const rawType = (payload.courseType || rawPayload.type || "group") as string;
    const type = rawType === "1:1" || rawType === "one_to_one" ? "one_to_one" : "group";
    const body = {
      code: payload.code,
      title: payload.title,
      description: payload.description,
      startBand: Number(payload.startBand ?? 5.0),
      targetBand: Number(payload.targetBand ?? 6.5),
      type,
      courseType: rawType,
      teacherId: payload.teacherId,
      startAt: payload.startDate || (rawPayload.startAt as string | undefined) || undefined,
      endAt: payload.endDate || (rawPayload.endAt as string | undefined) || undefined,
      startDate: payload.startDate || undefined,
      endDate: payload.endDate || undefined,
      timezone: payload.timezone,
    };
    return apiRequest<Course, typeof body>({
      method: "POST",
      path: "/courses",
      body,
    });
  },

  getById(id: string): Promise<Course> {
    return apiRequest<Course>({
      method: "GET",
      path: `/courses/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateCourseRequest): Promise<Course> {
    const rawPayload = payload as unknown as Record<string, unknown>;
    const rawType = (payload.courseType || rawPayload.type) as string | undefined;
    const body: Record<string, unknown> = {
      title: payload.title,
      description: payload.description,
      startBand: payload.startBand !== undefined ? Number(payload.startBand) : undefined,
      targetBand: payload.targetBand !== undefined ? Number(payload.targetBand) : undefined,
      teacherId: payload.teacherId,
      status: payload.status,
      startAt: payload.startDate || (rawPayload.startAt as string | undefined) || undefined,
      endAt: payload.endDate || (rawPayload.endAt as string | undefined) || undefined,
      startDate: payload.startDate || undefined,
      endDate: payload.endDate || undefined,
      timezone: payload.timezone,
    };
    if (rawType) {
      const type = rawType === "1:1" || rawType === "one_to_one" ? "one_to_one" : "group";
      body.type = type;
      body.courseType = rawType;
    }
    return apiRequest<Course, typeof body>({
      method: "PATCH",
      path: `/courses/${encodeURIComponent(id)}`,
      body,
    });
  },

  listStudents(
    courseId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResponse<CourseStudent>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<CourseStudent>>({
      method: "GET",
      path: `/courses/${encodeURIComponent(courseId)}/students${qs}`,
    });
  },

  addStudent(courseId: string, payload: AddCourseStudentRequest): Promise<CourseStudent> {
    return apiRequest<CourseStudent, AddCourseStudentRequest>({
      method: "POST",
      path: `/courses/${encodeURIComponent(courseId)}/students`,
      body: payload,
    });
  },

  removeStudent(courseId: string, studentId: string): Promise<{ ok?: boolean }> {
    return apiRequest<{ ok?: boolean }>({
      method: "DELETE",
      path: `/courses/${encodeURIComponent(courseId)}/students/${encodeURIComponent(studentId)}`,
    });
  },
};

