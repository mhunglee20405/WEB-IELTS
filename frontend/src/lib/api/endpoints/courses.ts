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

  create(payload: CreateCourseRequest): Promise<Course> {
    return apiRequest<Course, CreateCourseRequest>({
      method: "POST",
      path: "/courses",
      body: payload,
    });
  },

  getById(id: string): Promise<Course> {
    return apiRequest<Course>({
      method: "GET",
      path: `/courses/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateCourseRequest): Promise<Course> {
    return apiRequest<Course, UpdateCourseRequest>({
      method: "PATCH",
      path: `/courses/${encodeURIComponent(id)}`,
      body: payload,
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

