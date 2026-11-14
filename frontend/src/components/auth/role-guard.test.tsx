import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContextValue } from "./auth-provider";
import { RoleGuard } from "./role-guard";
import { PortalShell } from "@/components/layout/portal-shell";

const mockReplace = vi.fn();
let mockPathname = "/teacher/exercises";
let mockAuthState: AuthContextValue = {
  status: "unauthenticated",
  user: null,
  login: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => mockAuthState,
}));

describe("RoleGuard & PortalShell", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPathname = "/teacher/exercises";
  });

  it("blocks unauthenticated sessions without mounting protected children", () => {
    const childSpy = vi.fn();
    function Protected() {
      childSpy();
      return <div>Secret Teacher Content</div>;
    }

    mockAuthState = {
      status: "unauthenticated",
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <RoleGuard allowedRoles={["teacher"]}>
        <Protected />
      </RoleGuard>,
    );

    expect(childSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Secret Teacher Content")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(
      "/login?next=%2Fteacher%2Fexercises",
    );
  });

  it("blocks mismatched roles and redirects to /unauthorized before mounting children", () => {
    const childSpy = vi.fn();
    function Protected() {
      childSpy();
      return <div>Teacher Only</div>;
    }

    mockAuthState = {
      status: "authenticated",
      user: {
        id: "stu-01",
        email: "student@ielts.vn",
        fullName: "Khổng Phú Cường",
        roles: ["student"],
        status: "active",
        timezone: "Asia/Ho_Chi_Minh",
      },
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <RoleGuard allowedRoles={["teacher"]}>
        <Protected />
      </RoleGuard>,
    );

    expect(childSpy).not.toHaveBeenCalled();
    expect(screen.queryByText("Teacher Only")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/unauthorized");
  });

  it("blocks suspended accounts even if role matches", () => {
    mockAuthState = {
      status: "authenticated",
      user: {
        id: "tch-01",
        email: "teacher@ielts.vn",
        fullName: "Lê Mạnh Hùng",
        roles: ["teacher"],
        status: "suspended",
        timezone: "Asia/Ho_Chi_Minh",
      },
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <RoleGuard allowedRoles={["teacher"]}>
        <div>Teacher Only</div>
      </RoleGuard>,
    );

    expect(screen.queryByText("Teacher Only")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith("/unauthorized");
  });

  it("allows multi-role users into authorized portal and renders role switcher links", () => {
    mockPathname = "/admin/users";
    mockAuthState = {
      status: "authenticated",
      user: {
        id: "adm-01",
        email: "admin@ielts.vn",
        fullName: "Huỳnh Khôi",
        roles: ["admin", "teacher"],
        status: "active",
        timezone: "Asia/Ho_Chi_Minh",
      },
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <RoleGuard allowedRoles={["admin"]}>
        <PortalShell portal="admin">
          <h1>Quản lý tài khoản</h1>
        </PortalShell>
      </RoleGuard>,
    );

    expect(screen.getByRole("heading", { name: "Quản lý tài khoản" })).toBeInTheDocument();
    const switchNav = screen.getByRole("navigation", { name: "Chuyển cổng vai trò" });
    expect(switchNav).toHaveTextContent("Quản trị viên");
    expect(switchNav).toHaveTextContent("Giảng viên");
    expect(switchNav).not.toHaveTextContent("Học viên");
  });

  it("skips ?next= login redirect while an explicit logout transition is active", () => {
    mockPathname = "/teacher/translations";
    mockAuthState = {
      status: "unauthenticated",
      user: null,
      isLoggingOut: true,
      login: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    };

    render(
      <RoleGuard allowedRoles={["teacher"]}>
        <div>Teacher Translations</div>
      </RoleGuard>,
    );

    expect(screen.queryByText("Teacher Translations")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

