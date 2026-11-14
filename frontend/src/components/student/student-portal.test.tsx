import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentAssignmentsPage from "@/app/student/assignments/page";
import StudentCalendarPage from "@/app/student/calendar/page";
import StudentCoursesPage from "@/app/student/courses/page";
import StudentDashboardPage from "@/app/student/dashboard/page";
import StudentNotificationsPage from "@/app/student/notifications/page";
import StudentProfilePage from "@/app/student/profile/page";
import { ApiError } from "@/lib/api/error";
import { usersApi } from "@/lib/api/endpoints";
import { resetMockStore } from "@/lib/api/mocks/router";
import { LessonCard } from "./lesson-card";

const mockRefreshUser = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: "stu-01",
      email: "student@ielts.vn",
      fullName: "Khổng Phú Cường",
      roles: ["student" as const],
      status: "active" as const,
      timezone: "Asia/Ho_Chi_Minh",
    },
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: mockRefreshUser,
  }),
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("Phase 3 Student Portal pages & domain safety", () => {
  beforeEach(() => {
    resetMockStore();
    mockRefreshUser.mockClear();
  });

  it("renders /student/dashboard with today exercises, extension quota, penalties & upcoming Meet lesson", async () => {
    renderWithQuery(<StudentDashboardPage />);

    expect(
      await screen.findByRole("heading", {
        name: /Reading Luyện lại — Heat Island Mitigation/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Còn \d+ \/ 3 lượt/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/điểm phạt đang hiệu lực/i);
    expect(screen.getAllByRole("link", { name: /Vào lớp Google Meet/i })[0]).toHaveAttribute(
      "href",
      expect.stringMatching(/^https:\/\/meet\.google\.com\//),
    );
  });

  it("enforces strict pre-open lock on upcoming assignments in /student/assignments", async () => {
    renderWithQuery(<StudentAssignmentsPage />);

    const upcomingTab = await screen.findByRole("tab", { name: /Sắp mở/i });
    fireEvent.click(upcomingTab);

    expect(
      await screen.findByRole("heading", {
        name: /Reading Ngày mai — Geothermal Architecture/i,
      }),
    ).toBeInTheDocument();

    const lockedBtn = screen.getByRole("button", { name: /Chưa đến giờ mở bài/i });
    expect(lockedBtn).toBeDisabled();
    expect(screen.queryByRole("link", { name: /Bắt đầu làm bài/i })).not.toBeInTheDocument();
  });

  it("renders VN-timezone week & month agenda in /student/calendar and blocks unsafe Meet URLs", async () => {
    renderWithQuery(<StudentCalendarPage />);

    expect(
      await screen.findByRole("heading", {
        name: /Chiến lược True \/ False \/ Not Given nâng cao/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Lịch tháng/i }));
    expect(await screen.findByText(/Buổi học ngày/i)).toBeInTheDocument();

    // Verify LessonCard refuses javascript: Meet links (XSS / open redirect defense)
    render(
      <LessonCard
        lesson={{
          id: "les-unsafe",
          courseId: "crs-1",
          title: "Unsafe Link Test",
          type: "live_meet",
          status: "scheduled",
          startTime: "2026-11-12T12:30:00.000Z",
          endTime: "2026-11-12T14:00:00.000Z",
          timezone: "Asia/Ho_Chi_Minh",
          meetUrl: "javascript:alert(1)",
        }}
      />,
    );
    expect(
      screen.getByText(/bị chặn do không đúng định dạng HTTPS an toàn/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Unsafe Link Test/i })).not.toBeInTheDocument();
  });

  it("renders 1:1 and group courses with band targets in /student/courses", async () => {
    renderWithQuery(<StudentCoursesPage />);

    expect(
      await screen.findByRole("heading", { name: /IELTS Academic 6\.5 — Khóa K12/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /Coaching 1:1 Reading & Listening — Band 7\.5/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Lớp nhóm")).toBeInTheDocument();
    expect(screen.getByText("Lớp 1:1 Cá nhân")).toBeInTheDocument();
    expect(screen.getByText(/5\s*→\s*6\.5/)).toBeInTheDocument();
    expect(screen.getByText(/6\s*→\s*7\.5/)).toBeInTheDocument();
  });

  it("filters unread notifications and marks an item as read in /student/notifications", async () => {
    renderWithQuery(<StudentNotificationsPage />);

    fireEvent.click(await screen.findByRole("tab", { name: /Chưa đọc/i }));

    expect(
      await screen.findByRole("heading", { name: /Bài tập mới hôm nay/i }),
    ).toBeInTheDocument();
    const markBtn = screen.getByRole("button", {
      name: /Đánh dấu đã đọc: Bài tập mới hôm nay/i,
    });
    fireEvent.click(markBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: /Bài tập mới hôm nay/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("updates safe fields via PATCH /users/:id and surfaces 403 cleanly in /student/profile", async () => {
    const updateSpy = vi.spyOn(usersApi, "update");
    renderWithQuery(<StudentProfilePage />);

    const nameInput = await screen.findByLabelText(/Họ và tên/i);
    expect(nameInput).toHaveValue("Khổng Phú Cường");

    fireEvent.change(nameInput, { target: { value: "Khổng Phú Cường Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /Lưu thay đổi/i }));

    expect(
      await screen.findByText(/Đã cập nhật thông tin cá nhân thành công/i),
    ).toBeInTheDocument();
    expect(updateSpy).toHaveBeenCalledWith("stu-01", {
      fullName: "Khổng Phú Cường Updated",
      timezone: "Asia/Ho_Chi_Minh",
    });
    expect(mockRefreshUser).toHaveBeenCalled();

    updateSpy.mockRejectedValueOnce(
      new ApiError({
        statusCode: 403,
        code: "FORBIDDEN",
        message: "Forbidden",
      }),
    );

    fireEvent.change(nameInput, { target: { value: "Blocked Update" } });
    fireEvent.click(screen.getByRole("button", { name: /Lưu thay đổi/i }));

    expect(await screen.findByText(/chỉ được xem thông tin hồ sơ/i)).toBeInTheDocument();

    updateSpy.mockRestore();
  });
});
