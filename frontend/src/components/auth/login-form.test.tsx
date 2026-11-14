import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/error";
import { authApi } from "@/lib/api/endpoints";
import type { AuthContextValue } from "./auth-provider";
import { LoginForm } from "./login-form";

const mockReplace = vi.fn();
let mockNextQuery: string | null = null;
const mockLogin = vi.fn();

let mockAuthState: AuthContextValue = {
  status: "unauthenticated",
  user: null,
  login: mockLogin,
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "next" ? mockNextQuery : null),
  }),
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => mockAuthState,
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockLogin.mockReset();
    mockNextQuery = null;
    mockAuthState = {
      status: "unauthenticated",
      user: null,
      login: mockLogin,
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };
  });

  it("renders accessible autofill attributes and toggles password visibility cleanly", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/Email đăng nhập/i);
    const passwordInput = screen.getByLabelText(/^Mật khẩu/i);

    expect(emailInput).toHaveAttribute("autocomplete", "username");
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveAttribute("spellcheck", "false");
    expect(emailInput).toHaveAttribute("aria-invalid", "false");

    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggleBtn = screen.getByRole("button", { name: "Hiện mật khẩu" });
    expect(toggleBtn).toHaveAttribute("aria-pressed", "false");

    await user.click(toggleBtn);
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Ẩn mật khẩu" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("validates email after blur and links error into aria-describedby only when invalid", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/Email đăng nhập/i);
    expect(emailInput).toHaveAttribute("aria-describedby", "email-hint");

    await user.type(emailInput, "khong-hop-le");
    // Error stays hidden while typing before blur
    expect(screen.queryByText(/Email chưa đúng định dạng/i)).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText(/Email chưa đúng định dạng/i)).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(emailInput).toHaveAttribute("aria-describedby", "email-hint email-error");
  });

  it("displays accessible alert feedback on 401 and 429 login errors", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(
      new ApiError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Bad credentials",
        requestId: "req-401",
      }),
    );

    render(<LoginForm />);

    await user.type(screen.getByLabelText(/Email đăng nhập/i), "student@ielts.vn");
    await user.type(screen.getByLabelText(/^Mật khẩu/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    const alert401 = await screen.findByRole("alert");
    expect(alert401).toHaveTextContent("Email hoặc mật khẩu không đúng");
    expect(alert401).toHaveTextContent("Mã tra cứu: req-401");

    mockLogin.mockRejectedValueOnce(
      new ApiError({
        statusCode: 429,
        code: "TOO_MANY_REQUESTS",
        message: "Rate limited",
        requestId: "req-429",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    const alert429 = await screen.findByRole("alert");
    expect(alert429).toHaveTextContent("quá nhiều yêu cầu");
  });

  it("redirects teacher after successful login and respects safe next target", async () => {
    const user = userEvent.setup();
    mockNextQuery = "/teacher/courses/crs-01";
    mockLogin.mockResolvedValueOnce({
      id: "tch-01",
      email: "teacher@ielts.vn",
      fullName: "Lê Mạnh Hùng",
      roles: ["teacher"],
      status: "active",
      timezone: "Asia/Ho_Chi_Minh",
    });

    render(<LoginForm />);

    await user.type(screen.getByLabelText(/Email đăng nhập/i), "teacher@ielts.vn");
    await user.type(screen.getByLabelText(/^Mật khẩu/i), "secret123");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/teacher/courses/crs-01");
    });
  });

  it("supports switching to forgot password view and calling forgotPassword endpoint", async () => {
    const user = userEvent.setup();
    const forgotSpy = vi.spyOn(authApi, "forgotPassword").mockResolvedValueOnce({ ok: true });

    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Quên mật khẩu?" }));

    expect(screen.getByRole("heading", { name: "Khôi phục mật khẩu" })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Email tài khoản/i), "student@ielts.vn");
    await user.click(
      screen.getByRole("button", { name: "Gửi yêu cầu đặt lại mật khẩu" }),
    );

    await waitFor(() => {
      expect(forgotSpy).toHaveBeenCalledWith({ email: "student@ielts.vn" });
    });
    expect(await screen.findByRole("status")).toHaveTextContent("hướng dẫn đặt lại mật khẩu");
    forgotSpy.mockRestore();
  });
});

