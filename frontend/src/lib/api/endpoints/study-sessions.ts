import { apiRequest, buildQueryString } from "../client";
import {
  StudyHeartbeatResponseSchema,
  StudySummarySchema,
  TeacherStudySummaryResponseSchema,
} from "../schemas";
import type {
  StudyHeartbeatRequest,
  StudyHeartbeatResponse,
  StudySummary,
  TeacherStudySummaryResponse,
} from "../types";

export const studySessionsApi = {
  async heartbeat(payload: StudyHeartbeatRequest): Promise<StudyHeartbeatResponse> {
    const clampedSeconds = Math.max(1, Math.min(90, Math.round(payload.deltaSeconds)));
    const body: StudyHeartbeatRequest = {
      deltaSeconds: clampedSeconds,
      ...(payload.route ? { route: payload.route.slice(0, 200) } : {}),
    };
    const raw = await apiRequest<unknown, StudyHeartbeatRequest>({
      method: "POST",
      path: "/study-sessions/heartbeat",
      body,
    });
    return StudyHeartbeatResponseSchema.parse(raw);
  },

  async getMySummary(): Promise<StudySummary> {
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: "/study-sessions/me/summary",
    });
    return StudySummarySchema.parse(raw);
  },

  async getTeacherSummary(courseId?: string): Promise<TeacherStudySummaryResponse> {
    const qs = buildQueryString({ courseId });
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: `/study-sessions/teacher/summary${qs}`,
    });
    return TeacherStudySummaryResponseSchema.parse(raw);
  },

  async getStudentDetail(studentId: string, days?: number): Promise<StudySummary> {
    const qs = buildQueryString({ days });
    const raw = await apiRequest<unknown>({
      method: "GET",
      path: `/study-sessions/students/${encodeURIComponent(studentId)}${qs}`,
    });
    return StudySummarySchema.parse(raw);
  },
};
