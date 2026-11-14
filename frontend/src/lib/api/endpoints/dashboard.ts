import { apiRequest } from "../client";
import type { StudentDashboardResponse, TeacherDashboardResponse } from "../types";

export const dashboardApi = {
  getStudentDashboard(): Promise<StudentDashboardResponse> {
    return apiRequest<StudentDashboardResponse>({
      method: "GET",
      path: "/dashboard/student",
    });
  },

  getTeacherDashboard(): Promise<TeacherDashboardResponse> {
    return apiRequest<TeacherDashboardResponse>({
      method: "GET",
      path: "/dashboard/teacher",
    });
  },
};

