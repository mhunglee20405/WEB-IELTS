"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Bell, BookOpen, Clock, Menu } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-provider";
import { formatVnHeaderClock } from "@/lib/time/vn-clock";
import { cn } from "@/lib/utils/cn";

const emptySubscribe = () => () => {};
const CLOCK_REFRESH_INTERVAL_MS = 15_000;

export interface HeaderProps {
  brandLabel?: string;
  roleLabel?: string;
  userName?: string;
  unreadNotificationsCount?: number;
  notificationsHref?: string;
  headerActions?: ReactNode;
  onOpenDrawer?: () => void;
  drawerOpen?: boolean;
  drawerId?: string;
  className?: string;
}

/**
 * Stationary top application header.
 * Locked at the top of the viewport (shrink-0 h-16 w-full z-20 border-b).
 */
export function Header({
  brandLabel = "IELTS Academic LMS",
  roleLabel,
  userName,
  unreadNotificationsCount = 0,
  notificationsHref,
  headerActions,
  onOpenDrawer,
  drawerOpen = false,
  drawerId,
  className,
}: HeaderProps) {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, CLOCK_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const formattedClock = isClient ? formatVnHeaderClock(now) : null;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-16 w-full shrink-0 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      <div className="flex h-full w-full items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Mobile hamburger + Brand logo + Role badge */}
        <div className="flex items-center gap-3">
          {onOpenDrawer ? (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-expanded={drawerOpen}
              aria-controls={drawerId}
              aria-label="Mở menu điều hướng"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Menu className="h-5 w-5" aria-hidden={true} />
            </button>
          ) : null}

          <Link
            href="/"
            className="flex items-center gap-2.5 text-slate-950 no-underline transition-opacity hover:opacity-90 dark:text-slate-100"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white dark:bg-blue-600">
              <BookOpen className="h-5 w-5" aria-hidden={true} />
            </span>
            <span className="text-base font-bold tracking-tight sm:text-lg">
              {brandLabel}
            </span>
          </Link>

          {roleLabel ? (
            <span className="hidden rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 sm:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {roleLabel}
            </span>
          ) : null}
        </div>

        {/* Right: Live VN clock + Theme toggle + Notifications + User + Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {formattedClock ? (
            <span
              data-testid="vn-live-clock"
              aria-label={`Giờ Việt Nam: ${formattedClock}`}
              className="hidden items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-700 sm:inline-flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Clock className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-300" aria-hidden={true} />
              <span>{formattedClock}</span>
            </span>
          ) : (
            <span
              aria-hidden={true}
              className="hidden h-7 w-52 animate-pulse rounded-md border border-slate-200 bg-slate-100 sm:inline-flex dark:border-slate-700 dark:bg-slate-800"
            />
          )}

          <ThemeToggle />

          {notificationsHref ? (
            <Link
              href={notificationsHref}
              aria-label={
                unreadNotificationsCount > 0
                  ? `Thông báo, ${unreadNotificationsCount} chưa đọc`
                  : "Thông báo"
              }
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
            <span className="hidden max-w-[160px] truncate text-sm font-medium text-slate-800 sm:inline dark:text-slate-200">
              {userName}
            </span>
          ) : null}

          {headerActions}
        </div>
      </div>
    </header>
  );
}

