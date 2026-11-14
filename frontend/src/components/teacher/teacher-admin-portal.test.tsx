import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAuditPage from "@/app/admin/audit/page";
import AdminCoursesPage from "@/app/admin/courses/page";
import AdminSettingsPage from "@/app/admin/settings/page";
import AdminUsersPage from "@/app/admin/users/page";
import TeacherAssignmentResultsPage from "@/app/teacher/assignments/[id]/results/page";
import TeacherNewAssignmentPage from "@/app/teacher/assignments/new/page";
import TeacherCalendarPage from "@/app/teacher/calendar/page";
import TeacherCourseStudentsPage from "@/app/teacher/courses/[id]/students/page";
import TeacherNewCoursePage from "@/app/teacher/courses/new/page";
import TeacherDashboardPage from "@/app/teacher/dashboard/page";
import TeacherEditExercisePage from "@/app/teacher/exercises/[id]/edit/page";
import TeacherNewExercisePage from "@/app/teacher/exercises/new/page";
import TeacherExtensionsPage from "@/app/teacher/extensions/page";
import TeacherTranslationsPage from "@/app/teacher/translations/page";
import {
  coursesApi,
  exercisesApi,
  extensionsApi,
  mediaApi,
  penaltiesApi,
  studentAssignmentsApi,
  usersApi,
} from "@/lib/api/endpoints";
import { resetMockStore } from "@/lib/api/mocks/router";

let mockRouteParams: Record<string, string> = { id: "crs-02" };
const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => mockRouteParams,
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: mockRefresh,
  }),
  usePathname: () => "/teacher/dashboard",
}));

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
      id: "tch-01",
      email: "teacher@ielts.vn",
      fullName: "Lê Mạnh Hùng",
      roles: ["teacher" as const, "admin" as const],
      status: "active" as const,
      timezone: "Asia/Ho_Chi_Minh",
    },
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
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

