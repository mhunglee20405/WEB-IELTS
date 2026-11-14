import type { ReactNode } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { StudentPortalShell } from "@/components/student/student-portal-shell";

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["student"]}>
      <StudentPortalShell>{children}</StudentPortalShell>
    </RoleGuard>
  );
}

