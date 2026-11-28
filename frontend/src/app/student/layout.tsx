"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import { StudentPortalShell } from "@/components/student/student-portal-shell";
import { useStudyTimeHeartbeat } from "@/hooks/use-study-time-heartbeat";

function StudentStudyHeartbeatMount() {
  const { status, user } = useAuth();
  const enabled =
    status === "authenticated" && Boolean(user?.roles.includes("student"));
  useStudyTimeHeartbeat(enabled);
  return null;
}

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["student"]}>
      <StudentStudyHeartbeatMount />
      <StudentPortalShell>{children}</StudentPortalShell>
    </RoleGuard>
  );
}
