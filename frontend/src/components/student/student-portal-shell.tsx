"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/portal-shell";
import { useDocumentTitle } from "@/components/layout/use-document-title";
import { notificationsApi } from "@/lib/api/endpoints/notifications";
import { getDocumentTitleForPathname } from "@/lib/auth/roles";
import { studentKeys } from "@/lib/api/query-keys";

export function StudentPortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFocusedExamSession = /^\/student\/exam\/[^/]+$/.test(pathname);
  useDocumentTitle(getDocumentTitleForPathname(pathname));

  const unreadQuery = useQuery({
    queryKey: studentKeys.notificationsUnreadCount,
    queryFn: () => notificationsApi.list({ read: false, page: 1, limit: 1 }),
    staleTime: 30_000,
    enabled: !isFocusedExamSession,
  });

  if (isFocusedExamSession) {
    return <>{children}</>;
  }

  const unreadCount = unreadQuery.data?.total ?? 0;

  return (
    <PortalShell portal="student" unreadNotificationsCount={unreadCount}>
      {children}
    </PortalShell>
  );
}
