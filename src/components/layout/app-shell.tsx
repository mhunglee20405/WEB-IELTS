"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Bell, BookOpen, Globe2, Menu, X } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

export interface AppShellProps {
  brandLabel?: string;
  roleLabel?: string;
  userName?: string;
  navItems: NavItem[];
  unreadNotificationsCount?: number;
  notificationsHref?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

function SidebarNav({
  navItems,
  pathname,
  onNavigate,
}: {
  navItems: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";

  return (
    <ul className="space-y-1 p-3">
      {navItems.map((item) => {
        const cleanHref = item.href.replace(/\/+$/, "") || "/";
        const isActive =
          cleanPath === cleanHref ||
          (cleanHref !== "/" && cleanPath.startsWith(`${cleanHref}/`));

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className="lms-sidebar-link"
            >
              {item.icon ? <span className="shrink-0" aria-hidden={true}>{item.icon}</span> : null}
              <span className="single-line-truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Accessible base LMS shell with:
 * - Skip link directly to `<main id="main-content">`.
 * - Single `<main>`, `<header>`, and `<nav aria-label>` landmarks.
 * - Mobile native `<dialog>` drawer via `showModal()` with `closedby="any"` + fallback.
 */
export function AppShell({
  brandLabel = "IELTS Academic LMS",
  roleLabel = "Học tập",
  userName,
  navItems,
  unreadNotificationsCount = 0,
  notificationsHref,
  headerActions,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const drawerTitleId = useId();

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) {
      return;
    }
    drawer.setAttribute("closedby", "any");

    if (drawerOpen) {
      if (!drawer.open) {
        drawer.showModal();
      }
    } else if (drawer.open) {
      drawer.close();
    }
  }, [drawerOpen]);

  const handleDrawerBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    const drawer = drawerRef.current;
    if (!drawer || "closedBy" in HTMLDialogElement.prototype || event.detail === 0) {
      return;
    }
    const rect = drawer.getBoundingClientRect();
    const clickedInside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    if (!clickedInside) {
      drawer.close();
    }
  };

  return (
    <div className="flex min-h-dvh w-full flex-col bg-slate-50 text-slate-900 lg:h-dvh lg:overflow-hidden">
      <a href="#main-content" className="skip-link">
        Bỏ qua đến nội dung chính
      </a>

      <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white lg:static">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              aria-controls={drawerId}
              aria-label="Mở menu điều hướng"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden={true} />
            </button>

            <Link
              href="/"
              className="flex items-center gap-2.5 text-slate-950 no-underline"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-700 text-white">
                <BookOpen className="h-5 w-5" aria-hidden={true} />
              </span>
              <span className="font-bold tracking-tight text-base sm:text-lg">
                {brandLabel}
              </span>
            </Link>

            <span className="hidden rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 sm:inline-flex">
              {roleLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 md:inline-flex">
              <Globe2 className="h-3.5 w-3.5 text-slate-600" aria-hidden={true} />
              <span>GMT+7 (Asia/Ho_Chi_Minh)</span>
            </span>

            {notificationsHref ? (
              <Link
                href={notificationsHref}
                aria-label={
                  unreadNotificationsCount > 0
                    ? `Thông báo, ${unreadNotificationsCount} chưa đọc`
                    : "Thông báo"
                }
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              >
                <Bell className="h-5 w-5" aria-hidden={true} />
                {unreadNotificationsCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[11px] font-bold text-white">
                    {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                  </span>
                ) : null}
              </Link>
            ) : null}

            {userName ? (
              <span className="hidden text-sm font-medium text-slate-800 sm:inline">
                {userName}
              </span>
            ) : null}

            {headerActions}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 lg:min-h-0 min-[1440px]:border-x min-[1440px]:border-slate-200">
        <aside className="lms-sidebar hidden w-[260px] min-w-[260px] max-w-[260px] shrink-0 overflow-x-hidden border-e border-slate-200 bg-white lg:block lg:h-full lg:overflow-y-auto">
          <nav aria-label="Điều hướng chính" className="min-h-full">
            <SidebarNav navItems={navItems} pathname={pathname} />
          </nav>
        </aside>

        <main
          id="main-content"
          tabIndex={-1}
          className="lms-scroll-pane min-w-0 flex-1 p-4 sm:p-6 lg:h-full lg:overflow-y-auto lg:p-8"
        >
          {children}
        </main>
      </div>

      {/* Mobile Modal Navigation Drawer */}
      <dialog
        id={drawerId}
        ref={drawerRef}
        className="lms-drawer lg:hidden"
        aria-labelledby={drawerTitleId}
        onClose={() => setDrawerOpen(false)}
        onClick={handleDrawerBackdropClick}
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
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
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

