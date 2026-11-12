import type { ReactNode } from "react";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/layout/portal-shell";

export default function TeacherPortalLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["teacher"]}>
      <PortalShell portal="teacher">{children}</PortalShell>
    </RoleGuard>
  );
}

