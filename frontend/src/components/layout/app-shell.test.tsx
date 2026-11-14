import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import { Header } from "./header";
import { SidebarNav, type NavItem } from "./sidebar";
import { Footer } from "./footer";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/teacher/dashboard",
}));

describe("LMS Layout Architecture & Responsive App Shell", () => {
  const sampleNavItems: NavItem[] = [
    { href: "/teacher/dashboard", label: "Tổng quan" },
    { href: "/teacher/courses", label: "Khóa học" },
  ];

  it("renders stationary Header, desktop Sidebar, single main container, and Footer by default", () => {
    render(
      <AppShell
        brandLabel="IELTS Academic LMS"
        roleLabel="Cổng Giảng viên"
        userName="Thầy Hoàng Nam"
        navItems={sampleNavItems}
        showFooter={true}
      >
        <div data-testid="page-content">Nội dung trang</div>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByText("© 2026 IELTS Academic LMS. All rights reserved."),
    ).toBeInTheDocument();
  });

  it("omits Footer completely when showFooter is false (e.g. Admin portal)", () => {
    render(
      <AppShell
        brandLabel="IELTS Academic LMS"
        roleLabel="Cổng Quản trị"
        navItems={sampleNavItems}
        showFooter={false}
      >
        <div>Trang quản trị</div>
      </AppShell>,
    );

    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });

  it("renders Header with hamburger button that triggers onOpenDrawer", () => {
    const onOpenDrawer = vi.fn();
    render(
      <Header
        brandLabel="IELTS Academic LMS"
        roleLabel="Học tập"
        onOpenDrawer={onOpenDrawer}
      />,
    );

    const hamburger = screen.getByRole("button", { name: "Mở menu điều hướng" });
    expect(hamburger).toBeInTheDocument();
    fireEvent.click(hamburger);
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("renders SidebarNav where active and inactive items share identical font-weight and dimensions", () => {
    render(<SidebarNav navItems={sampleNavItems} pathname="/teacher/dashboard" />);

    const activeLink = screen.getByRole("link", { name: "Tổng quan" });
    const inactiveLink = screen.getByRole("link", { name: "Khóa học" });

    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(inactiveLink).not.toHaveAttribute("aria-current");

    // Both have font-medium and identical min-h-[44px] to prevent layout shifts
    expect(activeLink.className).toContain("font-medium");
    expect(inactiveLink.className).toContain("font-medium");
    expect(activeLink.className).toContain("min-h-[44px]");
    expect(inactiveLink.className).toContain("min-h-[44px]");
    // Active uses inset box-shadow accent indicator rather than shifting border
    expect(activeLink.className).toContain("shadow-[inset_3px_0_0_0_#1d4ed8]");
  });

  it("renders Footer with copyright and accessible contextual documentation links", () => {
    render(<Footer />);

    expect(
      screen.getByText("© 2026 IELTS Academic LMS. All rights reserved."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hướng dẫn sử dụng" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Hỗ trợ kỹ thuật" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Điều khoản dịch vụ" })).toBeInTheDocument();
  });
});

