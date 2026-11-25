import { isMockApiMode } from "../../env";
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
    const rawPayload = payload as unknown as Record<string, unknown>;
    const exerciseId = (payload.exerciseId || payload.examTestId || rawPayload.exerciseId || rawPayload.examTestId) as string;
    const body: Record<string, unknown> = {
      courseId: payload.courseId,
      exerciseId,
      title: payload.title,
      assignedDate: payload.assignedDate,
    };
    if (payload.examTestId) body.examTestId = payload.examTestId;
    if (payload.openAt) body.openAt = payload.openAt;
    if (payload.dueAt) body.dueAt = payload.dueAt;
    if (payload.timezone) body.timezone = payload.timezone;
    if (payload.requiredScope) body.requiredScope = payload.requiredScope;
    if (payload.requiredScope === "PART" && payload.requiredPartId) {
      body.requiredPartId = payload.requiredPartId;
    }
    if (payload.allowedModes && payload.allowedModes.length > 0) {
      body.allowedModes = payload.allowedModes;
    }
    if (typeof payload.durationSecondsOverride === "number" && !isNaN(payload.durationSecondsOverride)) {
      body.durationSecondsOverride = payload.durationSecondsOverride;
    }
    if (typeof payload.maxAttempts === "number" && !isNaN(payload.maxAttempts)) {
      body.maxAttempts = payload.maxAttempts;
    }
    if (payload.allowRetake !== undefined) {
      body.allowRetake = payload.allowRetake;
    }
    return apiRequest<Assignment, typeof body>({
      method: "POST",
      path: "/assignments",
      body,
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
    if (isMockApiMode()) {
      const qs = buildQueryString({ ...query });
      return apiRequest<PaginatedResponse<Assignment>>({
        method: "GET",
        path: `/assignments/course/${encodeURIComponent(courseId)}${qs}`,
      });
    }
    const qs = buildQueryString({ courseId, ...query });
    return apiRequest<PaginatedResponse<Assignment>>({
      method: "GET",
      path: `/assignments${qs}`,
    });
  },

  getById(id: string): Promise<Assignment> {
    return apiRequest<Assignment>({
      method: "GET",
      path: `/assignments/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateAssignmentRequest): Promise<Assignment> {
    const body: Record<string, unknown> = { ...payload };
    if (payload.dueAt && !body.deadlineAt) {
      body.deadlineAt = payload.dueAt;
    }
    return apiRequest<Assignment, typeof body>({
      method: "PATCH",
      path: `/assignments/${encodeURIComponent(id)}`,
      body,
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

