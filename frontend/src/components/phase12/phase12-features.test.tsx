import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminFeedbacksPage from "@/app/admin/feedbacks/page";
import AdminPortalLayout from "@/app/admin/layout";
import AdminUsersPage from "@/app/admin/users/page";
import StudentFeedbackPage from "@/app/student/feedback/page";
import StudentPortalLayout from "@/app/student/layout";
import StudentNotificationsPage from "@/app/student/notifications/page";
import TeacherStudentDetailPage from "@/app/teacher/students/[id]/page";
import TeacherStudentsPage from "@/app/teacher/students/page";
import { useStudyTimeHeartbeat } from "@/hooks/use-study-time-heartbeat";
import {
  feedbacksApi,
  notificationsApi,
  studySessionsApi,
  usersApi,
} from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/error";
import { resetMockStore } from "@/lib/api/mocks/router";

let mockRouteParams: Record<string, string> = { id: "stu-01" };
let mockPathname = "/student/dashboard";
let mockUserRoles: Array<"student" | "teacher" | "admin"> = ["student"];

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: mockUserRoles.includes("admin") ? "adm-01" : "stu-01",
      email: mockUserRoles.includes("admin") ? "admin@ielts.vn" : "student@ielts.vn",
      fullName: mockUserRoles.includes("admin") ? "Huỳnh Khôi" : "Khổng Phú Cường",
      roles: mockUserRoles,
      status: "active" as const,
      timezone: "Asia/Ho_Chi_Minh",
    },
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => mockRouteParams,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function HeartbeatHarness({ enabled = true }: { enabled?: boolean }) {
  useStudyTimeHeartbeat(enabled);
  return <div data-testid="hb-harness">active</div>;
}

