"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { Header } from "./header";
import { Sidebar, SidebarNav, type NavItem } from "./sidebar";
import { Footer } from "./footer";

export type { NavItem };

export interface AppShellProps {
  brandLabel?: string;
  roleLabel?: string;
  userName?: string;
  navItems: readonly NavItem[];
  unreadNotificationsCount?: number;
  notificationsHref?: string;
  headerActions?: ReactNode;
  showFooter?: boolean;
  children: ReactNode;
}

/**
 * Global App Shell / Dashboard Layout adhering to zero-layout-shift architecture:
 * 1. Root: `h-screen w-screen overflow-hidden flex flex-col` (browser never produces outer scrollbar).
 * 2. Stationary Header: `shrink-0 h-16 w-full z-20 border-b bg-white` (never scrolls out of view).
 * 3. Body Wrapper: `flex flex-1 min-h-0 w-full max-w-none px-0 overflow-hidden`.
 * 4. Desktop Sidebar: Flush at `left: 0`, standardized `w-64 min-w-[16rem] max-w-[16rem] shrink-0 h-full overflow-y-auto`.
 * 5. Single Scrollable Container: `<main id="main-content">` (`flex-1 h-full overflow-y-auto flex flex-col min-w-0`).
 * 6. Responsive Mobile Drawer: Native `<dialog>` slide-over with smooth backdrop fade.
 * 7. Contextual Footer: Mounted inside `<main>` via `mt-auto` (conditionally shown for non-admin portals).
 */
export function AppShell({
  brandLabel = "IELTS Academic LMS",
  roleLabel = "Học tập",
  userName,
  navItems,
  unreadNotificationsCount = 0,
  notificationsHref,
  headerActions,
  showFooter = true,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const drawerTitleId = useId();

  // Close mobile drawer on route change without triggering React 19 Compiler ESLint warnings
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    if (drawerOpen) {
      setDrawerOpen(false);
    }
  }

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;

    if (drawerOpen) {
      if (!drawer.open) {
        drawer.showModal();
      }
    } else if (drawer.open) {
      drawer.close();
    }
  }, [drawerOpen]);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === drawerRef.current) {
      setDrawerOpen(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
      {/* Accessible skip link */}
      <a href="#main-content" className="skip-link">
        Bỏ qua đến nội dung chính
      </a>

      {/* Stationary Top Header */}
      <Header
        brandLabel={brandLabel}
        roleLabel={roleLabel}
        userName={userName}
        unreadNotificationsCount={unreadNotificationsCount}
        notificationsHref={notificationsHref}
        headerActions={headerActions}
        onOpenDrawer={() => setDrawerOpen(true)}
        drawerOpen={drawerOpen}
        drawerId={drawerId}
      />

      {/* Main Body Wrapper (flex-1 min-h-0 overflow-hidden w-full max-w-none) */}
      <div className="flex flex-1 min-h-0 w-full max-w-none overflow-hidden px-0">
        {/* Desktop Fixed Flush-Left Sidebar */}
        <Sidebar navItems={navItems} pathname={pathname} />

        {/* Exclusive vertical scroll area */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col h-full min-w-0 overflow-y-auto"
        >
          {/* Inner content with smooth page enter animation */}
          <div key={pathname} className="lms-page-enter flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </div>

          {/* Contextual Footer (rendered inside main scroller via mt-auto) */}
          {showFooter ? <Footer /> : null}
        </main>
      </div>

      {/* Responsive Slide-Over Mobile Drawer */}
      <dialog
        id={drawerId}
        ref={drawerRef}
        className="lms-drawer lg:hidden"
        aria-labelledby={drawerTitleId}
        onClose={() => setDrawerOpen(false)}
        onClick={handleBackdropClick}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
            <h2 id={drawerTitleId} className="text-base font-bold text-slate-950">
              {brandLabel}
            </h2>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Đóng menu điều hướng"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100"
            >
              <X className="h-5 w-5" aria-hidden={true} />
            </button>
          </div>
          <nav aria-label="Điều hướng di động" className="flex-1 overflow-y-auto">
            <SidebarNav
              navItems={navItems}
              pathname={pathname}
              onNavigate={() => setDrawerOpen(false)}
            />
          </nav>
        </div>
      </dialog>
    </div>
  );
}

/** Export DashboardLayout as alias of AppShell */
export const DashboardLayout = AppShell;
