"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Calendar,
  ClipboardCheck,
  Clock,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Languages,
  LogOut,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { AppShell, type NavItem } from "@/components/layout/app-shell";
import { useDocumentTitle } from "@/components/layout/use-document-title";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getDefaultHomeForRole,
  getDocumentTitleForPathname,
  getPortalNavItems,
  getRoleLabelVi,
  type PortalRole,
} from "@/lib/auth/roles";
import { cn } from "@/lib/utils/cn";

function renderNavIcon(href: string): ReactNode {
  if (href.endsWith("/dashboard")) return <LayoutDashboard className="h-4 w-4" />;
  if (href.endsWith("/calendar")) return <Calendar className="h-4 w-4" />;
  if (href.endsWith("/courses")) return <BookOpen className="h-4 w-4" />;
  if (href.endsWith("/assignments")) return <ClipboardCheck className="h-4 w-4" />;
  if (href.endsWith("/practice")) return <BookOpen className="h-4 w-4" />;
  if (href.endsWith("/extensions")) return <Clock className="h-4 w-4" />;
  if (href.endsWith("/penalties")) return <AlertTriangle className="h-4 w-4" />;
  if (href.endsWith("/notifications")) return <Bell className="h-4 w-4" />;
  if (href.endsWith("/profile")) return <UserCheck className="h-4 w-4" />;
  if (href.endsWith("/students")) return <GraduationCap className="h-4 w-4" />;
  if (href.endsWith("/question-bank")) return <FileText className="h-4 w-4" />;
  if (href.endsWith("/exercises")) return <FileText className="h-4 w-4" />;
  if (href.endsWith("/translations")) return <Languages className="h-4 w-4" />;
  if (href.endsWith("/users")) return <Users className="h-4 w-4" />;
  if (href.endsWith("/audit")) return <ShieldCheck className="h-4 w-4" />;
  if (href.endsWith("/settings")) return <Settings className="h-4 w-4" />;
  return <LayoutDashboard className="h-4 w-4" />;
}

export interface PortalShellProps {
  portal: PortalRole;
  unreadNotificationsCount?: number;
  children: ReactNode;
}

export function PortalShell({
  portal,
  unreadNotificationsCount = 0,
  children,
}: PortalShellProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  useDocumentTitle(getDocumentTitleForPathname(pathname));

  const navItems: NavItem[] = getPortalNavItems(portal).map((entry) => ({
    href: entry.href,
    label: entry.label,
    icon: renderNavIcon(entry.href),
  }));

  const userRoles = user?.roles ?? [portal];

  return (
    <>
      <AppShell
        roleLabel={`Cổng ${getRoleLabelVi(portal)}`}
        userName={user?.fullName}
        navItems={navItems}
        unreadNotificationsCount={unreadNotificationsCount}
        notificationsHref={portal === "student" ? "/student/notifications" : undefined}
        showFooter={portal !== "admin"}
        headerActions={
          <div className="flex items-center gap-2">
            {userRoles.length > 1 ? (
              <nav aria-label="Chuyển cổng vai trò" className="hidden items-center gap-1 sm:flex">
                {userRoles.map((role) => {
                  const isCurrent = role === portal;
                  return (
                    <Link
                      key={role}
                      href={getDefaultHomeForRole(role)}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors",
                        isCurrent
                          ? "border-blue-700 bg-blue-700 text-white focus-visible:outline-slate-950"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                      )}
                    >
                      {getRoleLabelVi(role)}
                    </Link>
                  );
                })}
              </nav>
            ) : null}

            <button
              type="button"
              onClick={() => setLogoutConfirmOpen(true)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" aria-hidden={true} />
              <span className="sr-only sm:not-sr-only">Đăng xuất</span>
            </button>
          </div>
        }
      >
        {userRoles.length > 1 ? (
          <nav
            aria-label="Chuyển cổng vai trò di động"
            className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 sm:hidden"
          >
            <span className="text-xs font-semibold text-slate-600">Chuyển vai trò:</span>
            {userRoles.map((role) => {
              const isCurrent = role === portal;
              return (
                <Link
                  key={role}
                  href={getDefaultHomeForRole(role)}
                  aria-current={isCurrent ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-md border px-2.5 text-xs font-semibold",
                    isCurrent
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-300 bg-white text-slate-700",
                  )}
                >
                  {getRoleLabelVi(role)}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {children}
      </AppShell>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Đăng xuất khỏi hệ thống?"
        description="Phiên làm việc hiện tại sẽ bị đóng và thông tin truy cập cục bộ sẽ được xóa."
        confirmLabel="Đăng xuất"
        cancelLabel="Ở lại"
        lightDismiss={true}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          void logout();
        }}
        onClose={() => setLogoutConfirmOpen(false)}
      />
    </>
  );
}