describe("Phase 12 UI features (Feedback, Study-Time, Admin Reset Password & Reminder Badge)", () => {
  beforeEach(() => {
    resetMockStore();
    mockRouteParams = { id: "stu-01" };
    mockPathname = "/student/dashboard";
    mockUserRoles = ["student"];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders Student Anonymous Feedback page, validates min length, submits via feedbacksApi.create, and surfaces 429 limit", async () => {
    const createSpy = vi.spyOn(feedbacksApi, "create");
    renderWithQuery(<StudentFeedbackPage />);

    expect(screen.getByText(/hoàn toàn ẩn danh/i)).toBeInTheDocument();

    const textarea = screen.getByLabelText(/Nội dung góp ý/i);
    fireEvent.change(textarea, { target: { value: "Ngắn" } });
    fireEvent.click(screen.getByRole("button", { name: /Gửi góp ý ẩn danh/i }));

    expect(await screen.findByText(/tối thiểu 10 ký tự/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Phân loại góp ý/i), {
      target: { value: "SYSTEM_BUG" },
    });
    fireEvent.click(screen.getByRole("button", { name: /4 sao/i }));
    fireEvent.change(textarea, {
      target: { value: "Nút chuyển câu hỏi khi làm bài Reading bị trễ nhẹ." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi góp ý ẩn danh/i }));

    expect(
      await screen.findByText(/Đã gửi góp ý ẩn danh thành công/i),
    ).toBeInTheDocument();
    expect(createSpy).toHaveBeenCalledWith({
      category: "SYSTEM_BUG",
      rating: 4,
      content: "Nút chuyển câu hỏi khi làm bài Reading bị trễ nhẹ.",
    });
    expect(textarea).toHaveValue("");

    createSpy.mockRejectedValueOnce(
      new ApiError({
        statusCode: 429,
        code: "FEEDBACK_DAILY_LIMIT_EXCEEDED",
        message: "Limit reached",
      }),
    );
    fireEvent.change(textarea, {
      target: { value: "Gửi thêm góp ý sau khi đã đạt giới hạn ngày." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi góp ý ẩn danh/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/tối đa 5 lần/i);
  });

  it("renders Admin Feedbacks inbox safely as plain text and updates status via feedbacksApi.updateStatus", async () => {
    const updateSpy = vi.spyOn(feedbacksApi, "updateStatus");
    vi.spyOn(feedbacksApi, "list").mockResolvedValueOnce({
      items: [
        {
          id: "fb-xss-1",
          category: "SYSTEM_BUG",
          rating: 5,
          content: "<script>alert('xss')</script> Lỗi hiển thị bảng điểm",
          status: "NEW",
          adminNote: null,
          reviewedAt: null,
          createdAt: "2026-11-27T07:00:00.000Z",
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      unreadCount: 1,
    });

    renderWithQuery(<AdminFeedbacksPage />);

    expect(await screen.findByText("Ẩn danh")).toBeInTheDocument();
    const contentEl = screen.getByText(/<script>alert\('xss'\)<\/script> Lỗi hiển thị bảng điểm/);
    expect(contentEl).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Cập nhật trạng thái/i }));
    fireEvent.change(await screen.findByLabelText(/Trạng thái xử lý/i), {
      target: { value: "RESOLVED" },
    });
    fireEvent.change(screen.getByLabelText(/Ghi chú nội bộ/i), {
      target: { value: "Đã vá lỗi render văn bản thuần." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lưu trạng thái/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith("fb-xss-1", {
        status: "RESOLVED",
        adminNote: "Đã vá lỗi render văn bản thuần.",
      });
    });
  });

  it("renders Teacher Students study-time column and Student Detail study summary breakdown", async () => {
    const { unmount } = renderWithQuery(<TeacherStudentsPage />);

    expect(await screen.findByText("Khổng Phú Cường")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Thời gian học/i })).toBeInTheDocument();
    expect(screen.getByText("11 giờ 50 phút")).toBeInTheDocument();
    expect(screen.getByText(/7 ngày:\s*4 giờ/i)).toBeInTheDocument();
    unmount();

    mockRouteParams = { id: "stu-01" };
    renderWithQuery(<TeacherStudentDetailPage />);

    expect(await screen.findByText(/Thống kê thời gian học trực tuyến/i)).toBeInTheDocument();
    expect(await screen.findByText("11 giờ 50 phút")).toBeInTheDocument();
  });

  it("shows 'Cấp mật khẩu mới' ONLY on student rows in /admin/users and reveals one-time password with Copy button", async () => {
    const resetSpy = vi.spyOn(usersApi, "resetStudentPassword");
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    renderWithQuery(<AdminUsersPage />);

    expect(await screen.findByText("Khổng Phú Cường")).toBeInTheDocument();
    expect(screen.getByText("Lê Mạnh Hùng")).toBeInTheDocument();
    expect(screen.getByText("Huỳnh Khôi")).toBeInTheDocument();

    const studentRow = screen.getByText("Khổng Phú Cường").closest("tr")!;
    const teacherRow = screen.getByText("Lê Mạnh Hùng").closest("tr")!;
    const adminRow = screen.getByText("Huỳnh Khôi").closest("tr")!;

    expect(
      within(studentRow).getByRole("button", { name: /Cấp mật khẩu mới/i }),
    ).toBeInTheDocument();
    expect(
      within(teacherRow).queryByRole("button", { name: /Cấp mật khẩu mới/i }),
    ).not.toBeInTheDocument();
    expect(
      within(adminRow).queryByRole("button", { name: /Cấp mật khẩu mới/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(studentRow).getByRole("button", { name: /Cấp mật khẩu mới/i }),
    );

    fireEvent.change(await screen.findByLabelText(/Lý do cấp lại mật khẩu/i), {
      target: { value: "Học viên báo quên mật khẩu." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận cấp lại mật khẩu/i }));

    expect(
      await screen.findByText(/Chỉ hiển thị 1 lần — hãy sao chép và gửi cho học viên/i),
    ).toBeInTheDocument();
    expect(resetSpy).toHaveBeenCalledWith("stu-01", {
      requirePasswordChange: true,
      reason: "Học viên báo quên mật khẩu.",
    });

    const pwdField = screen.getByLabelText(/Mật khẩu tạm thời/i) as HTMLInputElement;
    expect(pwdField.value.length).toBeGreaterThanOrEqual(8);

    fireEvent.click(screen.getByRole("button", { name: /Sao chép/i }));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(pwdField.value);
    });
  });

  it("sends study-time heartbeats every 60s only when tab is visible and student was recently active", async () => {
    vi.useFakeTimers();
    const hbSpy = vi.spyOn(studySessionsApi, "heartbeat").mockResolvedValue({
      accepted: true,
      creditedSeconds: 60,
      todayStudySeconds: 60,
      totalStudySeconds: 60,
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    mockPathname = "/student/practice";
    render(<HeartbeatHarness enabled={true} />);

    // Active within 60s -> fires
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(hbSpy).toHaveBeenCalledTimes(1);
    expect(hbSpy).toHaveBeenLastCalledWith({
      deltaSeconds: 60,
      route: "/student/practice",
    });

    // Tab hidden across 180s idle window -> skips all beats while hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    await act(async () => {
      vi.advanceTimersByTime(180_000);
    });
    expect(hbSpy).toHaveBeenCalledTimes(1);

    // Tab visible again, but > 180s without interaction -> skips beat
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(hbSpy).toHaveBeenCalledTimes(1);

    // User interacts -> next 60s tick fires again
    fireEvent.keyDown(window, { key: "ArrowDown" });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(hbSpy).toHaveBeenCalledTimes(2);
  });

  it("renders assignment_schedule_reminder notification badge cleanly", async () => {
    vi.spyOn(notificationsApi, "list").mockResolvedValueOnce({
      items: [
        {
          id: "notif-rem-1",
          type: "assignment_schedule_reminder",
          title: "Nhắc lên lịch giao bài tuần tới",
          message: "Khóa học chưa có bài tập nào được lên lịch trong 7 ngày tới.",
          read: false,
          createdAt: "2026-11-27T01:00:00.000Z",
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    renderWithQuery(<StudentNotificationsPage />);

    expect(await screen.findByText("Nhắc lịch giao bài")).toBeInTheDocument();
    expect(screen.getByText("Nhắc lên lịch giao bài tuần tới")).toBeInTheDocument();
  });

  it("wires StudentPortalLayout with feedback nav link + heartbeat and AdminPortalLayout with feedbacks nav link", async () => {
    vi.useFakeTimers();
    const hbSpy = vi.spyOn(studySessionsApi, "heartbeat").mockResolvedValue({
      accepted: true,
      creditedSeconds: 60,
      todayStudySeconds: 60,
      totalStudySeconds: 60,
    });

    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    mockUserRoles = ["student"];
    mockPathname = "/student/feedback";
    const { unmount } = renderWithQuery(
      <StudentPortalLayout>
        <div>Student Page</div>
      </StudentPortalLayout>,
    );

    const studentLinks = screen.getAllByRole("link", { name: /Góp ý ẩn danh/i });
    expect(studentLinks.some((link) => link.getAttribute("href") === "/student/feedback")).toBe(
      true,
    );

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(hbSpy).toHaveBeenCalledWith({
      deltaSeconds: 60,
      route: "/student/feedback",
    });
    unmount();

    mockUserRoles = ["admin"];
    mockPathname = "/admin/feedbacks";
    renderWithQuery(
      <AdminPortalLayout>
        <div>Admin Page</div>
      </AdminPortalLayout>,
    );
    const adminLinks = screen.getAllByRole("link", { name: /Góp ý học viên/i });
    expect(adminLinks.some((link) => link.getAttribute("href") === "/admin/feedbacks")).toBe(
      true,
    );
  });
});
