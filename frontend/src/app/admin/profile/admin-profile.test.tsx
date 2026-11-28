import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminProfilePage from "./page";
import { authApi, usersApi } from "@/lib/api/endpoints";

// Mock useAuth
const mockUser = {
  id: "6afb53808dd7fafc86f17a12",
  fullName: "Administrator",
  email: "admin@ielts-lms.com",
  roles: ["admin" as const],
  status: "active" as const,
  phone: "0901234567",
  timezone: "Asia/Ho_Chi_Minh",
  createdAt: "2026-11-17T01:00:00.000Z",
  updatedAt: "2026-11-17T01:00:00.000Z",
};

const mockRefreshUser = vi.fn().mockResolvedValue(mockUser);
const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: mockUser,
    refreshUser: mockRefreshUser,
    logout: mockLogout,
    status: "authenticated",
  }),
}));

vi.mock("@/lib/api/endpoints", () => ({
  usersApi: {
    updateOwnProfile: vi.fn(),
  },
  authApi: {
    changeEmail: vi.fn(),
    changePassword: vi.fn(),
  },
}));

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminProfilePage />
    </QueryClientProvider>,
  );
}

describe("AdminProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders personal account information and metadata correctly", () => {
    renderComponent();

    expect(screen.getByRole("heading", { name: "Hồ sơ Quản trị viên" })).toBeInTheDocument();
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getAllByText("admin@ielts-lms.com")[0]).toBeInTheDocument();
    expect(screen.getByText("0901234567")).toBeInTheDocument();
    expect(screen.getByText("Quản trị viên")).toBeInTheDocument();
  });

  it("submits basic profile updates via usersApi.updateOwnProfile", async () => {
    vi.mocked(usersApi.updateOwnProfile).mockResolvedValueOnce({
      ...mockUser,
      fullName: "Super Admin Updated",
      phone: "0988776655",
    });

    renderComponent();

    const nameInput = screen.getByLabelText(/Họ và tên/i);
    const phoneInput = screen.getByLabelText(/Số điện thoại/i);
    const saveButton = screen.getByRole("button", { name: /Lưu thay đổi/i });

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Super Admin Updated");
    await userEvent.clear(phoneInput);
    await userEvent.type(phoneInput, "0988776655");
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(usersApi.updateOwnProfile).toHaveBeenCalledWith({
        fullName: "Super Admin Updated",
        phone: "0988776655",
      });
      expect(mockRefreshUser).toHaveBeenCalled();
      expect(screen.getByText(/Cập nhật thông tin hồ sơ thành công!/i)).toBeInTheDocument();
    });
  });

  it("submits email change request with password confirmation", async () => {
    vi.mocked(authApi.changeEmail).mockResolvedValueOnce({
      success: true,
      message: "Đã đổi địa chỉ email đăng nhập thành công!",
      user: { ...mockUser, email: "newadmin@ielts-lms.com" },
    });

    renderComponent();

    const newEmailInput = screen.getByLabelText(/Email đăng nhập mới/i);
    const passwordInput = screen.getByLabelText(/Mật khẩu xác nhận thay đổi email/i);
    const changeEmailButton = screen.getByRole("button", { name: /Cập nhật Email/i });

    await userEvent.type(newEmailInput, "newadmin@ielts-lms.com");
    await userEvent.type(passwordInput, "Admin@2026!Secure");
    await userEvent.click(changeEmailButton);

    await waitFor(() => {
      expect(authApi.changeEmail).toHaveBeenCalledWith({
        newEmail: "newadmin@ielts-lms.com",
        currentPassword: "Admin@2026!Secure",
      });
      expect(mockRefreshUser).toHaveBeenCalled();
      expect(screen.getByText(/Đã đổi địa chỉ email đăng nhập thành công!/i)).toBeInTheDocument();
    });
  });

  it("rejects password change when new password and confirm password do not match", async () => {
    renderComponent();

    const currentPassInput = screen.getByLabelText(/Mật khẩu đăng nhập hiện tại/i);
    const newPassInput = screen.getByLabelText(/^Mật khẩu mới/i);
    const confirmPassInput = screen.getByLabelText(/^Xác nhận mật khẩu mới/i);
    const submitBtn = screen.getByRole("button", { name: /Xác nhận đổi mật khẩu/i });

    await userEvent.type(currentPassInput, "Admin@2026!Secure");
    await userEvent.type(newPassInput, "NewPassword@2026!");
    await userEvent.type(confirmPassInput, "MismatchPassword@2026!");
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Mật khẩu xác nhận không khớp.")).toBeInTheDocument();
      expect(authApi.changePassword).not.toHaveBeenCalled();
    });
  });

  it("submits valid password change via authApi.changePassword and triggers logout", async () => {
    vi.useFakeTimers();
    vi.mocked(authApi.changePassword).mockResolvedValueOnce({
      success: true,
      message: "Đổi mật khẩu thành công.",
    });

    renderComponent();

    const currentPassInput = screen.getByLabelText(/Mật khẩu đăng nhập hiện tại/i);
    const newPassInput = screen.getByLabelText(/^Mật khẩu mới/i);
    const confirmPassInput = screen.getByLabelText(/^Xác nhận mật khẩu mới/i);
    const submitBtn = screen.getByRole("button", { name: /Xác nhận đổi mật khẩu/i });

    fireEvent.change(currentPassInput, { target: { value: "Admin@2026!Secure" } });
    fireEvent.change(newPassInput, { target: { value: "NewPassword@2026!Strong" } });
    fireEvent.change(confirmPassInput, { target: { value: "NewPassword@2026!Strong" } });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => {
      expect(authApi.changePassword).toHaveBeenCalledWith({
        currentPassword: "Admin@2026!Secure",
        newPassword: "NewPassword@2026!Strong",
      });
    });

    vi.advanceTimersByTime(2500);
    expect(mockLogout).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