describe("Phase 5 Teacher & Admin Portals", () => {
  beforeEach(() => {
    resetMockStore();
    mockRouteParams = { id: "crs-02" };
    mockPush.mockReset();
    mockRefresh.mockReset();
  });

  it("renders /teacher/dashboard with KPI counters, links, and upcoming lessons", async () => {
    renderWithQuery(<TeacherDashboardPage />);

    expect(
      screen.getByRole("heading", { name: /Tổng quan Giảng viên/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Khóa học hoạt động/i)).toBeInTheDocument();
    expect(screen.getByText(/Gia hạn chờ duyệt/i)).toBeInTheDocument();
    expect(screen.getByText(/Bài dịch chờ chấm/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: /Chiến lược True \/ False \/ Not Given nâng cao/i,
      }),
    ).toBeInTheDocument();
  });

  it("validates startBand <= targetBand on /teacher/courses/new and enforces 1:1 limit on /teacher/courses/[id]/students", async () => {
    const createSpy = vi.spyOn(coursesApi, "create");
    const { unmount } = renderWithQuery(<TeacherNewCoursePage />);

    fireEvent.change(screen.getByLabelText(/Mã khóa học/i), {
      target: { value: "IELTS-BAND-CHECK" },
    });
    fireEvent.change(screen.getByLabelText(/Tên khóa học/i), {
      target: { value: "Khóa test band" },
    });
    fireEvent.change(screen.getByLabelText(/Band xuất phát/i), {
      target: { value: "7.5" },
    });
    fireEvent.change(screen.getByLabelText(/Band mục tiêu/i), {
      target: { value: "6.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Tạo khóa học$/i }));

    expect(
      await screen.findByText(/Band mục tiêu phải lớn hơn hoặc bằng band xuất phát/i),
    ).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
    unmount();

    mockRouteParams = { id: "crs-02" };
    renderWithQuery(<TeacherCourseStudentsPage />);

    expect(
      await screen.findByText(/Khóa học 1:1 đã đủ 1 học viên đang theo học/i),
    ).toBeInTheDocument();

    const picker = screen.getByLabelText(/Chọn học viên cần ghi danh/i);
    fireEvent.change(picker, { target: { value: "stu-03" } });
    fireEvent.click(screen.getByRole("button", { name: /Thêm vào lớp/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Khóa học 1:1 chỉ cho phép tối đa 1 học viên/i,
    );
  });

  it("validates start < end time and HTTPS Meet URL in /teacher/calendar lesson modal", async () => {
    renderWithQuery(<TeacherCalendarPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Lên lịch buổi học/i }));

    const titleInput = await screen.findByLabelText(/Tiêu đề buổi học/i);
    fireEvent.change(titleInput, { target: { value: "Chữa đề Listening Section 3" } });
    fireEvent.change(screen.getByLabelText(/Giờ bắt đầu/i), { target: { value: "20:00" } });
    fireEvent.change(screen.getByLabelText(/Giờ kết thúc/i), { target: { value: "19:00" } });
    fireEvent.change(screen.getByLabelText(/Liên kết Google Meet/i), {
      target: { value: "http://insecure.example.com" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Tạo buổi học/i }));

    expect(
      await screen.findByText(/Giờ kết thúc phải sau giờ bắt đầu/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Liên kết Google Meet phải sử dụng giao thức HTTPS hợp lệ/i),
    ).toBeInTheDocument();
  });

  it("validates audio MIME in /teacher/exercises/new and enforces published immutability -> new version in /edit", async () => {
    const initSpy = vi.spyOn(mediaApi, "initAudioUpload");
    const completeSpy = vi.spyOn(mediaApi, "completeAudioUpload");
    const versionSpy = vi.spyOn(exercisesApi, "createVersion");

    const { unmount } = renderWithQuery(<TeacherNewExercisePage />);

    fireEvent.change(screen.getByLabelText(/Kỹ năng/i), {
      target: { value: "listening" },
    });

    const fileInput = document.querySelector("#audio-upload") as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    const badFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Định dạng âm thanh chưa được hỗ trợ/i,
    );
    expect(initSpy).not.toHaveBeenCalled();

    const goodFile = new File(["audio-bytes"], "part1.mp3", { type: "audio/mpeg" });
    fireEvent.change(fileInput, { target: { files: [goodFile] } });

    expect(await screen.findByText(/Đã tải lên thành công/i)).toBeInTheDocument();
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledTimes(1);
    unmount();

    mockRouteParams = { id: "ex-read-01" };
    renderWithQuery(<TeacherEditExercisePage />);

    expect(
      await screen.findByText(/Đề đã xuất bản được khóa bảo toàn lịch sử chấm điểm/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Tiêu đề bài tập/i)).toHaveAttribute("readonly");

    fireEvent.click(screen.getByRole("button", { name: /Tạo phiên bản nháp mới/i }));
    await waitFor(() => {
      expect(versionSpy).toHaveBeenCalledWith("ex-read-01");
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/teacher\/exercises\/ex-read-01-v2\/edit/));
    });

    initSpy.mockRestore();
    completeSpy.mockRestore();
    versionSpy.mockRestore();
  });

  it("creates assignment with VN daily window, displays results, decides extensions, and reviews translations", async () => {
    const decideSpy = vi.spyOn(extensionsApi, "decide");
    const reviewSpy = vi.spyOn(studentAssignmentsApi, "reviewTranslation");

    const { unmount: unmountNew } = renderWithQuery(<TeacherNewAssignmentPage />);
    expect(await screen.findByText(/Khung mở\/đóng bài tự động theo giờ Việt Nam/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Chọn khóa học/i), { target: { value: "crs-01" } });
    fireEvent.change(screen.getByLabelText(/Chọn đề đã xuất bản/i), { target: { value: "ex-read-01" } });
    fireEvent.change(screen.getByLabelText(/Tiêu đề bài giao cho học viên/i), {
      target: { value: "Reading Bài Tập Mới K12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận giao bài/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/teacher\/assignments\/asg-/));
    });
    unmountNew();

    mockRouteParams = { id: "asg-01" };
    const { unmount: unmountRes } = renderWithQuery(<TeacherAssignmentResultsPage />);
    expect(await screen.findByText("Khổng Phú Cường")).toBeInTheDocument();
    expect(screen.getByText("Trần Đức Minh")).toBeInTheDocument();
    unmountRes();

    const { unmount: unmountExt } = renderWithQuery(<TeacherExtensionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Phê duyệt/i }));
    fireEvent.change(await screen.findByLabelText(/Ghi chú phản hồi gửi học viên/i), {
      target: { value: "Đồng ý gia hạn thêm 24h để học viên hoàn thành bài." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận phê duyệt/i }));
    expect(await screen.findByText(/Đã phê duyệt gia hạn/i)).toBeInTheDocument();
    expect(decideSpy).toHaveBeenCalledWith("ext-01", {
      decision: "approved",
      decisionNote: "Đồng ý gia hạn thêm 24h để học viên hoàn thành bài.",
    });
    unmountExt();

    renderWithQuery(<TeacherTranslationsPage />);
    expect(await screen.findByText(/Các thành phố trên khắp châu Á/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nhận xét sửa lỗi/i), {
      target: { value: "Bản dịch mạch lạc, đúng thuật ngữ 'thoát hơi nước'." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi kết quả chấm dịch/i }));
    expect(await screen.findByText(/Đã chấm Đạt cho bản dịch/i)).toBeInTheDocument();
    expect(reviewSpy).toHaveBeenCalledWith("tr-06", {
      decision: "approved",
      feedback: "Bản dịch mạch lạc, đúng thuật ngữ 'thoát hơi nước'.",
    });

    decideSpy.mockRestore();
    reviewSpy.mockRestore();
  });

  it("supports Admin users creation, courses oversight, audited penalty reversal, and health settings", async () => {
    const createUserSpy = vi.spyOn(usersApi, "create");
    const reverseSpy = vi.spyOn(penaltiesApi, "reverse");

    const { unmount: unmountUsers } = renderWithQuery(<AdminUsersPage />);
    expect(await screen.findByText("Lê Mạnh Hùng")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tạo tài khoản mới/i }));
    fireEvent.change(await screen.findByLabelText(/Họ và tên/i), {
      target: { value: "Đỗ Gia Bảo" },
    });
    fireEvent.change(screen.getByLabelText(/Email đăng nhập/i), {
      target: { value: "baodo@ielts.vn" },
    });
    fireEvent.change(screen.getByLabelText(/Mật khẩu ban đầu/i), {
      target: { value: "Secret123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Tạo tài khoản$/i }));
    expect(await screen.findByText(/Đã tạo tài khoản "Đỗ Gia Bảo"/i)).toBeInTheDocument();
    expect(createUserSpy).toHaveBeenCalledTimes(1);
    unmountUsers();

    const { unmount: unmountCourses } = renderWithQuery(<AdminCoursesPage />);
    expect(await screen.findByText(/IELTS Academic 6\.5 — Khóa K12/i)).toBeInTheDocument();
    unmountCourses();

    const { unmount: unmountAudit } = renderWithQuery(<AdminAuditPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Hoàn tác phạt/i }));
    fireEvent.change(await screen.findByLabelText(/Lý do hoàn tác bắt buộc/i), {
      target: { value: "Ngắn" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận hoàn tác phạt/i }));
    expect(await screen.findByText(/tối thiểu 10 ký tự/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Lý do hoàn tác bắt buộc/i), {
      target: { value: "Xác nhận sự cố mất điện diện rộng tại khu vực học viên." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận hoàn tác phạt/i }));
    expect(await screen.findByText(/Đã hoàn tác điểm phạt/i)).toBeInTheDocument();
    expect(reverseSpy).toHaveBeenCalledWith("pen-01", {
      reason: "Xác nhận sự cố mất điện diện rộng tại khu vực học viên.",
    });
    unmountAudit();

    renderWithQuery(<AdminSettingsPage />);
    expect(await screen.findByText(/Hoạt động \(OK\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Sẵn sàng \(READY\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Từ 70% trở lên/i)).toBeInTheDocument();

    createUserSpy.mockRestore();
    reverseSpy.mockRestore();
  });
});
