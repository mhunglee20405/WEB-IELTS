import { apiRequest, buildQueryString } from "../client";
import type {
  Assignment,
  CreateAssignmentRequest,
  PaginatedResponse,
  StudentAssignmentSummary,
  UpdateAssignmentRequest,
} from "../types";

export interface ListAssignmentsQuery {
  page?: number;
  limit?: number;
  status?: string;
  assignedDate?: string;
}

export const assignmentsApi = {
  create(payload: CreateAssignmentRequest): Promise<Assignment> {
    return apiRequest<Assignment, CreateAssignmentRequest>({
      method: "POST",
      path: "/assignments",
      body: payload,
    });
  },

  listMine(
    query: ListAssignmentsQuery = {},
  ): Promise<PaginatedResponse<StudentAssignmentSummary>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<StudentAssignmentSummary>>({
      method: "GET",
      path: `/assignments/mine${qs}`,
    });
  },

  listByCourse(
    courseId: string,
    query: ListAssignmentsQuery = {},
  ): Promise<PaginatedResponse<Assignment>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<Assignment>>({
      method: "GET",
      path: `/assignments/course/${encodeURIComponent(courseId)}${qs}`,
    });
  },

  getById(id: string): Promise<Assignment> {
    return apiRequest<Assignment>({
      method: "GET",
      path: `/assignments/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateAssignmentRequest): Promise<Assignment> {
    return apiRequest<Assignment, UpdateAssignmentRequest>({
      method: "PATCH",
      path: `/assignments/${encodeURIComponent(id)}`,
      body: payload,
    });
  },

  listStudents(
    assignmentId: string,
    query: { page?: number; limit?: number } = {},
  ): Promise<PaginatedResponse<StudentAssignmentSummary>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<StudentAssignmentSummary>>({
      method: "GET",
      path: `/assignments/${encodeURIComponent(assignmentId)}/students${qs}`,
    });
  },
};

