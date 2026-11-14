"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { UserRole } from "@/lib/api/types";
import { canAccessRoles } from "@/lib/auth/roles";
import { useAuth } from "./auth-provider";

export interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

/**
 * Blocks unauthenticated sessions and mismatched role portals before mounting
 * protected feature components or triggering their queries.
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const { status, user, isLoggingOut = false } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isAuthorized =
    status === "authenticated" &&
    user !== null &&
    user.status === "active" &&
    canAccessRoles(user.roles, allowedRoles);

  useEffect(() => {
    if (status === "unauthenticated") {
      if (isLoggingOut) {
        return;
      }
      const nextQuery = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${nextQuery}`);
      return;
    }

    if (status === "authenticated" && !isAuthorized) {
      router.replace("/unauthorized");
    }
  }, [status, isAuthorized, isLoggingOut, pathname, router]);

  if (status === "loading" || !isAuthorized) {
    return (
      <main
        id="main-content"
        aria-busy="true"
        className="flex min-h-screen items-center justify-center bg-slate-50 p-6"
      >
        <div className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-6">
          <span className="sr-only">Đang xác thực phiên làm việc...</span>
          <div className="h-5 w-40 animate-pulse rounded bg-slate-200" aria-hidden={true} />
          <div className="h-16 w-full animate-pulse rounded-lg bg-slate-200" aria-hidden={true} />
          <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" aria-hidden={true} />
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

