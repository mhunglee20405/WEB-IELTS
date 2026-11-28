import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersPage from "@/app/admin/users/page";
import SetupPage from "@/app/setup/page";
import StudentAssignmentTranslationPage from "@/app/student/assignments/[studentAssignmentId]/translation/page";
import StudentReadingTranslationWorkspacePage from "@/app/student/reading/[testId]/translate/[passageId]/page";
import TeacherEditCoursePage from "@/app/teacher/courses/[id]/page";
import TeacherNewCoursePage from "@/app/teacher/courses/new/page";
import TeacherTranslationsPage from "@/app/teacher/translations/page";
import {
  coursesApi,
  readingTranslationsApi,
  studentAssignmentsApi,
  systemApi,
  usersApi,
} from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/error";
import { resetMockStore } from "@/lib/api/mocks/router";
import { examKeys, teacherKeys } from "@/lib/api/query-keys";
import type { Course, ReadingTranslationDetail } from "@/lib/api/types";

let mockRouteParams: Record<string, string> = {
  id: "crs-02",
  studentAssignmentId: "sa-02",
  testId: "exam-read-full-01",
  passageId: "part-r1-p2",
};
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => mockRouteParams,
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/teacher/courses/crs-02",
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

let mockUserRoles: Array<"student" | "teacher" | "admin"> = ["teacher"];

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: mockUserRoles.includes("student") ? "stu-01" : "tch-01",
      email: mockUserRoles.includes("student") ? "student@ielts.vn" : "teacher@ielts.vn",
      fullName: mockUserRoles.includes("student") ? "Khổng Phú Cường" : "Lê Mạnh Hùng",
      roles: mockUserRoles,
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
  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

