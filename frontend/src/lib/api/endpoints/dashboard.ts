import { isMockApiMode } from "../../env";
import { apiRequest } from "../client";
import type {
  Lesson,
  StudentAssignmentSummary,
  StudentDashboardResponse,
  TeacherDashboardResponse,
} from "../types";

export const dashboardApi = {
  async getStudentDashboard(): Promise<StudentDashboardResponse> {
    if (isMockApiMode()) {
      return apiRequest<StudentDashboardResponse>({
        method: "GET",
        path: "/dashboard/student",
      });
    }

    // Live mode: aggregate data across student endpoints
    let assignments: StudentAssignmentSummary[] = [];
    try {
      const res = await apiRequest<{ items: StudentAssignmentSummary[] }>({
        method: "GET",
        path: "/assignments/mine",
      });
      assignments = res.items || [];
    } catch {
      // ignore
    }

    let upcomingLessons: Lesson[] = [];
    try {
      const res = await apiRequest<{ items: Lesson[] }>({
        method: "GET",
        path: "/lessons/mine",
      });
      upcomingLessons = res.items || [];
    } catch {
      // ignore
    }

    let activePenaltiesCount = 0;
    try {
      const res = await apiRequest<{ activePenaltiesCount?: number; totalActive?: number }>({
        method: "GET",
        path: "/penalties/mine",
      });
      activePenaltiesCount = res.activePenaltiesCount ?? res.totalActive ?? 0;
    } catch {
      // ignore
    }

    let quota = { used: 0, limit: 3 };
    try {
      quota = await apiRequest<{ used: number; limit: number }>({
        method: "GET",
        path: "/extension-requests/quota",
      });
    } catch {
      // ignore
    }

    let unreadNotificationsCount = 0;
    try {
      const res = await apiRequest<{ count?: number; unreadCount?: number }>({
        method: "GET",
        path: "/notifications/unread-count",
      });
      unreadNotificationsCount = res.unreadCount ?? res.count ?? 0;
    } catch {
      // ignore
    }

    return {
      todayExercises: assignments.slice(0, 5),
      upcomingDeadlines: assignments.filter((a) => a.status === "not_started" || a.status === "in_progress"),
      upcomingLessons: upcomingLessons.slice(0, 5),
      recentScores: [],
      activePenaltiesCount,
      extensionsUsedThisMonth: quota.used ?? 0,
      maxExtensionsPerMonth: quota.limit ?? 3,
      unreadNotificationsCount,
    };
  },

  async getTeacherDashboard(): Promise<TeacherDashboardResponse> {
    if (isMockApiMode()) {
      return apiRequest<TeacherDashboardResponse>({
        method: "GET",
        path: "/dashboard/teacher",
      });
    }

    let activeCoursesCount = 0;
    try {
      const res = await apiRequest<{ total?: number; items?: unknown[] }>({
        method: "GET",
        path: "/courses",
      });
      activeCoursesCount = res.total ?? (res.items ? res.items.length : 0);
    } catch {
      // ignore
    }

    let pendingExtensionsCount = 0;
    try {
      const res = await apiRequest<{ total?: number; items?: unknown[] }>({
        method: "GET",
        path: "/extension-requests?status=PENDING",
      });
      pendingExtensionsCount = res.total ?? (res.items ? res.items.length : 0);
    } catch {
      // ignore
    }

    let pendingTranslationsCount = 0;
    try {
      const res = await apiRequest<{ total?: number; items?: unknown[] }>({
        method: "GET",
        path: "/teacher/reading-translations?status=SUBMITTED",
      });
      pendingTranslationsCount = res.total ?? (res.items ? res.items.length : 0);
    } catch {
      // ignore
    }

    let upcomingLessons: Lesson[] = [];
    try {
      const res = await apiRequest<{ items: Lesson[] }>({
        method: "GET",
        path: "/lessons/mine",
      });
      upcomingLessons = res.items || [];
    } catch {
      // ignore
    }

    return {
      activeCoursesCount,
      pendingExtensionsCount,
      pendingTranslationsCount,
      overdueStudentsCount: 0,
      recentAssignments: [],
      upcomingLessons: upcomingLessons.slice(0, 5),
    };
  },
};