describe("Task 6 Frontend Remediation Regression Suite", () => {
  beforeEach(() => {
    resetMockStore();
    mockRouteParams = {
      id: "crs-02",
      studentAssignmentId: "sa-02",
      testId: "exam-read-full-01",
      passageId: "part-r1-p2",
    };
    mockUserRoles = ["teacher"];
    mockPush.mockReset();
  });

  it("omits teacherId on TeacherEditCoursePage update and preserves 1:1 format & dates", async () => {
    mockRouteParams = { id: "crs-02" };
    const updateSpy = vi.spyOn(coursesApi, "update");

    renderWithQuery(<TeacherEditCoursePage />);

    const titleInput = (await screen.findByLabelText(/Tên khóa học/i)) as HTMLInputElement;
    expect((screen.getByLabelText(/Hình thức lớp học/i) as HTMLSelectElement).value).toBe("1:1");
    expect((screen.getByLabelText(/Ngày khai giảng/i) as HTMLInputElement).value).toBe("2026-10-15");

    fireEvent.change(titleInput, { target: { value: "Coaching 1:1 Reading — Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /Lưu thay đổi/i }));

    expect(
      await screen.findByText(/Đã cập nhật thông tin khóa học thành công/i),
    ).toBeInTheDocument();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, sentPayload] = updateSpy.mock.calls[0]!;
    expect("teacherId" in sentPayload).toBe(false);
    expect(sentPayload.courseType).toBe("1:1");
    expect(sentPayload.startDate).toBe("2026-10-15");

    updateSpy.mockRestore();
  });

  it("redirects TeacherNewCoursePage to real course id after creating a course", async () => {
    const createSpy = vi.spyOn(coursesApi, "create").mockResolvedValueOnce({
      id: "crs-real-id-999",
      code: "IELTS-REAL-999",
      title: "Real Course",
      courseType: "1:1",
      startBand: 5.0,
      targetBand: 6.5,
      teacherId: "tch-01",
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    } as Course);

    renderWithQuery(<TeacherNewCoursePage />);

    fireEvent.change(screen.getByLabelText(/Mã khóa học/i), {
      target: { value: "IELTS-REAL-999" },
    });
    fireEvent.change(screen.getByLabelText(/Tên khóa học/i), {
      target: { value: "Real Course" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Tạo khóa học$/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/teacher/courses/crs-real-id-999/students");
    });

    createSpy.mockRestore();
  });

  it("freezes 'reviewed' translations on StudentAssignmentTranslationPage", async () => {
    mockUserRoles = ["student"];
    mockRouteParams = { studentAssignmentId: "sa-02" };
    const getTransSpy = vi
      .spyOn(studentAssignmentsApi, "getTranslation")
      .mockResolvedValueOnce({
        translationId: "tr-reviewed-01",
        studentAssignmentId: "sa-02",
        passageTitle: "Campus Library Orientation",
        passageHtml: "<p>Sample passage.</p>",
        draftText: "Bản dịch đã được giảng viên chấm hoàn tất.",
        status: "reviewed",
        teacherFeedback: "Rất chính xác và tự nhiên.",
        reviewedAt: "2026-11-18T10:00:00.000Z",
      });

    renderWithQuery(<StudentAssignmentTranslationPage />);

    const textarea = await screen.findByLabelText(/Bản dịch tiếng Việt của bạn/i);
    expect(textarea).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: /Lưu bản nháp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nộp bản dịch/i })).not.toBeInTheDocument();
    expect(screen.getByText(/được giảng viên duyệt hoàn tất/i)).toBeInTheDocument();

    getTransSpy.mockRestore();
  });

  it("locks StudentReadingTranslationWorkspacePage when status is LOCKED or unlocked === false and handles submit error without unhandled rejection", async () => {
    mockUserRoles = ["student"];
    mockRouteParams = { testId: "exam-read-full-01", passageId: "part-r1-p2" };

    const getPassageSpy = vi
      .spyOn(readingTranslationsApi, "getPassage")
      .mockResolvedValueOnce({
        id: "mtr-locked-1",
        testId: "exam-read-full-01",
        testTitle: "IELTS Reading Full Test 01",
        passageId: "part-r1-p2",
        partNumber: 2,
        passageTitle: "Wild Pollinator Corridors",
        passageHtml: "<p>Passage 2</p>",
        status: "LOCKED",
        unlocked: false,
        revision: 1,
        textVi: "",
      } as ReadingTranslationDetail);

    const { unmount } = renderWithQuery(<StudentReadingTranslationWorkspacePage />);

    expect(
      await screen.findByText(/Passage này chưa được mở khóa luyện dịch/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Nội dung dịch tiếng Việt/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lưu nháp/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("translation-submit-btn")).not.toBeInTheDocument();
    unmount();

    // Also verify unlocked DRAFT handles submit error gracefully via mutate() (no unhandled rejection)
    getPassageSpy.mockResolvedValueOnce({
      id: "mtr-draft-1",
      testId: "exam-read-full-01",
      testTitle: "IELTS Reading Full Test 01",
      passageId: "part-r1-p1",
      partNumber: 1,
      passageTitle: "Vertical Farming",
      passageHtml: "<p>Passage 1</p>",
      status: "DRAFT",
      unlocked: true,
      revision: 1,
      textVi: "Bản dịch thử nghiệm có độ dài hơn mười ký tự.",
    } as ReadingTranslationDetail);

    const submitSpy = vi
      .spyOn(readingTranslationsApi, "submit")
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          code: "ATTEMPT_ALREADY_SUBMITTED",
          message: "Bản dịch đã được nộp trước đó.",
        }),
      );

    mockRouteParams = { testId: "exam-read-full-01", passageId: "part-r1-p1" };
    renderWithQuery(<StudentReadingTranslationWorkspacePage />);

    const submitBtn = await screen.findByTestId("translation-submit-btn");
    fireEvent.click(submitBtn);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Lượt làm bài này đã được nộp trước đó|Bản dịch đã được nộp/i,
    );

    getPassageSpy.mockRestore();
    submitSpy.mockRestore();
  });

  it("uses single-role radio selection in AdminUsersPage Create & Edit forms (never silently drops 2nd role)", async () => {
    mockUserRoles = ["admin"];
    const createSpy = vi.spyOn(usersApi, "create");
    const updateSpy = vi.spyOn(usersApi, "update");

    renderWithQuery(<AdminUsersPage />);
    expect(await screen.findByText("Khổng Phú Cường")).toBeInTheDocument();

    // Create form uses radio buttons, switching to Giảng viên sends only ["teacher"]
    fireEvent.click(screen.getByRole("button", { name: /Tạo tài khoản mới/i }));
    fireEvent.change(await screen.findByLabelText(/Họ và tên/i), {
      target: { value: "Nguyễn Thị Lan" },
    });
    fireEvent.change(screen.getByLabelText(/Email đăng nhập/i), {
      target: { value: "lannguyen@ielts.vn" },
    });
    fireEvent.change(screen.getByLabelText(/Mật khẩu ban đầu/i), {
      target: { value: "Secret123!" },
    });

    const createTeacherRadio = screen.getByRole("radio", { name: /Giảng viên/i });
    const createStudentRadio = screen.getByRole("radio", { name: /Học viên/i });
    expect(createStudentRadio).toBeChecked();
    fireEvent.click(createTeacherRadio);
    expect(createTeacherRadio).toBeChecked();
    expect(createStudentRadio).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /^Tạo tài khoản$/i }));
    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
    expect(createSpy.mock.calls[0]?.[0]).toMatchObject({
      email: "lannguyen@ielts.vn",
      roles: ["teacher"],
    });

    // Edit form uses radio buttons, switching role replaces instead of keeping stale roles[0]
    const editButtons = await screen.findAllByRole("button", {
      name: /Sửa quyền \/ Trạng thái/i,
    });
    fireEvent.click(editButtons[editButtons.length - 1]!);

    const editTeacherRadio = await screen.findByRole("radio", { name: /Giảng viên/i });
    fireEvent.click(editTeacherRadio);
    expect(editTeacherRadio).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Lưu thay đổi/i }));
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          roles: ["teacher"],
        }),
      );
    });

    createSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it("invalidates ['system', 'setup-status'] cache on SetupPage bootstrapAdmin success", async () => {
    const statusSpy = vi
      .spyOn(systemApi, "getSetupStatus")
      .mockResolvedValueOnce({ isInitialized: false, adminCount: 0, totalUsers: 0 })
      .mockResolvedValue({ isInitialized: true, adminCount: 1, totalUsers: 1 });
    const bootstrapSpy = vi.spyOn(systemApi, "bootstrapAdmin").mockResolvedValueOnce({
      success: true,
      message: "Khởi tạo Quản trị viên thành công!",
      user: {
        id: "adm-new",
        email: "admin@domain.com",
        fullName: "Admin Mới",
        role: "admin",
        status: "active",
      },
    });

    const { client } = renderWithQuery(<SetupPage />);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    fireEvent.change(await screen.findByLabelText(/Họ và tên Quản trị viên/i), {
      target: { value: "Admin Mới" },
    });
    fireEvent.change(screen.getByLabelText(/Địa chỉ Email Quản trị viên/i), {
      target: { value: "admin@domain.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Mật khẩu quản trị/i), {
      target: { value: "Admin@2026!Secure" },
    });
    fireEvent.change(screen.getByLabelText(/^Xác nhận mật khẩu/i), {
      target: { value: "Admin@2026!Secure" },
    });
    fireEvent.change(screen.getByLabelText(/Mã thiết lập/i), {
      target: { value: "setup-secret-token" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Khởi tạo Quản trị viên/i }));

    expect(await screen.findByText(/Khởi tạo Thành công!/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["system", "setup-status"] });
    });

    statusSpy.mockRestore();
    bootstrapSpy.mockRestore();
  });

  it("invalidates teacherKeys.dashboard when PassageTranslationReviewPane saves a review", async () => {
    mockUserRoles = ["teacher"];
    const { client } = renderWithQuery(<TeacherTranslationsPage />);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(await screen.findByTestId("switch-v2-passage-translations"));
    expect(await screen.findByText(/Nguyễn Minh Anh/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nhận xét cho học viên/i), {
      target: { value: "Dịch rất sát nghĩa học thuật." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lưu nhận xét Passage/i }));

    expect(await screen.findByText(/Đã chấm hoàn tất Passage 1/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: examKeys.teacherTranslationsRoot,
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: teacherKeys.dashboard,
      });
    });
  });
});
